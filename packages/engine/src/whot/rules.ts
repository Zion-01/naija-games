import { fail, ok, type MoveResult } from '../result';
import { createRng, shuffle } from '../rng';
import {
  CALLABLE_SHAPES,
  GENERAL_MARKET,
  HOLD_ON,
  PICK_THREE,
  PICK_TWO,
  SUSPENSION,
  WHOT,
  cardValue,
  createDeck,
  isSpecial,
  type Card,
} from './deck';
import type { WhotMove, WhotOptions, WhotState, WhotView } from './state';

/**
 * Naija street rules:
 * 1 Hold On (play again) · 2 Pick Two · 5 Pick Three (defend with the same number, penalties stack)
 * 8 Suspension (skip next) · 14 General Market (everyone else picks 1, you play again)
 * 20 Whot (wild, call a shape). Forget to call "Last card" and anyone can catch you for 2.
 * If someone has to draw from an empty market, hands are counted: lowest total wins, stars double.
 */
export function initialState(opts: WhotOptions & { firstPlayer?: number }, seed: number): WhotState {
  const { players, handSize = 5, firstPlayer = 0 } = opts;
  if (players < 2 || players > 4) throw new Error('Whot needs 2–4 players');
  if (handSize < 3 || handSize > 7) throw new Error('handSize must be 3–7');

  const market = shuffle(createDeck(), createRng(seed));
  const hands: Card[][] = Array.from({ length: players }, () => []);
  for (let round = 0; round < handSize; round++) {
    for (let p = 0; p < players; p++) hands[p]!.push(market.shift()!);
  }
  // Start on a plain card so nobody begins under a penalty.
  const startIndex = market.findIndex((c) => !isSpecial(c));
  const [start] = market.splice(startIndex, 1);

  return {
    players,
    hands,
    market,
    pile: [start!],
    current: firstPlayer % players,
    calledShape: null,
    pending: null,
    vulnerable: null,
    over: false,
    winners: [],
    endReason: null,
    counts: null,
    turn: 0,
  };
}

export const topCard = (s: WhotState) => s.pile[s.pile.length - 1]!;

export function canPlay(s: WhotState, card: Card): boolean {
  if (s.pending) return card.number === s.pending.number;
  if (card.number === WHOT) return true;
  const top = topCard(s);
  if (top.number === WHOT) return card.shape === s.calledShape;
  return card.shape === top.shape || card.number === top.number;
}

export function legalMoves(s: WhotState, player: number): WhotMove[] {
  if (s.over) return [];
  const moves: WhotMove[] = [];
  if (s.vulnerable !== null && s.vulnerable !== player && player >= 0) {
    moves.push({ type: 'catch', player, target: s.vulnerable });
  }
  if (player !== s.current) return moves;

  const hand = s.hands[player]!;
  const lastCard = hand.length === 2;
  for (const card of hand) {
    if (!canPlay(s, card)) continue;
    if (card.number === WHOT) {
      for (const callShape of CALLABLE_SHAPES) moves.push({ type: 'play', player, cardId: card.id, callShape, lastCard });
    } else {
      moves.push({ type: 'play', player, cardId: card.id, lastCard });
    }
  }
  moves.push({ type: 'draw', player });
  return moves;
}

export function applyMove(state: WhotState, move: WhotMove): MoveResult<WhotState> {
  if (state.over) return fail('Game don finish');
  if (move.player < 0 || move.player >= state.players) return fail('Unknown player');
  const s = clone(state);

  if (move.type === 'catch') {
    if (move.target === move.player) return fail('You no fit catch yourself');
    if (s.vulnerable !== move.target || s.hands[move.target]!.length !== 1) return fail('Nobody to catch');
    s.vulnerable = null;
    if (!draw(s, move.target, 2)) endByCount(s);
    return ok(s);
  }

  if (move.player !== s.current) return fail('No be your turn');

  if (move.type === 'draw') {
    const amount = s.pending ? s.pending.amount : 1;
    s.pending = null;
    if (!draw(s, move.player, amount)) {
      endByCount(s);
      return ok(s);
    }
    if (s.vulnerable === move.player) s.vulnerable = null;
    setCurrent(s, nextSeat(s, move.player, 1));
    return ok(s);
  }

  const hand = s.hands[move.player]!;
  const index = hand.findIndex((c) => c.id === move.cardId);
  if (index === -1) return fail('You no get that card');
  const card = hand[index]!;
  if (!canPlay(s, card)) return fail(s.pending ? `Defend with ${s.pending.number} or go market` : 'That card no match');
  if (card.number === WHOT && !move.callShape) return fail('Call a shape for your Whot');

  hand.splice(index, 1);
  s.pile.push(card);
  s.calledShape = card.number === WHOT ? move.callShape! : null;

  if (hand.length === 0) {
    s.over = true;
    s.winners = [move.player];
    s.endReason = 'checkup';
    s.pending = null;
    s.vulnerable = null;
    return ok(s);
  }
  if (hand.length === 1) s.vulnerable = move.lastCard ? null : move.player;
  else if (s.vulnerable === move.player) s.vulnerable = null;

  switch (card.number) {
    case HOLD_ON:
      setCurrent(s, move.player);
      break;
    case PICK_TWO:
    case PICK_THREE:
      s.pending = {
        number: card.number,
        amount: (s.pending?.amount ?? 0) + (card.number === PICK_TWO ? 2 : 3),
      };
      setCurrent(s, nextSeat(s, move.player, 1));
      break;
    case SUSPENSION:
      setCurrent(s, nextSeat(s, move.player, 2));
      break;
    case GENERAL_MARKET:
      for (let step = 1; step < s.players; step++) {
        const other = nextSeat(s, move.player, step);
        if (!draw(s, other, 1)) {
          endByCount(s);
          return ok(s);
        }
        if (s.vulnerable === other) s.vulnerable = null;
      }
      setCurrent(s, move.player);
      break;
    default:
      setCurrent(s, nextSeat(s, move.player, 1));
  }
  return ok(s);
}

export function viewFor(s: WhotState, me: number): WhotView {
  const { hands, market, ...rest } = s;
  return {
    ...rest,
    pile: s.pile.slice(),
    me,
    myHand: me >= 0 ? hands[me]!.slice() : [],
    handCounts: hands.map((h) => h.length),
    marketCount: market.length,
    top: topCard(s),
    revealedHands: s.over ? hands.map((h) => h.slice()) : null,
  };
}

export const nextSeat = (s: WhotState, from: number, steps: number) => (from + steps) % s.players;

export const handTotal = (hand: Card[]) => hand.reduce((sum, c) => sum + cardValue(c), 0);

/** Draws up to `n` cards. Returns false if the market ran out before all were drawn. */
function draw(s: WhotState, player: number, n: number): boolean {
  for (let i = 0; i < n; i++) {
    const card = s.market.shift();
    if (!card) return false;
    s.hands[player]!.push(card);
  }
  return true;
}

function endByCount(s: WhotState) {
  s.counts = s.hands.map(handTotal);
  const low = Math.min(...s.counts);
  s.winners = s.counts.flatMap((c, i) => (c === low ? [i] : []));
  s.over = true;
  s.endReason = 'market';
  s.pending = null;
  s.vulnerable = null;
}

function setCurrent(s: WhotState, player: number) {
  // Once play comes back round to them, the window to catch them has closed.
  if (s.vulnerable === player && s.current !== player) s.vulnerable = null;
  s.current = player;
  s.turn++;
}

function clone(s: WhotState): WhotState {
  return {
    ...s,
    hands: s.hands.map((h) => h.slice()),
    market: s.market.slice(),
    pile: s.pile.slice(),
    pending: s.pending && { ...s.pending },
    winners: s.winners.slice(),
    counts: s.counts && s.counts.slice(),
  };
}
