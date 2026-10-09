import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { normalizeCode } from '@naija/online';
import { authFromEnv, type Authenticator } from './auth';
import { resultsFromEnv, type ResultSink } from './results';
import { ratingsFromEnv, type RatingSource } from './ratings';
import { AyoRoom, QueueRoom, WhotRoom, matches, services } from './rooms';

/** GET /rooms/:code → public room facts for the invite page and its link preview. KI-6: not rate-limited yet. */
const getRoom = createEndpoint('/rooms/:code', { method: 'GET' }, async (ctx) => {
  const code = normalizeCode(ctx.params.code);
  const match = code ? matches.get(code) : undefined;
  if (!match) throw ctx.error(404, { error: 'Room no dey' });
  return match.summary();
});

const health = createEndpoint('/health', { method: 'GET' }, async () => ({ ok: true }));

/** Identity, result saving and ratings default to the environment (SUPABASE_URL, SUPABASE_SECRET_KEY); tests pass their own. */
export function createServer(opts: { auth?: Authenticator; results?: ResultSink | null; ratings?: RatingSource | null } = {}) {
  services.auth = opts.auth ?? authFromEnv();
  services.results = opts.results !== undefined ? opts.results : resultsFromEnv();
  services.ratings = opts.ratings !== undefined ? opts.ratings : ratingsFromEnv();
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: { whot: defineRoom(WhotRoom), ayo: defineRoom(AyoRoom), queue: defineRoom(QueueRoom) },
    routes: createRouter({ getRoom, health }),
    greet: false,
  });
}
