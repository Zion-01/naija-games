import { Client, type Room } from "@colyseus/sdk";
import {
  KEEPALIVE_MS,
  MSG,
  cleanNickname,
  type AyoWireMove,
  type CreateOptions,
  type ErrorMessage,
  type GameId,
  type JoinOptions,
  type MatchedMessage,
  type QueueOptions,
  type Snapshot,
  type WhotRoomOptions,
  type WhotWireMove,
} from "@naija/online";
import { AccountError, accessToken } from "./account";
import { createStore } from "./storage";

/**
 * Who you are online: a nickname, and a random device id. With accounts on, the server identifies you by your
 * Supabase session instead, and the guest id is never sent.
 */
export type Guest = { nickname: string; guestId: string };

export const guest = createStore<Guest>("naija-games:guest", { nickname: "", guestId: "" });

/** The device's nickname and guest id, created on first use (in an event handler, never during render). */
export function ensureGuest(nickname?: string): Guest {
  const current = guest.get();
  const next = {
    nickname: cleanNickname(nickname ?? current.nickname, ""),
    guestId: current.guestId || crypto.randomUUID(),
  };
  if (next.nickname !== current.nickname || next.guestId !== current.guestId) guest.set(next);
  return next;
}

/**
 * The game server. Set NEXT_PUBLIC_GAME_SERVER_URL in production; in development it is port 2567 on
 * whatever host served the page, so a phone on the same Wi-Fi can play too.
 */
// KI-3: production must set NEXT_PUBLIC_GAME_SERVER_URL (TLS), or HTTPS pages hit mixed-content blocking.
export function gameServerUrl(): string {
  const configured = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined") return "http://localhost:2567";
  return `${window.location.protocol}//${window.location.hostname}:2567`;
}

/**
 * Leaves on purpose. Render's proxy doesn't pass on the server's "you left" close (code 4000): the socket dies about
 * 20s later as a drop (1006), and the SDK would then retry the room 15 times. So switch retries off first.
 */
function leaveRoom(room: Room | null) {
  if (!room) return;
  room.reconnection.maxRetries = 0;
  return room.leave(true);
}

let wokeAt = 0;

/**
 * Starts waking the game server (a free host sleeps when nobody is playing and takes up to a minute to start) as
 * soon as someone looks like they'll play online, so it's usually up by the time they tap. Fire and forget.
 */
export function wakeServer() {
  const now = Date.now();
  if (now - wokeAt < 5 * 60 * 1000) return;
  wokeAt = now;
  // no-cors: we only need the request to arrive, not to read the answer.
  fetch(`${gameServerUrl()}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
}

export type ConnectionState =
  | { status: "connecting" }
  | { status: "open"; snapshot: Snapshot | null; reconnecting: boolean }
  | { status: "failed"; error: string }
  | { status: "closed" };

/**
 * One live room. Components read it with `useSyncExternalStore(conn.subscribe, conn.get)`.
 * Kept outside React so a room created on /whot survives the navigation to /play/CODE, and so
 * Strict Mode's double effects reuse the same socket.
 */
export class Connection {
  private state: ConnectionState = { status: "connecting" };
  private readonly listeners = new Set<() => void>();
  private readonly errorListeners = new Set<(text: string) => void>();
  private room: Room | null = null;
  private users = 0;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;

  constructor(readonly code: string) {}

  get = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onError(listener: (text: string) => void) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  attach(room: Room) {
    this.room = room;
    room.reconnection.minUptime = 1000;
    this.set({ status: "open", snapshot: null, reconnecting: false });
    room.onMessage(MSG.snapshot, (snapshot: Snapshot) => this.set({ status: "open", snapshot, reconnecting: false }));
    room.onMessage(MSG.error, (e: ErrorMessage) => this.errorListeners.forEach((l) => l(e.text)));
    room.onDrop(() => this.patchOpen({ reconnecting: true }));
    room.onReconnect(() => this.patchOpen({ reconnecting: false }));
    room.onLeave(() => {
      if (this.keepalive) clearInterval(this.keepalive);
      this.keepalive = null;
      if (this.state.status === "open") this.set({ status: "closed" });
    });
    // A host waiting for their guy sends nothing, and a free server host sleeps after 15 quiet minutes.
    this.keepalive = setInterval(() => room.send(MSG.ping), KEEPALIVE_MS);
  }

  fail(error: string) {
    this.set({ status: "failed", error });
  }

  send(type: typeof MSG.move, move: WhotWireMove | AyoWireMove): void;
  send(type: typeof MSG.start | typeof MSG.rematch | typeof MSG.ping): void;
  send(type: string, payload?: unknown) {
    this.room?.send(type, payload);
  }

  /** Reference-counted so a quick unmount/remount (Strict Mode, fast navigation) keeps the socket. */
  retain() {
    this.users++;
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    return () => {
      this.users--;
      if (this.users > 0) return;
      this.closeTimer = setTimeout(() => {
        void leaveRoom(this.room);
        forget(this);
      }, 300);
    };
  }

  private patchOpen(patch: { reconnecting: boolean }) {
    if (this.state.status === "open") this.set({ ...this.state, ...patch });
  }

  private set(state: ConnectionState) {
    this.state = state;
    this.listeners.forEach((l) => l());
  }
}

const connections = new Map<string, Connection>();
const registryListeners = new Set<() => void>();

function register(conn: Connection) {
  connections.set(conn.code, conn);
  registryListeners.forEach((l) => l());
}

function forget(conn: Connection) {
  if (connections.get(conn.code) !== conn) return;
  connections.delete(conn.code);
  registryListeners.forEach((l) => l());
}

/** For `useSyncExternalStore`: the connection for a code, if this tab has one. */
export const registry = {
  subscribe(listener: () => void) {
    registryListeners.add(listener);
    return () => registryListeners.delete(listener);
  },
  peek: (code: string) => connections.get(code) ?? null,
};

/** A game-server client carrying your session, and the join options that go with it. */
async function signedIn(spectate?: boolean): Promise<{ client: Client; options: JoinOptions }> {
  const me = ensureGuest();
  const client = new Client(gameServerUrl());
  const token = await accessToken(me.nickname);
  if (token) client.auth.token = token;
  return { client, options: { nickname: me.nickname, spectate, ...(token ? {} : { guestId: me.guestId }) } };
}

/** Creates a private room and returns its invite code. The connection waits for /play/CODE to pick it up. */
export async function createRoom(game: GameId, nickname: string, whot?: WhotRoomOptions): Promise<string> {
  ensureGuest(nickname);
  const { client, options } = await signedIn();
  const room = await client.create(game, { ...options, whot } satisfies CreateOptions);
  const conn = new Connection(room.roomId);
  conn.attach(room);
  register(conn);
  // Nobody picked it up (navigation failed): don't leave a ghost room open.
  const release = conn.retain();
  setTimeout(release, 15_000);
  return room.roomId;
}

export type SearchState =
  | { status: "searching" }
  | { status: "matched"; code: string }
  | { status: "failed"; error: string };

/**
 * A quick-match search: waits in the server's queue room until it pairs you (by your rating, read on the server),
 * then opens the room's connection so /play/CODE picks it up without asking your name again.
 */
export class Search {
  private state: SearchState = { status: "searching" };
  private readonly listeners = new Set<() => void>();
  private room: Room | null = null;
  private done = false;
  private users = 0;
  private cancelTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly game: GameId,
    nickname: string,
  ) {
    ensureGuest(nickname);
    void this.run();
  }

  get = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Stop waiting and play the computer instead. */
  solo() {
    this.room?.send(MSG.solo);
  }

  cancel() {
    this.done = true;
    void leaveRoom(this.room);
  }

  /** Like `Connection.retain`: the last user going away cancels the search, unless it comes straight back (Strict Mode). */
  retain() {
    this.users++;
    if (this.cancelTimer) clearTimeout(this.cancelTimer);
    this.cancelTimer = null;
    return () => {
      if (--this.users === 0) this.cancelTimer = setTimeout(() => this.cancel(), 300);
    };
  }

  private async run() {
    try {
      const { client, options } = await signedIn();
      const room = await client.joinOrCreate("queue", { ...options, game: this.game } satisfies QueueOptions);
      if (this.done) return void leaveRoom(room);
      this.room = room;
      room.onMessage(MSG.matched, ({ code }: MatchedMessage) => {
        this.done = true;
        // Join straight away; the page has 15s to pick the connection up (as with createRoom).
        const release = connect(code).retain();
        setTimeout(release, 15_000);
        void leaveRoom(room);
        this.set({ status: "matched", code });
      });
      room.onMessage(MSG.error, (e: ErrorMessage) => this.fail(e.text));
      room.onLeave(() => this.fail("Network don shake. Try again."));
    } catch (e) {
      this.fail(joinError(e));
    }
  }

  private fail(error: string) {
    if (this.done) return;
    this.done = true;
    void leaveRoom(this.room);
    this.set({ status: "failed", error });
  }

  private set(state: SearchState) {
    this.state = state;
    this.listeners.forEach((l) => l());
  }
}

/** The live connection for a room code, joining it (again) if this tab isn't in it. */
export function connect(code: string, opts: { spectate?: boolean } = {}): Connection {
  const existing = connections.get(code);
  if (existing && (existing.get().status === "connecting" || existing.get().status === "open")) return existing;
  const conn = new Connection(code);
  register(conn);
  signedIn(opts.spectate)
    .then(({ client, options }) => client.joinById(code, options))
    .then((room) => conn.attach(room))
    .catch((e: unknown) => conn.fail(joinError(e)));
  return conn;
}

// KI-21: matches SDK error text; switch to Colyseus error codes.
function joinError(e: unknown): string {
  if (e instanceof AccountError) return e.message;
  const message = e instanceof Error ? e.message : String(e);
  if (/not found|expired|no rooms/i.test(message)) return "This room no dey again. Ask your guy for a fresh link.";
  if (/full/i.test(message)) return "Room don full.";
  if (/fetch|network|ECONNREFUSED|Failed/i.test(message)) return "We no fit reach the game server. Check your network.";
  return message || "Something spoil. Try again.";
}

/** Corrects the server's deadline for clock skew, using when the snapshot arrived. */
export function secondsLeft(deadline: number | null, serverNow: number, receivedAt: number, now: number): number | null {
  if (deadline === null) return null;
  const remaining = deadline - serverNow - (now - receivedAt);
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/play/${code}`;
}

export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** True when `next` is exactly one move on from `prev` in the same round, so its `last` move can be called out or animated. */
export function isNextMove(prev: Pick<Snapshot, "round" | "moves"> | null, next: Snapshot): boolean {
  return prev !== null && next.last !== null && next.round === prev.round && next.moves === prev.moves + 1;
}
