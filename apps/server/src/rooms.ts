import { randomUUID } from 'node:crypto';
import { Room, ServerError, matchMaker, type AuthContext, type Client } from '@colyseus/core';
import {
  MAX_SPECTATORS,
  MSG,
  RECONNECT_SECONDS,
  randomCode,
  type CreateOptions,
  type GameId,
  type JoinOptions,
  type MatchedMessage,
  type QueueOptions,
} from '@naija/online';
import { AuthError, guestAuth, type Authenticator, type Identity } from './auth';
import { ayoRules, whotRules, type AnyRules } from './games';
import { Match } from './match';
import { Matchmaker, type Ticket } from './queue';
import { DEFAULT_RATING, type RatingSource } from './ratings';
import type { ResultSink } from './results';

/** How rooms identify players, where finished games go, and where quick-match reads ratings. Set once by `createServer`. */
export const services: { auth: Authenticator; results: ResultSink | null; ratings: RatingSource | null } = {
  auth: guestAuth,
  results: null,
  ratings: null,
};

/**
 * Private rooms keyed by their invite code, so the HTTP API can describe a room for link previews.
 * KI-5: process-local, so rooms die on restart and this can't scale past one node yet.
 */
export const matches = new Map<string, Match<unknown, unknown, unknown>>();

/**
 * Seats held for quick-match rooms while they're created, keyed by a one-time token passed to `onCreate`.
 * Clients can send any options to `create`, so the held seats come from here, never from the options themselves.
 */
const quickSeats = new Map<string, string[]>();

/** Opens a quick-match room with seats held for these players. Quick-match is always 2 players, Whot too. */
async function openQuickRoom(game: GameId, players: Ticket[]): Promise<string> {
  const token = randomUUID();
  quickSeats.set(token, players.map((p) => p.playerId));
  try {
    const room = await matchMaker.createRoom(game, { nickname: '', quick: token });
    return room.roomId;
  } finally {
    quickSeats.delete(token);
  }
}

/** The quick-match queue, shared by every queue room. KI-5: one process only. */
export const queue = new Matchmaker({ openRoom: openQuickRoom });

type GameCreateOptions = CreateOptions & { quick?: unknown };

abstract class GameRoom extends Room {
  match!: Match<unknown, unknown, unknown>;

  protected abstract rules(options: CreateOptions): AnyRules;

  async onCreate(options: GameCreateOptions = { nickname: '' }) {
    // The room id doubles as the invite code: /play/ABCD joins room ABCD.
    this.roomId = await uniqueCode();
    const reserved = typeof options.quick === 'string' ? quickSeats.get(options.quick) : undefined;
    const rules = this.rules(reserved ? { nickname: '', whot: { players: 2 } } : options);
    this.maxClients = rules.seats + MAX_SPECTATORS;
    // Enough for fast tapping and catches; anything above this is a broken or abusive client.
    this.maxMessagesPerSecond = 30;
    const seed = (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0;
    this.match = new Match(this.roomId, rules, seed, () => this.sendSnapshots(), {
      reserved,
      onOver: (record) => {
        const save = services.results;
        if (!save || !record.players.some((p) => p.userId)) return;
        save(record).then(
          (saved) => this.match.setRatings(record.round, saved.ratings),
          (e: unknown) => console.error(`[${this.roomId}] saving the result failed:`, e),
        );
      },
    });
    matches.set(this.roomId, this.match);
    // Invite-only (quick-match rooms too): never handed out by joinOrCreate, only joinable by code.
    await this.setPrivate(true);

    this.onMessage(MSG.move, (client, move: unknown) => {
      const error = this.match.move(client.sessionId, move);
      if (error) client.send(MSG.error, { text: error });
    });
    this.onMessage(MSG.start, (client) => {
      const error = this.match.start(client.sessionId);
      if (error) client.send(MSG.error, { text: error });
    });
    this.onMessage(MSG.rematch, (client) => this.match.requestRematch(client.sessionId));
    this.onMessage(MSG.emote, (client, id: unknown) => {
      const result = this.match.emote(client.sessionId, id);
      if (typeof result === 'string') client.send(MSG.error, { text: result });
      else this.broadcast(MSG.emote, result);
    });
    // Keepalive (KEEPALIVE_MS): receiving it is the point, so a sleeping-when-idle host keeps this room up.
    this.onMessage(MSG.ping, () => {});
  }

  async onAuth(_client: Client, options: Partial<JoinOptions> = {}, context: AuthContext): Promise<Identity> {
    try {
      return await services.auth(context.token, options);
    } catch (e) {
      throw new ServerError(401, e instanceof AuthError ? e.message : 'Sign in first');
    }
  }

  onJoin(client: Client, options: Partial<JoinOptions> = {}) {
    try {
      this.match.join(client.sessionId, options, client.auth as Identity);
    } catch (e) {
      throw new ServerError(4000, (e as Error).message);
    }
    void this.setMetadata(this.match.summary());
  }

  onDrop(client: Client) {
    this.match.drop(client.sessionId);
    // The SDK reconnects on its own; after the window, onLeave hands the seat to the computer.
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
  }

  onReconnect(client: Client) {
    this.match.reconnect(client.sessionId);
  }

  onLeave(client: Client) {
    this.match.leave(client.sessionId);
    void this.setMetadata(this.match.summary());
  }

  onDispose() {
    this.match.dispose();
    matches.delete(this.roomId);
  }

  private sendSnapshots() {
    for (const client of this.clients) client.send(MSG.snapshot, this.match.snapshotFor(client.sessionId));
  }
}

/**
 * The quick-match lobby: joining queues you for `QueueOptions.game`; the server sends `matched` with a room code
 * once it pairs you, and `solo` stops waiting and seats you against the computer. Leaving drops your ticket.
 */
export class QueueRoom extends Room {
  maxClients = 500;

  onCreate() {
    this.maxMessagesPerSecond = 5;
    this.onMessage(MSG.solo, (client) => queue.solo(client.sessionId));
  }

  /** Identity, plus the rating to match on: read here for the verified user, so the client can't pick it. */
  async onAuth(_client: Client, options: Partial<QueueOptions> = {}, context: AuthContext): Promise<Identity & { rating: number }> {
    if (options.game !== 'whot' && options.game !== 'ayo') throw new ServerError(400, 'Pick a game');
    let who: Identity;
    try {
      who = await services.auth(context.token, options);
    } catch (e) {
      throw new ServerError(401, e instanceof AuthError ? e.message : 'Sign in first');
    }
    let rating = DEFAULT_RATING;
    if (who.userId && services.ratings) {
      rating = await services.ratings(who.userId, options.game).catch((e: unknown) => {
        console.error('quick-match: reading a rating failed, using 1200:', e);
        return DEFAULT_RATING;
      });
    }
    return { ...who, rating };
  }

  onJoin(client: Client, options: QueueOptions) {
    const who = client.auth as Identity & { rating: number };
    queue.add({
      id: client.sessionId,
      playerId: who.playerId,
      game: options.game,
      rating: who.rating,
      matched: (code) => client.send(MSG.matched, { code } satisfies MatchedMessage),
      failed: (text) => {
        client.send(MSG.error, { text });
        client.leave();
      },
    });
  }

  onLeave(client: Client) {
    queue.remove(client.sessionId);
  }
}

export class WhotRoom extends GameRoom {
  protected rules(options: CreateOptions) {
    return whotRules(options.whot);
  }
}

export class AyoRoom extends GameRoom {
  protected rules() {
    return ayoRules();
  }
}

async function uniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode(Math.random);
    if (!matches.has(code) && !(await matchMaker.getRoomById(code))) return code;
  }
  throw new ServerError(503, 'No free room codes. Try again.');
}
