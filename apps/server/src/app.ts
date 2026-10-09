import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { normalizeCode } from '@naija/online';
import { authFromEnv, type Authenticator } from './auth';
import { resultsFromEnv, type ResultSink } from './results';
import { Metrics, metricsFromEnv, type MetricsSink } from './metrics';
import { ratingsFromEnv, type RatingSource } from './ratings';
import { AyoRoom, QueueRoom, WhotRoom, live, matches, services } from './rooms';

/** GET /rooms/:code → public room facts for the invite page and its link preview. KI-6: not rate-limited yet. */
const getRoom = createEndpoint('/rooms/:code', { method: 'GET' }, async (ctx) => {
  const code = normalizeCode(ctx.params.code);
  const match = code ? matches.get(code) : undefined;
  if (!match) throw ctx.error(404, { error: 'Room no dey' });
  return match.summary();
});

const health = createEndpoint('/health', { method: 'GET' }, async () => ({ ok: true }));

/** What `pnpm load` samples while it runs: process CPU, memory and event-loop delay, plus rooms and clients. */
export type LoadStats = {
  rooms: number;
  clients: number;
  /** CPU time used since the last sample, in seconds per wall-clock second (1 = one full core). */
  cpu: number;
  rssMb: number;
  heapMb: number;
  /** Event-loop delay since the last sample, in ms. */
  loopP50: number;
  loopP99: number;
  loopMax: number;
};

function loadStatsEndpoint() {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  let lastCpu = process.cpuUsage();
  let lastAt = performance.now();
  return createEndpoint('/debug/load', { method: 'GET' }, async (): Promise<LoadStats> => {
    const cpu = process.cpuUsage(lastCpu);
    const now = performance.now();
    const mem = process.memoryUsage();
    const ms = (n: number) => Math.round((n / 1e6) * 10) / 10;
    const stats: LoadStats = {
      rooms: live.rooms,
      clients: live.clients,
      cpu: Math.round(((cpu.user + cpu.system) / 1000 / (now - lastAt)) * 1000) / 1000,
      rssMb: Math.round(mem.rss / 2 ** 20),
      heapMb: Math.round(mem.heapUsed / 2 ** 20),
      loopP50: ms(loop.percentile(50)),
      loopP99: ms(loop.percentile(99)),
      loopMax: ms(loop.max),
    };
    lastCpu = process.cpuUsage();
    lastAt = now;
    loop.reset();
    return stats;
  });
}

/**
 * Identity, result saving, ratings and the daily counts default to the environment (SUPABASE_URL,
 * SUPABASE_SECRET_KEY); tests pass their own.
 */
export function createServer(
  opts: { auth?: Authenticator; results?: ResultSink | null; ratings?: RatingSource | null; metrics?: MetricsSink | null } = {},
) {
  services.auth = opts.auth ?? authFromEnv();
  services.results = opts.results !== undefined ? opts.results : resultsFromEnv();
  services.ratings = opts.ratings !== undefined ? opts.ratings : ratingsFromEnv();
  services.metrics = new Metrics(opts.metrics !== undefined ? opts.metrics : metricsFromEnv());
  services.metrics.start();
  const server = defineServer({
    transport: new WebSocketTransport(),
    rooms: { whot: defineRoom(WhotRoom), ayo: defineRoom(AyoRoom), queue: defineRoom(QueueRoom) },
    // Only for `pnpm load` (LOAD_TEST=1), never in production: it describes the process to anyone who asks.
    routes:
      process.env.LOAD_TEST === '1' && process.env.NODE_ENV !== 'production'
        ? createRouter({ getRoom, health, loadStats: loadStatsEndpoint() })
        : createRouter({ getRoom, health }),
    greet: false,
  });
  // A deploy or restart sends the last minute's counts before the process exits.
  server.onShutdown(() => services.metrics.stop());
  return server;
}
