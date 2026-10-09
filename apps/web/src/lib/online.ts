import { Client, type Room } from "@colyseus/sdk";
import {
  MSG,
  cleanNickname,
  type AyoWireMove,
  type CreateOptions,
  type ErrorMessage,
  type GameId,
  type Snapshot,
  type WhotRoomOptions,
  type WhotWireMove,
} from "@naija/online";
import { createStore } from "./storage";

/** Who you are online: a nickname, and a random device secret the server uses to give you your seat back. */
export type Guest = { nickname: string; guestId: string };

export const guest = createStore<Guest>("naija-games:guest", { nickname: "", guestId: "" });

/** The device's guest identity, created on first use (in an event handler, never during render). */
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
export function gameServerUrl(): string {
  const configured = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined") return "http://localhost:2567";
  return `${window.location.protocol}//${window.location.hostname}:2567`;
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
      if (this.state.status === "open") this.set({ status: "closed" });
    });
  }

  fail(error: string) {
    this.set({ status: "failed", error });
  }

  send(type: typeof MSG.move, move: WhotWireMove | AyoWireMove): void;
  send(type: typeof MSG.start | typeof MSG.rematch): void;
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
        void this.room?.leave(true);
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

const client = () => new Client(gameServerUrl());

/** Creates a private room and returns its invite code. The connection waits for /play/CODE to pick it up. */
export async function createRoom(game: GameId, nickname: string, whot?: WhotRoomOptions): Promise<string> {
  const me = ensureGuest(nickname);
  const options: CreateOptions = { ...me, whot };
  const room = await client().create(game, options);
  const conn = new Connection(room.roomId);
  conn.attach(room);
  register(conn);
  // Nobody picked it up (navigation failed): don't leave a ghost room open.
  const release = conn.retain();
  setTimeout(release, 15_000);
  return room.roomId;
}

/** The live connection for a room code, joining it (again) if this tab isn't in it. */
export function connect(code: string, opts: { spectate?: boolean } = {}): Connection {
  const existing = connections.get(code);
  if (existing && (existing.get().status === "connecting" || existing.get().status === "open")) return existing;
  const conn = new Connection(code);
  register(conn);
  const me = ensureGuest();
  client()
    .joinById(code, { ...me, spectate: opts.spectate })
    .then((room) => conn.attach(room))
    .catch((e: unknown) => conn.fail(joinError(e)));
  return conn;
}

function joinError(e: unknown): string {
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
