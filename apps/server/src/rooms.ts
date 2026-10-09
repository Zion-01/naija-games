import { Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import { MAX_SPECTATORS, MSG, RECONNECT_SECONDS, randomCode, type CreateOptions, type JoinOptions } from '@naija/online';
import { ayoRules, whotRules, type AnyRules } from './games';
import { Match } from './match';

/** Private rooms keyed by their invite code, so the HTTP API can describe a room for link previews. */
export const matches = new Map<string, Match<unknown, unknown, unknown>>();

abstract class GameRoom extends Room {
  match!: Match<unknown, unknown, unknown>;

  protected abstract rules(options: CreateOptions): AnyRules;

  async onCreate(options: CreateOptions = { nickname: '', guestId: '' }) {
    // The room id doubles as the invite code: /play/ABCD joins room ABCD.
    this.roomId = await uniqueCode();
    const rules = this.rules(options);
    this.maxClients = rules.seats + MAX_SPECTATORS;
    // Enough for fast tapping and catches; anything above this is a broken or abusive client.
    this.maxMessagesPerSecond = 30;
    this.match = new Match(this.roomId, rules, (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0, () => this.sendSnapshots());
    matches.set(this.roomId, this.match);
    // Invite-only: never handed out by joinOrCreate, only joinable by code.
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
  }

  onJoin(client: Client, options: Partial<JoinOptions> = {}) {
    try {
      this.match.join(client.sessionId, options);
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
