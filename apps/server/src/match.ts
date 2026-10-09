import { createRng, type Difficulty, type Rng } from '@naija/engine';
import {
  MAX_SPECTATORS,
  TURN_SECONDS,
  cleanNickname,
  type JoinOptions,
  type RoomStatus,
  type RoomSummary,
  type SeatInfo,
  type Snapshot,
} from '@naija/online';
import type { GameRules } from './games';

export type Seat = {
  name: string;
  kind: 'human' | 'ai';
  host: boolean;
  /** The device secret of the human who owns this seat. Kept after a computer takeover so they can reclaim it. */
  guestId: string | null;
  /** The connected client in this seat, if any. */
  sessionId: string | null;
  connected: boolean;
};

export type MatchOptions = {
  /** Delay before a computer seat moves, so humans can follow. */
  aiDelayMs?: number;
  /** Override the per-game turn timer (tests). */
  turnMs?: number;
  /** Moves allowed per client per `rateWindowMs`. */
  rateLimit?: number;
  rateWindowMs?: number;
  now?: () => number;
};

const AI_NAMES = ['Mama Put', 'Oga Tunde', 'Aunty Bisi', 'Baba Ibeji'];

/**
 * One private room's game, independent of Colyseus so it can be unit-tested with fake timers.
 * The server is authoritative: every move goes through the engine, and each client only ever receives
 * `snapshotFor(sessionId)`, built from the engine's redacted view for that client's seat.
 */
export class Match<S, M, V> {
  status: RoomStatus = 'waiting';
  readonly seats: (Seat | null)[];
  readonly spectators = new Map<string, string>();
  state: S | null = null;
  last: M | null = null;
  moves = 0;
  round = 0;
  deadline: number | null = null;
  readonly rematch = new Set<number>();

  private readonly rng: Rng;
  private readonly aiDelayMs: number;
  private readonly turnMs: number;
  private readonly rateLimit: number;
  private readonly rateWindowMs: number;
  private readonly now: () => number;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimerKey = '';
  private readonly reactTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly asked = new Set<string>();
  private readonly recentMoves = new Map<string, number[]>();

  constructor(
    readonly code: string,
    readonly rules: GameRules<S, M, V>,
    private readonly seed: number,
    private readonly onChange: () => void,
    opts: MatchOptions = {},
  ) {
    this.seats = Array.from({ length: rules.seats }, () => null);
    this.rng = createRng(seed ^ 0x5eed);
    this.aiDelayMs = opts.aiDelayMs ?? 900;
    this.turnMs = opts.turnMs ?? TURN_SECONDS[rules.id] * 1000;
    this.rateLimit = opts.rateLimit ?? 10;
    this.rateWindowMs = opts.rateWindowMs ?? 2000;
    this.now = opts.now ?? Date.now;
  }

  seatOf(sessionId: string) {
    return this.seats.findIndex((s) => s?.sessionId === sessionId);
  }

  get host(): Seat | null {
    return this.seats.find((s) => s?.host) ?? null;
  }

  /** Seats a joining client, gives a returning player their seat back, or lets them watch. Throws a pidgin message if the room is full. */
  join(sessionId: string, opts: Partial<JoinOptions> = {}): number {
    const name = cleanNickname(opts.nickname);
    const guestId = typeof opts.guestId === 'string' && opts.guestId.length >= 8 && opts.guestId.length <= 64 ? opts.guestId : null;

    const mine = guestId ? this.seats.findIndex((s) => s?.guestId === guestId) : -1;
    if (mine >= 0) {
      Object.assign(this.seats[mine]!, { sessionId, connected: true, kind: 'human', name });
      this.changed();
      return mine;
    }

    const open = this.seats.indexOf(null);
    if (!opts.spectate && this.status === 'waiting' && open >= 0) {
      this.seats[open] = { name, kind: 'human', host: !this.host, guestId, sessionId, connected: true };
      if (!this.seats.includes(null)) this.begin();
      else this.changed();
      return open;
    }

    if (this.spectators.size >= MAX_SPECTATORS) throw new Error('Room don full');
    this.spectators.set(sessionId, name);
    this.changed();
    return -1;
  }

  /** The client's connection dropped; they may still come back. Their turn timer keeps running. */
  drop(sessionId: string) {
    const seat = this.seats[this.seatOf(sessionId)];
    if (!seat) return;
    seat.connected = false;
    this.changed();
  }

  reconnect(sessionId: string) {
    const seat = this.seats[this.seatOf(sessionId)];
    if (!seat) return;
    seat.connected = true;
    this.changed();
  }

  /** The client is gone for good (left, or didn't come back in time). Mid-game, the computer takes their seat. */
  leave(sessionId: string) {
    if (this.spectators.delete(sessionId)) return this.changed();
    const index = this.seatOf(sessionId);
    const seat = this.seats[index];
    if (!seat) return;

    if (this.status === 'waiting') {
      this.seats[index] = null;
      if (seat.host) {
        const next = this.seats.find((s) => s?.kind === 'human');
        if (next) next.host = true;
      }
    } else {
      Object.assign(seat, { sessionId: null, connected: false, kind: 'ai' });
      this.rematch.delete(index);
      this.maybeRematch();
    }
    this.changed();
  }

  /** Host only: fill open seats with the computer and deal. */
  start(sessionId: string): string | null {
    const seat = this.seats[this.seatOf(sessionId)];
    if (!seat?.host) return 'Na only the host fit start';
    if (this.status !== 'waiting') return null;
    let ai = 0;
    for (let i = 0; i < this.seats.length; i++) {
      if (this.seats[i]) continue;
      this.seats[i] = { name: AI_NAMES[ai++ % AI_NAMES.length]!, kind: 'ai', host: false, guestId: null, sessionId: null, connected: true };
    }
    this.begin();
    return null;
  }

  /** Returns an error line for the sender, or null if the move was played. */
  move(sessionId: string, raw: unknown): string | null {
    const seat = this.seatOf(sessionId);
    if (seat < 0) return 'You dey watch. Wait for the next game.';
    if (this.status !== 'playing' || !this.state) return 'Game never start';
    if (!this.allowMove(sessionId)) return 'Easy! No rush am.';
    const move = this.rules.parseMove(raw, seat);
    if (!move) return 'That move no make sense';
    return this.play(move);
  }

  requestRematch(sessionId: string) {
    const seat = this.seatOf(sessionId);
    if (seat < 0 || this.status !== 'over') return;
    this.rematch.add(seat);
    if (!this.maybeRematch()) this.changed();
  }

  snapshotFor(sessionId: string): Snapshot {
    const you = this.seatOf(sessionId);
    return {
      game: this.rules.id,
      code: this.code,
      status: this.status,
      seats: this.seats.map((s): SeatInfo | null => s && { name: s.name, kind: s.kind, connected: s.connected, host: s.host }),
      you,
      spectators: this.spectators.size,
      view: (this.state ? this.rules.view(this.state, you) : null) as Snapshot['view'],
      last: this.last as Snapshot['last'],
      moves: this.moves,
      deadline: this.deadline,
      rematch: [...this.rematch],
      round: this.round,
      now: this.now(),
    };
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      game: this.rules.id,
      host: this.host?.name ?? this.seats.find(Boolean)?.name ?? 'Your guy',
      seats: this.seats.length,
      filled: this.seats.filter(Boolean).length,
      status: this.status,
    };
  }

  dispose() {
    this.clearTimers();
  }

  private begin() {
    this.state = this.rules.create((this.seed + this.round * 7919) >>> 0, this.round);
    this.status = 'playing';
    this.last = null;
    this.moves = 0;
    this.rematch.clear();
    this.asked.clear();
    this.changed();
  }

  private maybeRematch(): boolean {
    if (this.status !== 'over') return false;
    const humans = this.seats.flatMap((s, i) => (s?.kind === 'human' ? [i] : []));
    if (humans.length === 0 || !humans.every((i) => this.rematch.has(i))) return false;
    this.round++;
    this.begin();
    return true;
  }

  private play(move: M): string | null {
    if (!this.state || this.status !== 'playing') return 'Game never start';
    const result = this.rules.apply(this.state, move);
    if (!result.ok) return result.error;
    this.state = result.state;
    this.last = move;
    this.moves++;
    if (this.rules.over(result.state)) this.status = 'over';
    this.changed();
    return null;
  }

  private changed() {
    this.schedule();
    this.onChange();
  }

  /** Arms the turn timer (computer move or human timeout) and lets computer seats react out of turn. */
  private schedule() {
    const state = this.state;
    if (!state || this.status !== 'playing') {
      this.clearTimers();
      this.deadline = null;
      return;
    }

    const key = this.rules.reactKey?.(state);
    if (key && this.rules.react) {
      this.seats.forEach((seat, i) => {
        const asked = `${this.round}:${key}:${i}`;
        if (seat?.kind !== 'ai' || this.asked.has(asked)) return;
        this.asked.add(asked);
        const move = this.rules.react!(state, i, this.rng);
        if (!move) return;
        const timer = setTimeout(() => {
          this.reactTimers.delete(timer);
          this.play(move); // Stale by now (someone else caught first)? The engine refuses it, which is fine.
        }, 500 + this.rng() * 700);
        this.reactTimers.add(timer);
      });
    }

    // Keep the running clock if it's still the same turn for the same kind of player (e.g. after a catch).
    const current = this.rules.current(state);
    const seat = this.seats[current]!;
    const turnKey = `${this.round}:${(state as { turn?: number }).turn}:${current}:${seat.kind}`;
    if (this.turnTimer && turnKey === this.turnTimerKey) return;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimerKey = turnKey;

    const human = seat.kind === 'human';
    const delay = human ? this.turnMs : this.aiDelayMs;
    this.deadline = human ? this.now() + delay : null;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      this.autoPlay(current, human ? 'easy' : 'medium');
    }, delay);
  }

  /** Plays for a seat: the computer's own turn, or an Easy move when a human runs out of time. */
  private autoPlay(seat: number, difficulty: Difficulty) {
    if (!this.state || this.status !== 'playing' || this.rules.current(this.state) !== seat) return;
    const move = this.rules.choose(this.state, seat, difficulty, this.rng);
    const error = move ? this.play(move) : 'no move';
    if (error) console.error(`[${this.code}] auto-play for seat ${seat} failed: ${error}`);
  }

  private allowMove(sessionId: string) {
    const now = this.now();
    const recent = (this.recentMoves.get(sessionId) ?? []).filter((t) => now - t < this.rateWindowMs);
    const ok = recent.length < this.rateLimit;
    if (ok) recent.push(now);
    this.recentMoves.set(sessionId, recent);
    return ok;
  }

  private clearTimers() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnTimerKey = '';
    this.reactTimers.forEach(clearTimeout);
    this.reactTimers.clear();
  }
}
