import type { Difficulty } from '../result';
import { pick, type Rng } from '../rng';
import { applyMove, legalMoves, type AyoMove, type AyoState } from './rules';

const DEPTH: Record<Exclude<Difficulty, 'easy'>, number> = { medium: 2, hard: 7 };

/** Ayo is perfect information, so the AI reads the full state. Returns null if it isn't `player`'s turn. */
export function chooseAyoMove(s: AyoState, player: 0 | 1, difficulty: Difficulty, rng: Rng): AyoMove | null {
  const moves = legalMoves(s, player);
  if (moves.length === 0) return null;
  if (difficulty === 'easy') return pick(moves, rng);

  let best: AyoMove[] = [];
  let bestScore = -Infinity;
  for (const move of moves) {
    const next = applyMove(s, move);
    if (!next.ok) continue;
    const score = -negamax(next.state, DEPTH[difficulty] - 1, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      best = [move];
    } else if (score === bestScore) {
      best.push(move);
    }
  }
  return pick(best, rng);
}

/** Score from the point of view of the player to move. */
function negamax(s: AyoState, depth: number, alpha: number, beta: number): number {
  const me = s.current;
  if (s.over) return s.winner === null ? 0 : s.winner === me ? 1000 : -1000;
  if (depth === 0) return s.stores[me] - s.stores[1 - me]!;

  let best = -Infinity;
  for (const move of legalMoves(s, me)) {
    const next = applyMove(s, move);
    if (!next.ok) continue;
    best = Math.max(best, -negamax(next.state, depth - 1, -beta, -alpha));
    alpha = Math.max(alpha, best);
    if (alpha >= beta) break;
  }
  return best;
}
