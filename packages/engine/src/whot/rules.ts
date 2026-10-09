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
  type CallableShape,
  type Card,
} from './deck';
import type { WhotMove, WhotOptions, WhotState, WhotView } from './state';

/**
 * Naija street rules:
 * 1 Hold On (play again) · 2 Pick Two · 5 Pick Three (defend with the same number, penalties stack)
 * 8 Suspension (skip next) · 14 General Market (everyone else picks 1, you play again)
 * 20 Whot (wild, call a shape). Forget to call "Last card" and anyone can catch you for 2.
 * You can stack several cards of the same number in one turn; each one counts: two Pick Twos is pick four,
 * two General Markets is everyone picks two, two Suspensions skip two players (never past you).
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

export const topCard = (s: Pick<WhotState, 'pile'>) => s.pile[s.pile.length - 1]!;

/** Works on a `WhotView` too, so clients can show which cards are playable. */
export function canPlay(s: Pick<WhotState, 'pending' | 'pile' | 'calledShape'>, card: Card): boolean {
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
  let whotLed = false;
  for (const card of hand) {
    if (!canPlay(s, card)) continue;
    const others = hand.filter((c) => c !== card && c.number === card.number);
    if (card.number === WHOT) {
      // Whots are interchangeable, so one lead and stacks by size cover every option.
      if (whotLed) continue;
      whotLed = true;
      for (let size = 0; size <= others.length; size++) {
        const stack = others.slice(0, size).map((c) => c.id);
        const lastCard = hand.length - 1 - size === 1;
        for (const callShape of CALLABLE_SHAPES) moves.push(playMove(player, card.id, stack, lastCard, callShape));
      }
      continue;
    }
    // Only the lead (must match) and the last card (sets the new top) matter, so the middle stays in hand order.
    for (const subset of subsets(others)) {
      const lastCard = hand.length - 1 - subset.length === 1;
      if (subset.length === 0) {
        moves.push(playMove(player, card.id, [], lastCard));
        continue;
      }
      for (const last of subset) {
        const stack = [...subset.filter((c) => c !== last), last].map((c) => c.id);
        moves.push(playMove(player, card.id, stack, lastCard));
      }
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
  const ids = [move.cardId, ...(move.stack ?? [])];
  if (new Set(ids).size !== ids.length) return fail('You no fit play one card twice');
  const cards: Card[] = [];
  for (const id of ids) {
    const card = hand.find((c) => c.id === id);
    if (!card) return fail('You no get that card');
    cards.push(card);
  }
  const card = cards[0]!;
  if (!canPlay(s, card)) return fail(s.pending ? `Defend with ${s.pending.number} or go market` : 'That card no match');
  if (cards.some((c) => c.number !== card.number)) return fail('Na only cards wey get the same number you fit stack');
  if (card.number === WHOT && !move.callShape) return fail('Call a shape for your Whot');

  const count = cards.length;
  s.hands[move.player] = hand.filter((c) => !cards.includes(c));
  s.pile.push(...cards);
  s.calledShape = card.number === WHOT ? move.callShape! : null;

  const left = s.hands[move.player]!.length;
  if (left === 0) {
    s.over = true;
    s.winners = [move.player];
    s.endReason = 'checkup';
    s.pending = null;
    s.vulnerable = null;
    return ok(s);
  }
  if (left === 1) s.vulnerable = move.lastCard ? null : move.player;
  else if (s.vulnerable === move.player) s.vulnerable = null;

  switch (card.number) {
    case HOLD_ON:
      setCurrent(s, move.player);
      break;
    case PICK_TWO:
    case PICK_THREE:
      s.pending = {
        number: card.number,
        amount: (s.pending?.amount ?? 0) + count * (card.number === PICK_TWO ? 2 : 3),
      };
      setCurrent(s, nextSeat(s, move.player, 1));
      break;
    case SUSPENSION:
      // Each 8 skips one more player, but play never goes round past you.
      setCurrent(s, nextSeat(s, move.player, Math.min(1 + count, s.players)));
      break;
    case GENERAL_MARKET:
      for (let step = 1; step < s.players; step++) {
        const other = nextSeat(s, move.player, step);
        if (!draw(s, other, count)) {
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

export const nextSeat = (s: Pick<WhotState, 'players'>, from: number, steps: number) => (from + steps) % s.players;

export const handTotal = (hand: Card[]) => hand.reduce((sum, c) => sum + cardValue(c), 0);

function playMove(player: number, cardId: string, stack: string[], lastCard: boolean, callShape?: CallableShape): WhotMove {
  const move: WhotMove = { type: 'play', player, cardId, lastCard };
  if (stack.length > 0) move.stack = stack;
  if (callShape) move.callShape = callShape;
  return move;
}

/** Every subset, in input order, smallest first. */
function subsets<T>(items: T[]): T[][] {
  const out: T[][] = [[]];
  for (const item of items) for (const prev of out.slice()) out.push([...prev, item]);
  return out.sort((a, b) => a.length - b.length);
}

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
