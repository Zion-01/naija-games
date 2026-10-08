import { defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

const port = Number(process.env.PORT ?? 2567);

// Whot and Ayo rooms are registered here in Phase 3 (online multiplayer).
const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {},
});

await server.listen(port);
console.log(`Naija Games server listening on ws://localhost:${port}`);
