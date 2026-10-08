import { describe, expect, it } from 'vitest';

import { createRng } from '../src/rng';
import { TOTAL_SEEDS, applyMove, chooseAyoMove, initialState, legalMoves, sow, type AyoState } from '../src/ayo';
import type { Difficulty } from '../src/result';

function board(pits: number[], opts: Partial<AyoState> = {}): AyoState {
  const used = pits.reduce((a, b) => a + b, 0);
  const stores = opts.stores ?? [Math.floor((TOTAL_SEEDS - used) / 2), Math.ceil((TOTAL_SEEDS - used) / 2)];
  return { ...initialState(), pits, stores, ...opts };
}

function move(s: AyoState, pit: number): AyoState {
  const r = applyMove(s, { type: 'sow', player: s.current, pit });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const seeds = (s: AyoState) => s.pits.reduce((a, b) => a + b, 0) + s.stores[0] + s.stores[1];

describe('sowing', () => {
  it('sows one seed per pit counter-clockwise', () => {
    const s = move(initialState(), 2);
    expect(s.pits).toEqual([4, 4, 0, 5, 5, 5, 5, 4, 4, 4, 4, 4]);
    expect(s.current).toBe(1);
  });

  it('skips the starting pit on a full lap', () => {
    expect(sow([0, 0, 0, 0, 0, 13, 0, 0, 0, 0, 0, 0], 5)).toEqual([6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 6, 7]);
  });

  it('rejects empty pits, the other side, and out of turn', () => {
    const s = board([0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(applyMove(s, { type: 'sow', player: 0, pit: 0 }).ok).toBe(false);
    expect(applyMove(s, { type: 'sow', player: 0, pit: 7 }).ok).toBe(false);
    expect(applyMove(s, { type: 'sow', player: 1, pit: 7 }).ok).toBe(false);
  });
});

describe('capturing', () => {
  it('captures a 2 or 3 and chains backwards', () => {
    // Pit 5 has 3 seeds → lands on 6, 7, 8. 6:1→2, 7:2→3, 8:1→2 → chain 8, 7, 6.
    const s = move(board([4, 4, 4, 4, 4, 3, 1, 2, 1, 5, 5, 5]), 5);
    expect(s.lastMove?.captured).toEqual([8, 7, 6]);
    expect(s.pits.slice(6, 9)).toEqual([0, 0, 0]);
    expect(seeds(s)).toBe(TOTAL_SEEDS);
  });

  it('stops the chain at a pit that is not 2 or 3', () => {
    const s = move(board([4, 4, 4, 4, 4, 3, 1, 5, 1, 5, 5, 5]), 5);
    expect(s.lastMove?.captured).toEqual([8]);
  });

  it('does not capture on your own side', () => {
    const s = move(board([1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]), 0);
    expect(s.lastMove?.captured).toEqual([]);
  });

  it('grand slam: capturing every opponent seed captures nothing', () => {
    const before = board([1, 0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0], { stores: [21, 22] });
    const s = move(before, 5);
    expect(s.pits.slice(6, 8)).toEqual([2, 2]);
    expect(s.stores).toEqual([21, 22]);
    expect(s.over).toBe(false);
  });
});

describe('feeding', () => {
  it('only allows moves that reach an empty opponent', () => {
    const s = board([0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0], { stores: [20, 25] });
    expect(legalMoves(s, 0).map((m) => m.pit)).toEqual([5]);
  });

  it('ends the game and gives the seeds to a player who cannot feed', () => {
    // Player 1 just emptied their side; player 0 can't reach it.
    const s = move(board([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], { stores: [23, 23], current: 1 }), 11);
    expect(s.over).toBe(true);
    expect(s.stores).toEqual([25, 23]);
    expect(s.winner).toBe(0);
  });
});

describe('ending', () => {
  it('wins on more than 24 seeds', () => {
    const s = move(board([0, 0, 0, 0, 0, 3, 1, 2, 1, 2, 0, 0], { stores: [18, 21] }), 5);
    expect(s.stores[0]).toBeGreaterThan(24);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(0);
  });
});

function simulate(seed: number, levels: [Difficulty, Difficulty]): AyoState {
  const rng = createRng(seed);
  let s = initialState({ firstPlayer: (seed % 2) as 0 | 1 });
  for (let i = 0; i < 1000 && !s.over; i++) {
    const m = chooseAyoMove(s, s.current, levels[s.current], rng);
    expect(m).not.toBeNull();
    s = move(s, m!.pit);
  }
  expect(seeds(s)).toBe(TOTAL_SEEDS);
  return s;
}

describe('simulation', () => {
  it('random games always finish and keep all 48 seeds', () => {
    for (let seed = 0; seed < 300; seed++) expect(simulate(seed, ['easy', 'easy']).over).toBe(true);
  });

  it('medium beats easy, hard beats medium', () => {
    const score = (strong: Difficulty, weak: Difficulty, n: number) => {
      let wins = 0;
      for (let seed = 0; seed < n; seed++) {
        const levels: [Difficulty, Difficulty] = seed % 2 ? [strong, weak] : [weak, strong];
        const s = simulate(100 + seed, levels);
        if (s.winner === levels.indexOf(strong)) wins++;
        else if (s.winner === null) wins += 0.5;
      }
      return wins / n;
    };
    expect(score('medium', 'easy', 100)).toBeGreaterThan(0.75);
    expect(score('hard', 'medium', 20)).toBeGreaterThan(0.6);
  }, 120_000);
});
