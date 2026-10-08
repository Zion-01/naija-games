import { fail, ok, type MoveResult } from '../result';

/**
 * Ayo Olopon. Pits 0–5 belong to player 0, pits 6–11 to player 1; sowing runs 0→11→0 (counter-clockwise).
 * - Sow one seed per pit, skipping the starting pit on a lap.
 * - If the last seed makes an opponent pit 2 or 3, capture it and keep capturing backwards while pits are 2 or 3.
 * - A move that would capture every opponent seed captures nothing.
 * - If your opponent has no seeds you must feed them; if you can't, you take all the seeds left.
 * - More than 24 seeds wins. After 100 moves without a capture, each side keeps what is on their side.
 */
export const PITS = 12;
export const SEEDS_PER_PIT = 4;
export const TOTAL_SEEDS = PITS * SEEDS_PER_PIT;
export const STALL_LIMIT = 100;

export type AyoState = {
  pits: number[];
  stores: [number, number];
  current: 0 | 1;
  over: boolean;
  winner: 0 | 1 | null; // null when over = draw
  /** Moves since the last capture, used to end endless shuffling. */
  sinceCapture: number;
  lastMove: { player: 0 | 1; pit: number; captured: number[] } | null;
  turn: number;
};

export type AyoMove = { type: 'sow'; player: 0 | 1; pit: number };

export function initialState(opts: { firstPlayer?: 0 | 1 } = {}): AyoState {
  return {
    pits: Array(PITS).fill(SEEDS_PER_PIT),
    stores: [0, 0],
    current: opts.firstPlayer ?? 0,
    over: false,
    winner: null,
    sinceCapture: 0,
    lastMove: null,
    turn: 0,
  };
}

export const ownerOf = (pit: number): 0 | 1 => (pit < 6 ? 0 : 1);
export const sideOf = (player: 0 | 1) => (player === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11]);
export const seedsOnSide = (s: AyoState, player: 0 | 1) => sideOf(player).reduce((n, p) => n + s.pits[p]!, 0);

export function legalMoves(s: AyoState, player: 0 | 1): AyoMove[] {
  if (s.over || player !== s.current) return [];
  const moves = sideOf(player)
    .filter((pit) => s.pits[pit]! > 0)
    .map((pit): AyoMove => ({ type: 'sow', player, pit }));
  const opponent = (1 - player) as 0 | 1;
  if (seedsOnSide(s, opponent) > 0) return moves;
  // Opponent is empty: only moves that reach their side are allowed.
  return moves.filter((m) => sow(s.pits, m.pit).some((pit) => ownerOf(pit) === opponent));
}

export function applyMove(state: AyoState, move: AyoMove): MoveResult<AyoState> {
  if (state.over) return fail('Game don finish');
  if (move.player !== state.current) return fail('No be your turn');
  if (ownerOf(move.pit) !== move.player) return fail('That pit no be your own');
  if (state.pits[move.pit] === 0) return fail('That pit empty');
  if (!legalMoves(state, move.player).some((m) => m.pit === move.pit)) return fail('You must feed your opponent');

  const s: AyoState = { ...state, pits: state.pits.slice(), stores: [...state.stores] };
  const touched = sow(s.pits, move.pit);
  const pits = s.pits;
  pits[move.pit] = 0;
  for (const pit of touched) pits[pit]!++;

  const opponent = (1 - move.player) as 0 | 1;
  const captured: number[] = [];
  for (let pit = touched[touched.length - 1]!; ownerOf(pit) === opponent; pit = (pit + PITS - 1) % PITS) {
    if (pits[pit] !== 2 && pits[pit] !== 3) break;
    captured.push(pit);
  }
  const take = captured.reduce((n, p) => n + pits[p]!, 0);
  // Grand slam: capturing every opponent seed is not allowed, so nothing is taken.
  if (take > 0 && take < seedsOnSide(s, opponent)) {
    for (const pit of captured) pits[pit] = 0;
    s.stores[move.player] += take;
    s.sinceCapture = 0;
    s.lastMove = { player: move.player, pit: move.pit, captured };
  } else {
    s.sinceCapture++;
    s.lastMove = { player: move.player, pit: move.pit, captured: [] };
  }

  s.current = opponent;
  s.turn++;
  checkEnd(s);
  return ok(s);
}

/** The pits that receive a seed when sowing from `from`, in order (a pit can repeat on long laps). */
export function sow(pits: readonly number[], from: number): number[] {
  const touched: number[] = [];
  let pit = from;
  for (let left = pits[from]!; left > 0; ) {
    pit = (pit + 1) % PITS;
    if (pit === from) continue;
    touched.push(pit);
    left--;
  }
  return touched;
}

function checkEnd(s: AyoState) {
  const half = TOTAL_SEEDS / 2;
  if (s.stores[0] > half || s.stores[1] > half) return finish(s);
  if (s.sinceCapture >= STALL_LIMIT) {
    for (const player of [0, 1] as const) {
      s.stores[player] += seedsOnSide(s, player);
      for (const pit of sideOf(player)) s.pits[pit] = 0;
    }
    return finish(s);
  }
  if (legalMoves(s, s.current).length === 0) {
    // Can't move (or can't feed): the player to move takes what's left.
    s.stores[s.current] += s.pits.reduce((a, b) => a + b, 0);
    s.pits.fill(0);
    finish(s);
  }
}

function finish(s: AyoState) {
  s.over = true;
  s.winner = s.stores[0] === s.stores[1] ? null : s.stores[0] > s.stores[1] ? 0 : 1;
}
