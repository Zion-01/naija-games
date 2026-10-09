import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import type { Snapshot } from '@naija/online';
import type { whot } from '@naija/engine';
import { createServer } from '../src/app';
import { guestAuth } from '../src/auth';

const PORT = 2600 + Math.floor(Math.random() * 300);
const URL = `http://localhost:${PORT}`;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  server = createServer({ auth: guestAuth, results: null });
  await server.listen(PORT);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

/** Collects snapshots and errors from a room, with a helper to wait for a condition. */
function watch(room: Room) {
  const box: { snap: Snapshot<'whot'> | null; errors: string[] } = { snap: null, errors: [] };
  room.onMessage('snapshot', (s: Snapshot<'whot'>) => (box.snap = s));
  room.onMessage('error', (e: { text: string }) => box.errors.push(e.text));
  const until = async (ok: (s: Snapshot<'whot'>) => boolean, ms = 5000) => {
    const end = Date.now() + ms;
    while (!(box.snap && ok(box.snap))) {
      if (Date.now() > end) throw new Error(`timed out; last snapshot: ${JSON.stringify(box.snap)?.slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, 20));
    }
    return box.snap;
  };
  return { box, until };
}

describe('private Whot room over WebSockets', () => {
  it('invites by code, hides hands, plays moves, and survives a dropped connection', async () => {
    const host = await new Client(URL).create('whot', { nickname: 'Tunde', guestId: 'guest-tunde-123', whot: { players: 2 } });
    const a = watch(host);
    expect(host.roomId).toMatch(/^[A-HJ-NP-Z]{4}$/);

    const res = await fetch(`${URL}/rooms/${host.roomId.toLowerCase()}`);
    expect(await res.json()).toMatchObject({ code: host.roomId, game: 'whot', host: 'Tunde', filled: 1, status: 'waiting' });
    expect((await fetch(`${URL}/rooms/QQQQ`)).status).toBe(404);

    const guest = await new Client(URL).joinById(host.roomId, { nickname: 'Bisi', guestId: 'guest-bisi-456' });
    guest.reconnection.minUptime = 0;
    const b = watch(guest);
    const sa = await a.until((s) => s.status === 'playing');
    const sb = await b.until((s) => s.status === 'playing');
    expect([sa.you, sb.you]).toEqual([0, 1]);
    expect(sa.seats.map((s) => s?.name)).toEqual(['Tunde', 'Bisi']);
    // Nobody receives another player's cards.
    const handB = (sb.view as whot.WhotView).myHand.map((c) => c.id);
    expect(handB.some((id) => JSON.stringify(sa).includes(`"${id}"`))).toBe(false);
    // The deadline is set a moment before the snapshot is stamped, so allow a few ms.
    expect(sa.deadline! - sa.now).toBeGreaterThan(19_950);
    expect(sa.deadline! - sa.now).toBeLessThanOrEqual(20_000);

    // Out of turn: refused. On turn: played, and both sides see it.
    guest.send('move', { type: 'draw' });
    await b.until(() => b.box.errors.length > 0);
    expect(b.box.errors[0]).toBe('No be your turn');
    host.send('move', { type: 'draw' });
    const after = await b.until((s) => s.last !== null);
    expect(after.last).toEqual({ type: 'draw', player: 0 });
    expect((after.view as whot.WhotView).handCounts[0]).toBe(6);

    // Drop the guest's socket without leaving: the seat shows offline, then the SDK reconnects by itself.
    (guest.connection.transport as unknown as { ws: WebSocket }).ws.close();
    await a.until((s) => s.seats[1]?.connected === false);
    await a.until((s) => s.seats[1]?.connected === true);
    expect(a.box.snap!.seats[1]!.kind).toBe('human');

    // A spectator can watch without seeing any hand.
    const watcher = await new Client(URL).joinById(host.roomId, { nickname: 'Emeka', guestId: 'guest-emeka-789', spectate: true });
    const w = watch(watcher);
    const sw = await w.until((s) => s.view !== null);
    expect(sw.you).toBe(-1);
    expect((sw.view as whot.WhotView).myHand).toEqual([]);

    // Leaving for good hands the seat to the computer; rejoining from the same device takes it back.
    await guest.leave(true);
    await a.until((s) => s.seats[1]?.kind === 'ai');
    const back = await new Client(URL).joinById(host.roomId, { nickname: 'Bisi', guestId: 'guest-bisi-456' });
    const b2 = watch(back);
    expect((await b2.until((s) => s.you === 1)).seats[1]).toMatchObject({ kind: 'human', connected: true });

    await Promise.all([host.leave(), back.leave(), watcher.leave()]);
  });

  it('accepts keepalive pings silently, so a waiting room stays up on a host that sleeps when idle', async () => {
    const host = await new Client(URL).create('ayo', { nickname: 'Ada', guestId: 'guest-ada-ping1' });
    const h = watch(host);
    await h.until((s) => s.status === 'waiting');
    host.send('ping');
    await new Promise((r) => setTimeout(r, 200));
    expect(h.box.errors).toEqual([]);
    await host.leave();
  });

  it('does not hand out private rooms to random matchmaking', async () => {
    const host = await new Client(URL).create('ayo', { nickname: 'Ada', guestId: 'guest-ada-0001' });
    await expect(new Client(URL).join('ayo', { nickname: 'X', guestId: 'guest-x-00001' })).rejects.toThrow();
    // No identity, no seat.
    await expect(new Client(URL).joinById(host.roomId, { nickname: 'Nobody' })).rejects.toThrow(/guest id/);
    await host.leave();
  });
});

describe('quick-match over WebSockets', () => {
  const queueUp = async (nickname: string, guestId: string, game: 'whot' | 'ayo') => {
    const room = await new Client(URL).joinOrCreate('queue', { nickname, guestId, game });
    const code = new Promise<string>((resolve) => room.onMessage('matched', (m: { code: string }) => resolve(m.code)));
    return { room, code };
  };

  it('pairs two players into a private 2-player room that deals as soon as both arrive', async () => {
    const a = await queueUp('Tunde', 'guest-tunde-q01', 'whot');
    const b = await queueUp('Bisi', 'guest-bisi-q002', 'whot');
    const [codeA, codeB] = await Promise.all([a.code, b.code]);
    expect(codeA).toBe(codeB);
    await Promise.all([a.room.leave(), b.room.leave()]);

    const ra = await new Client(URL).joinById(codeA, { nickname: 'Tunde', guestId: 'guest-tunde-q01' });
    const wa = watch(ra);
    // A stranger with the code can only watch.
    const stranger = await new Client(URL).joinById(codeA, { nickname: 'Emeka', guestId: 'guest-emeka-q03' });
    const ws = watch(stranger);
    expect((await ws.until((s) => s.quick)).you).toBe(-1);
    const rb = await new Client(URL).joinById(codeA, { nickname: 'Bisi', guestId: 'guest-bisi-q002' });
    const snap = await wa.until((s) => s.status === 'playing');
    expect(snap).toMatchObject({ quick: true, you: 0 });
    expect(snap.seats.map((s) => [s?.name, s?.kind, s?.host])).toEqual([
      ['Tunde', 'human', false],
      ['Bisi', 'human', false],
    ]);
    await Promise.all([ra.leave(), rb.leave(), stranger.leave()]);
  });

  it('seats a player against the computer when they stop waiting', async () => {
    const a = await queueUp('Ada', 'guest-ada-q0004', 'ayo');
    a.room.send('solo');
    const code = await a.code;
    await a.room.leave();
    const room = await new Client(URL).joinById(code, { nickname: 'Ada', guestId: 'guest-ada-q0004' });
    const snap = await watch(room).until((s) => s.status === 'playing');
    expect(snap.game).toBe('ayo');
    expect(snap.seats.map((s) => s?.kind)).toEqual(['human', 'ai']);
    await room.leave();
  });

  it('refuses a queue ticket without a game', async () => {
    await expect(new Client(URL).joinOrCreate('queue', { nickname: 'X', guestId: 'guest-x-q00005' })).rejects.toThrow(/Pick a game/);
  });
});
