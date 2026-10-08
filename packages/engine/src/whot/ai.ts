import type { Difficulty } from '../result';
import { createRng, pick, shuffle, type Rng } from '../rng';
import { GENERAL_MARKET, HOLD_ON, PICK_THREE, PICK_TWO, SUSPENSION, WHOT, cardValue, createDeck, type Card } from './deck';
import { applyMove, legalMoves, nextSeat } from './rules';
import type { WhotMove, WhotState, WhotView } from './state';

/**
 * Picks a move for the seat in `view`, or null when that seat has nothing to do right now.
 * The AI only ever sees the redacted view, so it can't cheat.
 */
export function chooseWhotMove(view: WhotView, difficulty: Difficulty, rng: Rng): WhotMove | null {
  if (view.over || view.me < 0) return null;
  const world = determinize(view, rng);
  if (difficulty === 'easy') return easyMove(world, view.me, rng);
  if (difficulty === 'medium' || view.me !== view.current) return mediumMove(world, view.me, rng);
  return hardMove(view, rng);
}

function easyMove(s: WhotState, me: number, rng: Rng): WhotMove | null {
  const moves = legalMoves(s, me);
  const caught = moves.find((m) => m.type === 'catch');
  if (caught && rng() < 0.4) return caught;
  if (me !== s.current) return null;
  const plays = moves.filter((m) => m.type === 'play');
  if (plays.length === 0) return { type: 'draw', player: me };
  const move = pick(plays, rng);
  // Easy AI often forgets to call "Last card".
  return move.type === 'play' && move.lastCard ? { ...move, lastCard: rng() > 0.4 } : move;
}

/** Heuristic player, also used for Monte Carlo rollouts. */
function mediumMove(s: WhotState, me: number, rng: Rng): WhotMove | null {
  const moves = legalMoves(s, me);
  const caught = moves.find((m) => m.type === 'catch');
  if (caught) return caught;
  if (me !== s.current) return null;
  const plays = moves.filter((m): m is Extract<WhotMove, { type: 'play' }> => m.type === 'play');
  if (plays.length === 0) return { type: 'draw', player: me };

  const hand = s.hands[me]!;
  const nextCount = s.hands[nextSeat(s, me, 1)]!.length;
  const onlyWhots = plays.every((m) => cardOf(hand, m.cardId).number === WHOT);

  let best: WhotMove = plays[0]!;
  let bestScore = -Infinity;
  for (const move of plays) {
    const card = cardOf(hand, move.cardId);
    const rest = hand.filter((c) => c.id !== card.id);
    let score = cardValue(card) * 0.5;

    switch (card.number) {
      case WHOT:
        score -= onlyWhots ? 0 : 40;
        score += 10 * rest.filter((c) => c.shape === move.callShape).length;
        break;
      case PICK_TWO:
      case PICK_THREE:
        score += s.pending ? 100 : nextCount <= 2 ? 40 : -10;
        break;
      case SUSPENSION:
        score += nextCount <= 2 ? 35 : 5;
        break;
      case HOLD_ON:
      case GENERAL_MARKET:
        score += rest.length > 0 ? 15 + (card.number === GENERAL_MARKET ? 5 * (s.players - 1) : 0) : 0;
        break;
    }
    // Keep options open: prefer leaving cards that can follow the new top.
    score += 3 * rest.filter((c) => c.shape === card.shape || c.number === card.number).length;
    score += rng() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

const SAMPLES = 64;
const MAX_ROLLOUT = 400;

/** Flat Monte Carlo over sampled deals of the hidden cards, rolled out with the medium policy. */
function hardMove(view: WhotView, rng: Rng): WhotMove | null {
  const me = view.me;
  const candidates = legalMoves(determinize(view, rng), me);
  if (candidates.length <= 1) return candidates[0] ?? null;

  // Every candidate is judged on the same deals and dice (common random numbers), so the comparison is fair.
  const worlds = Array.from({ length: SAMPLES }, () => ({ state: determinize(view, rng), seed: Math.floor(rng() * 2 ** 32) }));
  let best = candidates[0]!;
  let bestScore = -Infinity;
  for (const move of candidates) {
    let score = 0;
    for (const world of worlds) {
      const result = applyMove(world.state, move);
      if (result.ok) score += rollout(result.state, me, createRng(world.seed));
    }
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function rollout(start: WhotState, me: number, rng: Rng): number {
  let s = start;
  for (let step = 0; step < MAX_ROLLOUT && !s.over; step++) {
    let move: WhotMove | null = null;
    for (let p = 0; p < s.players && !move; p++) {
      if (p !== s.current && s.vulnerable !== null && s.vulnerable !== p) move = { type: 'catch', player: p, target: s.vulnerable };
    }
    move ??= mediumMove(s, s.current, rng);
    const result = applyMove(s, move!);
    if (!result.ok) break;
    s = result.state;
  }
  if (!s.over) return 1 / (1 + s.hands[me]!.length); // unfinished: fewer cards is better
  return s.winners.includes(me) ? 1 / s.winners.length : 0;
}

/** Builds a full game state consistent with what `view` can see, dealing unseen cards at random. */
function determinize(view: WhotView, rng: Rng): WhotState {
  const seen = new Set([...view.myHand, ...view.pile].map((c) => c.id));
  const unseen = shuffle(createDeck().filter((c) => !seen.has(c.id)), rng);
  const hands = view.handCounts.map((count, p) => (p === view.me ? view.myHand.slice() : unseen.splice(0, count)));
  const { me: _me, myHand: _h, handCounts: _c, marketCount: _m, top: _t, revealedHands: _r, ...rest } = view;
  return { ...rest, pile: view.pile.slice(), hands, market: unseen };
}

const cardOf = (hand: Card[], id: string) => hand.find((c) => c.id === id)!;
