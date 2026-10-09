import { ayo, whot, type Difficulty, type MoveResult, type Rng } from '@naija/engine';
import { parseAyoMove, parseWhotMove, type GameId, type WhotRoomOptions } from '@naija/online';

/** What a `Match` needs from a game. Both games go through the same engine contract. */
export type GameRules<S, M, V> = {
  id: GameId;
  seats: number;
  /** Deals a new game. The first player rotates each round so nobody always starts. */
  create(seed: number, round: number): S;
  apply(s: S, move: M): MoveResult<S>;
  current(s: S): number;
  over(s: S): boolean;
  view(s: S, seat: number): V;
  parseMove(raw: unknown, seat: number): M | null;
  /** The move the server plays for a seat whose turn it is (and the AI only sees that seat's view). */
  choose(s: S, seat: number, difficulty: Difficulty, rng: Rng): M | null;
  /** An out-of-turn move a computer seat wants to make right now, like catching a forgotten "Last card". */
  react?(s: S, seat: number, rng: Rng): M | null;
  /** Identifies the moment `react` is asked about, so each computer seat decides only once per chance. */
  reactKey?(s: S): string | null;
};

export type AnyRules = GameRules<any, any, any>;

export function whotRules(opts: Partial<WhotRoomOptions> = {}): GameRules<whot.WhotState, whot.WhotMove, whot.WhotView> {
  const players = clampInt(opts.players, 2, 4, 2);
  const handSize = clampInt(opts.handSize, 5, 6, 5);
  return {
    id: 'whot',
    seats: players,
    create: (seed, round) => whot.initialState({ players, handSize, firstPlayer: round % players }, seed),
    apply: whot.applyMove,
    current: (s) => s.current,
    over: (s) => s.over,
    view: whot.viewFor,
    parseMove: (raw, seat) => parseWhotMove(raw, seat, players),
    choose: (s, seat, difficulty, rng) => whot.chooseWhotMove(whot.viewFor(s, seat), difficulty, rng),
    react(s, seat, rng) {
      if (s.vulnerable === null || seat === s.vulnerable || seat === s.current) return null;
      const move = whot.chooseWhotMove(whot.viewFor(s, seat), 'medium', rng);
      return move?.type === 'catch' ? move : null;
    },
    reactKey: (s) => (s.vulnerable === null ? null : `${s.turn}:${s.vulnerable}`),
  };
}

export function ayoRules(): GameRules<ayo.AyoState, ayo.AyoMove, ayo.AyoState> {
  return {
    id: 'ayo',
    seats: 2,
    create: (_seed, round) => ayo.initialState({ firstPlayer: (round % 2) as 0 | 1 }),
    apply: ayo.applyMove,
    current: (s) => s.current,
    over: (s) => s.over,
    // Ayo has no hidden information, so every seat (and every spectator) sees the whole board.
    view: (s) => s,
    parseMove: parseAyoMove,
    choose: (s, seat, difficulty, rng) => ayo.chooseAyoMove(s, seat as 0 | 1, difficulty, rng),
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  return typeof v === 'number' && Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
