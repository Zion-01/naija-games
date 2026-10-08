import { describe, expect, it } from 'vitest';

import { createRng } from '../src/rng';
import {
  applyMove,
  chooseWhotMove,
  createDeck,
  initialState,
  legalMoves,
  viewFor,
  type Card,
  type WhotMove,
  type WhotState,
} from '../src/whot';
import type { Difficulty } from '../src/result';

const DECK = new Map(createDeck().map((c) => [c.id, c]));
const c = (id: string): Card => {
  const card = DECK.get(id);
  if (!card) throw new Error(`no card ${id}`);
  return card;
};

/** Builds a hand-crafted table. Cards not dealt go to the market. */
function table(opts: { hands: string[][]; top: string; current?: number; market?: string[]; calledShape?: WhotState['calledShape'] }): WhotState {
  return {
    players: opts.hands.length,
    hands: opts.hands.map((h) => h.map(c)),
    market: (opts.market ?? ['circle-3', 'circle-4', 'circle-7', 'circle-10', 'circle-11', 'circle-12', 'circle-13']).map(c),
    pile: [c(opts.top)],
    current: opts.current ?? 0,
    calledShape: opts.calledShape ?? null,
    pending: null,
    vulnerable: null,
    over: false,
    winners: [],
    endReason: null,
    counts: null,
    turn: 0,
  };
}

function play(s: WhotState, move: WhotMove): WhotState {
  const r = applyMove(s, move);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('deck', () => {
  it('has the 54 standard cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(54);
    expect(new Set(deck.map((d) => d.id)).size).toBe(54);
    expect(deck.filter((d) => d.number === 20)).toHaveLength(5);
    expect(deck.filter((d) => d.shape === 'star')).toHaveLength(7);
  });
});

describe('initialState', () => {
  it('deals hands and starts on a plain card', () => {
    for (let seed = 0; seed < 50; seed++) {
      const s = initialState({ players: 4, handSize: 6 }, seed);
      expect(s.hands.every((h) => h.length === 6)).toBe(true);
      expect([1, 2, 5, 8, 14, 20]).not.toContain(s.pile[0]!.number);
      expect(s.market.length + 24 + 1).toBe(54);
    }
  });

  it('is reproducible from the seed', () => {
    expect(initialState({ players: 2 }, 7)).toEqual(initialState({ players: 2 }, 7));
  });
});

describe('matching', () => {
  it('allows same shape, same number or Whot', () => {
    const s = table({ hands: [['circle-3', 'triangle-7', 'square-11', 'whot-20-1'], ['star-1']], top: 'circle-7' });
    const ids = legalMoves(s, 0).flatMap((m) => (m.type === 'play' ? [m.cardId] : []));
    expect(new Set(ids)).toEqual(new Set(['circle-3', 'triangle-7', 'whot-20-1']));
  });

  it('follows the called shape after a Whot', () => {
    let s = table({ hands: [['whot-20-1', 'star-3', 'cross-5'], ['star-4', 'circle-4']], top: 'circle-7' });
    s = play(s, { type: 'play', player: 0, cardId: 'whot-20-1', callShape: 'star' });
    expect(s.current).toBe(1);
    expect(applyMove(s, { type: 'play', player: 1, cardId: 'circle-4' }).ok).toBe(false);
    expect(applyMove(s, { type: 'play', player: 1, cardId: 'star-4' }).ok).toBe(true);
  });

  it('requires a shape call with Whot', () => {
    const s = table({ hands: [['whot-20-1', 'star-3'], ['star-4']], top: 'circle-7' });
    expect(applyMove(s, { type: 'play', player: 0, cardId: 'whot-20-1' })).toEqual({ ok: false, error: 'Call a shape for your Whot' });
  });

  it('rejects out-of-turn and unknown cards', () => {
    const s = table({ hands: [['circle-3'], ['circle-4']], top: 'circle-7' });
    expect(applyMove(s, { type: 'play', player: 1, cardId: 'circle-4' }).ok).toBe(false);
    expect(applyMove(s, { type: 'play', player: 0, cardId: 'circle-4' }).ok).toBe(false);
  });
});

describe('special cards', () => {
  it('Hold On lets you play again', () => {
    let s = table({ hands: [['circle-1', 'circle-3', 'star-3'], ['cross-3']], top: 'circle-7' });
    s = play(s, { type: 'play', player: 0, cardId: 'circle-1' });
    expect(s.current).toBe(0);
  });

  it('Pick Two stacks, and the loser picks the total', () => {
    let s = table({
      hands: [['circle-2', 'star-3', 'star-4'], ['triangle-2', 'cross-3', 'cross-7'], ['square-3', 'square-7']],
      top: 'circle-7',
    });
    s = play(s, { type: 'play', player: 0, cardId: 'circle-2' });
    expect(s.pending).toEqual({ number: 2, amount: 2 });
    // Only a 2 (or going to market) is allowed under Pick Two.
    expect(legalMoves(s, 1).filter((m) => m.type === 'play').map((m) => m.type === 'play' && m.cardId)).toEqual(['triangle-2']);
    s = play(s, { type: 'play', player: 1, cardId: 'triangle-2' });
    expect(s.pending).toEqual({ number: 2, amount: 4 });
    expect(s.current).toBe(2);
    s = play(s, { type: 'draw', player: 2 });
    expect(s.hands[2]).toHaveLength(6);
    expect(s.pending).toBeNull();
    expect(s.current).toBe(0);
  });

  it('Pick Three makes the next player pick three', () => {
    let s = table({ hands: [['circle-5', 'star-3'], ['cross-3', 'cross-7']], top: 'circle-7' });
    s = play(s, { type: 'play', player: 0, cardId: 'circle-5', lastCard: true });
    expect(s.pending).toEqual({ number: 5, amount: 3 });
    s = play(s, { type: 'draw', player: 1 });
    expect(s.hands[1]).toHaveLength(5);
  });

  it('Suspension skips the next player', () => {
    let s = table({ hands: [['circle-8', 'star-3'], ['cross-3'], ['square-3']], top: 'circle-7' });
    s = play(s, { type: 'play', player: 0, cardId: 'circle-8', lastCard: true });
    expect(s.current).toBe(2);
  });

  it('General Market makes everyone else pick one (4 players) and you go again', () => {
    let s = table({ hands: [['circle-14', 'star-3'], ['cross-3'], ['square-3'], ['star-4']], top: 'circle-7' });
    s = play(s, { type: 'play', player: 0, cardId: 'circle-14', lastCard: true });
    expect(s.hands.map((h) => h.length)).toEqual([1, 2, 2, 2]);
    expect(s.current).toBe(0);
  });
});

describe('last card', () => {
  it('can be caught for 2 if you forget to call it', () => {
    let s = table({ hands: [['circle-3', 'star-3'], ['cross-3', 'cross-7']], top: 'circle-7' });
    s = play(s, { type: 'play', player: 0, cardId: 'circle-3', lastCard: false });
    expect(s.vulnerable).toBe(0);
    expect(legalMoves(s, 1)).toContainEqual({ type: 'catch', player: 1, target: 0 });
    s = play(s, { type: 'catch', player: 1, target: 0 });
    expect(s.hands[0]).toHaveLength(3);
    expect(s.vulnerable).toBeNull();
  });

  it('is safe once you call it', () => {
    let s = table({ hands: [['circle-3', 'star-3'], ['cross-3']], top: 'circle-7' });
    s = play(s, { type: 'play', player: 0, cardId: 'circle-3', lastCard: true });
    expect(s.vulnerable).toBeNull();
    expect(applyMove(s, { type: 'catch', player: 1, target: 0 }).ok).toBe(false);
  });

  it('can no longer be caught once play comes back to you', () => {
    let s = table({ hands: [['circle-3', 'star-3'], ['cross-3', 'cross-7']], top: 'circle-7' });
    s = play(s, { type: 'play', player: 0, cardId: 'circle-3', lastCard: false });
    s = play(s, { type: 'draw', player: 1 });
    expect(s.current).toBe(0);
    expect(s.vulnerable).toBeNull();
  });
});

describe('ending', () => {
  it('Check up: first to empty their hand wins', () => {
    let s = table({ hands: [['circle-3'], ['cross-3']], top: 'circle-7' });
    s = play(s, { type: 'play', player: 0, cardId: 'circle-3' });
    expect(s.over).toBe(true);
    expect(s.winners).toEqual([0]);
    expect(s.endReason).toBe('checkup');
  });

  it('counts hands when the market finishes; stars count double', () => {
    let s = table({ hands: [['star-5', 'cross-1'], ['circle-10', 'cross-2']], top: 'triangle-7', market: [] });
    s = play(s, { type: 'draw', player: 0 });
    expect(s.over).toBe(true);
    expect(s.endReason).toBe('market');
    expect(s.counts).toEqual([11, 12]);
    expect(s.winners).toEqual([0]);
  });
});

describe('viewFor', () => {
  it('never shows another player their opponents’ hands', () => {
    const s = initialState({ players: 3 }, 1);
    const v = viewFor(s, 1);
    expect(v.myHand).toEqual(s.hands[1]);
    expect(JSON.stringify(v)).not.toContain(s.hands[0]![0]!.id);
    expect(v).not.toHaveProperty('hands');
    expect(v).not.toHaveProperty('market');
    expect(v.handCounts).toEqual([5, 5, 5]);
  });
});

/** Plays a full game with AIs only looking at their own views; returns the final state. */
function simulate(seed: number, levels: Difficulty[], handSize = 5): WhotState {
  const rng = createRng(seed * 31 + 1);
  let s = initialState({ players: levels.length, handSize }, seed);
  for (let i = 0; i < 2000 && !s.over; i++) {
    const move = chooseWhotMove(viewFor(s, s.current), levels[s.current]!, rng);
    if (!move) throw new Error('AI had no move on its turn');
    const r = applyMove(s, move);
    if (!r.ok) throw new Error(`seed ${seed}: ${r.error} ${JSON.stringify(move)}`);
    s = r.state;
    // Other seats get a chance to catch a forgotten "Last card".
    for (let p = 0; p < s.players && !s.over; p++) {
      if (p === s.current) continue;
      const extra = chooseWhotMove(viewFor(s, p), levels[p]!, rng);
      if (extra) s = (applyMove(s, extra) as { ok: true; state: WhotState }).state;
    }
  }
  return s;
}

describe('simulation', () => {
  it('random games always finish and conserve the 54 cards', () => {
    for (let seed = 0; seed < 300; seed++) {
      const players = 2 + (seed % 3);
      const s = simulate(seed, Array(players).fill('easy'));
      expect(s.over).toBe(true);
      const total = s.hands.flat().length + s.market.length + s.pile.length;
      expect(total).toBe(54);
    }
  });

  it('medium beats easy most of the time', () => {
    let wins = 0;
    const N = 200;
    for (let seed = 0; seed < N; seed++) {
      const levels: Difficulty[] = seed % 2 ? ['medium', 'easy'] : ['easy', 'medium'];
      const s = simulate(1000 + seed, levels);
      const medium = levels.indexOf('medium');
      if (s.winners.includes(medium)) wins += 1 / s.winners.length;
    }
    expect(wins / N).toBeGreaterThan(0.6);
  });

  it('hard beats medium more often than not', () => {
    let wins = 0;
    const N = 60;
    for (let seed = 0; seed < N; seed++) {
      const levels: Difficulty[] = seed % 2 ? ['hard', 'medium'] : ['medium', 'hard'];
      const s = simulate(5000 + seed, levels);
      if (s.winners.includes(levels.indexOf('hard'))) wins += 1 / s.winners.length;
    }
    expect(wins / N).toBeGreaterThan(0.5);
  }, 180_000);
});
