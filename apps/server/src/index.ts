import { createServer } from './app';

const port = Number(process.env.PORT ?? 2567);

const server = createServer();
await server.listen(port);
console.log(`Naija Games server listening on ws://localhost:${port}`);
