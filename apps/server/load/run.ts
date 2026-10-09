/**
 * Load test for one game server process (Phase 5d). Starts the server in its own process (guest auth, no Supabase,
 * LOAD_TEST=1 for the /debug/load stats endpoint), then opens rooms over real WebSockets with bot players that move
 * like people: they wait a "think" time, then play an Easy-AI move from their own redacted view.
 *
 *   pnpm --filter server load --rooms 200 --ramp 30 --hold 60 --think 800
 *   pnpm --filter server load --url http://localhost:2567   (a server you started yourself with LOAD_TEST=1)
 *
 * Room mix, in rotation: Whot 1v1, Ayo 1v1, Whot with 2 bots + 2 computer seats, Ayo against the computer.
 * Computer seats run the server's Medium AI, which is the expensive part of a room. See docs/LOAD_TEST.md.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Client, type Room } from '@colyseus/sdk';
import { ayo, createRng, whot, type Rng } from '@naija/engine';
import type { ErrorMessage, GameId, Snapshot } from '@naija/online';
import type { LoadStats } from '../src/app';

const { values: args } = parseArgs({
  options: {
    rooms: { type: 'string', default: '100' },
    ramp: { type: 'string', default: '20' },
    hold: { type: 'string', default: '40' },
    think: { type: 'string', default: '800' },
    port: { type: 'string', default: '2701' },
    url: { type: 'string' },
    every: { type: 'string', default: '5' },
  },
});
const ROOMS = Number(args.rooms);
const RAMP_S = Number(args.ramp);
const HOLD_S = Number(args.hold);
const THINK_MS = Number(args.think);
const EVERY_S = Number(args.every);
const SERVER = args.url ?? `http://localhost:${args.port}`;

type Kind = { game: GameId; bots: number; players: number; computer: boolean; label: string };
const KINDS: Kind[] = [
  { game: 'whot', bots: 2, players: 2, computer: false, label: 'Whot 1v1' },
  { game: 'ayo', bots: 2, players: 2, computer: false, label: 'Ayo 1v1' },
  { game: 'whot', bots: 2, players: 4, computer: true, label: 'Whot 2 bots + 2 computer' },
  { game: 'ayo', bots: 1, players: 2, computer: true, label: 'Ayo vs computer' },
];

type Window = { moves: number; latencies: number[]; errors: Map<string, number> };
const newWindow = (): Window => ({ moves: 0, latencies: [], errors: new Map() });
/** Client-side numbers for the current reporting window and for the whole run. */
const tally = { window: newWindow(), all: { ...newWindow(), games: 0, joinFailures: 0 } };
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

let botCount = 0;

/** One player: moves on its turn after a think time, and asks for a rematch when a game ends. */
class Bot {
  room!: Room;
  private snap: Snapshot | null = null;
  private sentAt: number | null = null;
  private sentMoves = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private rematchRound = -1;
  readonly id = ++botCount;
  private readonly rng: Rng = createRng(this.id * 7919);

  async connect(join: (c: Client, opts: Record<string, unknown>) => Promise<Room>) {
    this.room = await join(new Client(SERVER), { nickname: `Bot ${this.id}`, guestId: `guest-load-${process.pid}-${this.id}` });
    this.room.onMessage('snapshot', (s: Snapshot) => this.onSnapshot(s));
    this.room.onMessage('error', (e: ErrorMessage) => {
      bump(tally.window.errors, e.text);
      bump(tally.all.errors, e.text);
    });
    this.room.onMessage('emote', () => {});
  }

  /** Resolves with the first snapshot (the host needs the room code from it). */
  firstSnapshot(): Promise<Snapshot> {
    return new Promise((resolve) => {
      const check = () => (this.snap ? resolve(this.snap) : setTimeout(check, 20));
      check();
    });
  }

  private onSnapshot(s: Snapshot) {
    const before = this.snap;
    this.snap = s;
    if (this.sentAt !== null && (s.moves > this.sentMoves || s.round !== before?.round)) {
      const ms = performance.now() - this.sentAt;
      for (const t of [tally.window, tally.all]) {
        t.latencies.push(ms);
        t.moves++;
      }
      this.sentAt = null;
    }
    if (s.status === 'over' && s.you >= 0 && this.rematchRound !== s.round) {
      this.rematchRound = s.round;
      // Count each game once: by the first human seat.
      if (s.you === s.seats.findIndex((x) => x?.kind === 'human')) tally.all.games++;
      this.later(() => this.room.send('rematch'));
    }
    if (s.status === 'playing' && s.view && s.you >= 0 && !this.timer && this.sentAt === null && current(s) === s.you) {
      this.later(() => this.play());
    }
  }

  private later(fn: () => void) {
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, THINK_MS * (0.5 + this.rng()));
  }

  private play() {
    const s = this.snap;
    if (!s?.view || s.status !== 'playing' || current(s) !== s.you) return;
    const move =
      s.game === 'whot'
        ? whot.chooseWhotMove(s.view as whot.WhotView, 'easy', this.rng)
        : ayo.chooseAyoMove(s.view as ayo.AyoState, s.you as 0 | 1, 'easy', this.rng);
    if (!move) return;
    const { player: _player, ...wire } = move;
    this.sentAt = performance.now();
    this.sentMoves = s.moves;
    this.room.send('move', wire);
  }

  async leave() {
    if (this.timer) clearTimeout(this.timer);
    this.room.reconnection.maxRetries = 0;
    await this.room.leave().catch(() => {});
  }
}

function current(s: Snapshot) {
  const v = s.view as whot.WhotView | ayo.AyoState;
  return v.over ? -1 : v.current;
}

async function openRoom(kind: Kind): Promise<Bot[]> {
  const host = new Bot();
  await host.connect((c, o) => c.create(kind.game, { ...o, whot: { players: kind.players } }));
  const { code } = await host.firstSnapshot();
  const bots = [host];
  for (let i = 1; i < kind.bots; i++) {
    const guest = new Bot();
    await guest.connect((c, o) => c.joinById(code, o));
    bots.push(guest);
  }
  if (kind.computer) host.room.send('start');
  return bots;
}

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
};
const f = (n: number, digits = 0) => (Number.isFinite(n) ? n.toFixed(digits) : '–');

async function stats(): Promise<LoadStats | null> {
  try {
    const res = await fetch(`${SERVER}/debug/load`);
    return res.ok ? ((await res.json()) as LoadStats) : null;
  } catch {
    return null;
  }
}

async function waitForHealth(ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(`${SERVER}/health`)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no server at ${SERVER}`);
}

function startServer(): ChildProcess {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd,
    env: { ...process.env, PORT: String(args.port), LOAD_TEST: '1', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', NODE_ENV: 'development' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  child.on('exit', (code) => code && console.error(`server exited with ${code}`));
  return child;
}

const peak = { cpu: 0, loopP99: 0, loopMax: 0, rssMb: 0, clients: 0, rooms: 0 };

async function report(t0: number) {
  const s = await stats();
  const w = tally.window;
  tally.window = newWindow();
  const errors = [...w.errors.values()].reduce((a, b) => a + b, 0);
  if (s) {
    for (const k of ['cpu', 'loopP99', 'loopMax', 'rssMb', 'clients', 'rooms'] as const) peak[k] = Math.max(peak[k], s[k]);
  }
  console.log(
    [
      `${f((performance.now() - t0) / 1000).padStart(4)}s`,
      `rooms ${String(s?.rooms ?? '?').padStart(4)}`,
      `clients ${String(s?.clients ?? '?').padStart(4)}`,
      `moves/s ${f(w.moves / EVERY_S, 1).padStart(6)}`,
      `rtt p50/p95/p99 ${f(pct(w.latencies, 50))}/${f(pct(w.latencies, 95))}/${f(pct(w.latencies, 99))} ms`,
      `cpu ${s ? `${f(s.cpu * 100)}%` : '?'}`,
      `loop p99/max ${s ? `${s.loopP99}/${s.loopMax}` : '?'} ms`,
      `rss ${s?.rssMb ?? '?'} MB`,
      errors ? `errors ${errors}` : '',
    ].join('  '),
  );
}

async function main() {
  const server = args.url ? null : startServer();
  await waitForHealth();
  if (!(await stats())) console.warn('No /debug/load on this server (start it with LOAD_TEST=1): server numbers show as ?');
  console.log(`Load test: ${ROOMS} rooms over ${RAMP_S}s, hold ${HOLD_S}s, think ~${THINK_MS}ms, against ${SERVER}\n`);

  const t0 = performance.now();
  const ticker = setInterval(() => void report(t0), EVERY_S * 1000);
  const bots: Bot[] = [];
  const opening: Promise<void>[] = [];
  for (let i = 0; i < ROOMS; i++) {
    const kind = KINDS[i % KINDS.length]!;
    opening.push(
      openRoom(kind).then(
        (b) => void bots.push(...b),
        (e: unknown) => {
          tally.all.joinFailures++;
          if (tally.all.joinFailures <= 3) console.error(`opening a ${kind.label} room failed:`, (e as Error).message);
        },
      ),
    );
    await new Promise((r) => setTimeout(r, (RAMP_S * 1000) / ROOMS));
  }
  await Promise.all(opening);
  await new Promise((r) => setTimeout(r, HOLD_S * 1000));
  clearInterval(ticker);
  await report(t0);

  await Promise.all(bots.map((b) => b.leave()));
  server?.kill();

  const a = tally.all;
  const errors = [...a.errors].map(([k, v]) => `${v}× "${k}"`).join(', ');
  console.log(`
Summary
  rooms opened        ${ROOMS - a.joinFailures}/${ROOMS}
  peak rooms/clients  ${peak.rooms}/${peak.clients}
  moves played        ${a.moves} by bots (computer seats not counted), ${a.games} games finished
  move round trip     p50 ${f(pct(a.latencies, 50))} ms, p95 ${f(pct(a.latencies, 95))} ms, p99 ${f(pct(a.latencies, 99))} ms, max ${f(Math.max(...a.latencies))} ms
  server peak         cpu ${f(peak.cpu * 100)}% of one core, event loop p99 ${peak.loopP99} ms (max ${peak.loopMax} ms), rss ${peak.rssMb} MB
  errors              ${errors || 'none'}`);
  process.exit(0);
}

await main();
