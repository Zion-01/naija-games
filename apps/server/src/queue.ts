import { QUICK_MAX_WAIT_SECONDS, type GameId } from '@naija/online';

/** One player waiting for a quick-match game. */
export type Ticket = {
  /** The queue connection (Colyseus session id). */
  id: string;
  /** The verified player (from `onAuth`); their seat in the new room is held for this id. */
  playerId: string;
  game: GameId;
  /** Read on the server from `ratings` for the verified user, never sent by the client. 1200 without a row. */
  rating: number;
  joinedAt: number;
  /** Tells the client which room to join. */
  matched(code: string): void;
  /** Tells the client the queue gave up on them (room creation failed, or they queued again elsewhere). */
  failed(text: string): void;
};

/** Opens a room with seats held for these players (in seat order) and returns its code. */
export type RoomOpener = (game: GameId, players: Ticket[]) => Promise<string>;

export type QueueOptions = {
  openRoom: RoomOpener;
  now?: () => number;
  /** How often waiting players are re-paired as their allowed rating gap widens. */
  tickMs?: number;
  maxWaitMs?: number;
};

/** The rating gap a player accepts after waiting this long: ±100 at first, 25 points wider each second. */
export function ratingWindow(waitedMs: number): number {
  return 100 + 25 * Math.max(0, waitedMs / 1000);
}

/**
 * Pairs waiting players by rating, two per game (quick-match Whot is 2-player, like Ayo). Two players match
 * when their gap fits inside *both* their windows, so a newcomer isn't thrown at someone far above them the
 * moment they arrive, but anyone who keeps waiting soon matches. After `maxWaitMs` the computer takes them.
 *
 * KI-5: in memory, so this only pairs players on one server process.
 */
export class Matchmaker {
  private readonly tickets = new Map<string, Ticket>();
  private readonly now: () => number;
  private readonly tickMs: number;
  private readonly maxWaitMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: QueueOptions) {
    this.now = opts.now ?? Date.now;
    this.tickMs = opts.tickMs ?? 1000;
    this.maxWaitMs = opts.maxWaitMs ?? QUICK_MAX_WAIT_SECONDS * 1000;
  }

  get size() {
    return this.tickets.size;
  }

  /** Queues a player, replacing any ticket they already hold (another tab), and pairs straight away if it can. */
  add(ticket: Omit<Ticket, 'joinedAt'>) {
    for (const t of this.tickets.values()) {
      if (t.playerId !== ticket.playerId) continue;
      this.tickets.delete(t.id);
      t.failed('You don join the queue for another tab.');
    }
    this.tickets.set(ticket.id, { ...ticket, joinedAt: this.now() });
    this.timer ??= setInterval(() => this.tick(), this.tickMs);
    this.pair();
  }

  remove(id: string) {
    this.tickets.delete(id);
    this.idle();
  }

  /** The player stopped waiting: seat them against the computer. */
  solo(id: string) {
    const t = this.take(id);
    if (t) this.open(t.game, [t]);
  }

  tick() {
    this.pair();
    for (const t of [...this.tickets.values()]) {
      if (this.now() - t.joinedAt >= this.maxWaitMs) this.solo(t.id);
    }
  }

  dispose() {
    this.tickets.clear();
    this.idle();
  }

  private pair() {
    const now = this.now();
    const waiting = [...this.tickets.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const taken = new Set<string>();
    for (const [i, a] of waiting.entries()) {
      if (taken.has(a.id)) continue;
      let best: Ticket | null = null;
      for (const b of waiting.slice(i + 1)) {
        if (taken.has(b.id) || b.game !== a.game) continue;
        const gap = Math.abs(a.rating - b.rating);
        if (gap > Math.min(ratingWindow(now - a.joinedAt), ratingWindow(now - b.joinedAt))) continue;
        if (!best || gap < Math.abs(a.rating - best.rating)) best = b;
      }
      if (!best) continue;
      taken.add(a.id).add(best.id);
      // The longer-waiting player sits first; rounds rotate who starts anyway.
      this.open(a.game, [this.take(a.id)!, this.take(best.id)!]);
    }
  }

  private take(id: string) {
    const t = this.tickets.get(id);
    this.tickets.delete(id);
    this.idle();
    return t ?? null;
  }

  private open(game: GameId, players: Ticket[]) {
    this.opts.openRoom(game, players).then(
      (code) => players.forEach((p) => p.matched(code)),
      (e: unknown) => {
        console.error(`quick-match: opening a ${game} room failed:`, e);
        players.forEach((p) => p.failed('We no fit open the game. Try again.'));
      },
    );
  }

  private idle() {
    if (this.tickets.size > 0 || !this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
