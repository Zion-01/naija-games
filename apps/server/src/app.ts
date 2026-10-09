import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { normalizeCode } from '@naija/online';
import { AyoRoom, WhotRoom, matches } from './rooms';

/** GET /rooms/:code → public room facts for the invite page and its link preview. KI-6: not rate-limited yet. */
const getRoom = createEndpoint('/rooms/:code', { method: 'GET' }, async (ctx) => {
  const code = normalizeCode(ctx.params.code);
  const match = code ? matches.get(code) : undefined;
  if (!match) throw ctx.error(404, { error: 'Room no dey' });
  return match.summary();
});

const health = createEndpoint('/health', { method: 'GET' }, async () => ({ ok: true }));

export function createServer() {
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: { whot: defineRoom(WhotRoom), ayo: defineRoom(AyoRoom) },
    routes: createRouter({ getRoom, health }),
    greet: false,
  });
}
