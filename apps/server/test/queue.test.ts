import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameId } from '@naija/online';
import { Matchmaker, ratingWindow, type Ticket } from '../src/queue';
import { supabaseRatings } from '../src/ratings';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(opts: { fail?: boolean } = {}) {
  const rooms: { game: GameId; players: string[] }[] = [];
  const events: string[] = [];
  const mm = new Matchmaker({
    openRoom: async (game, players) => {
      if (opts.fail) throw new Error('boom');
      rooms.push({ game, players: players.map((p) => p.playerId) });
      return `R${rooms.length}`;
    },
  });
  const add = (id: string, rating: number, game: GameId = 'whot', playerId = id) =>
    mm.add({
      id,
      playerId,
      game,
      rating,
      matched: (code) => events.push(`${id}→${code}`),
      failed: (text) => events.push(`${id}✗${text}`),
    } satisfies Omit<Ticket, 'joinedAt'>);
  return { mm, rooms, events, add };
}

describe('quick-match queue', () => {
  it('pairs two close ratings at once, and only within the same game', async () => {
    const { mm, rooms, events, add } = setup();
    add('a', 1200);
    add('b', 1250, 'ayo');
    add('c', 1290);
    await vi.advanceTimersByTimeAsync(0);
    expect(rooms).toEqual([{ game: 'whot', players: ['a', 'c'] }]);
    expect(events).toEqual(['a→R1', 'c→R1']);
    expect(mm.size).toBe(1);
    mm.dispose();
  });

  it('picks the closest rating, not just the first one in the window', async () => {
    const { mm, rooms, add } = setup();
    add('far', 1000);
    add('near', 1500);
    add('me', 1480);
    await vi.advanceTimersByTimeAsync(0);
    expect(rooms[0]!.players.sort()).toEqual(['me', 'near']);
    mm.dispose();
  });

  it('widens the allowed gap the longer both players wait', async () => {
    const { mm, rooms, add } = setup();
    add('low', 1000);
    add('high', 1400);
    // A 400 gap needs both windows at 400: 100 + 25 × 12s.
    expect(ratingWindow(12_000)).toBe(400);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(rooms).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(rooms).toEqual([{ game: 'whot', players: ['low', 'high'] }]);
    mm.dispose();
  });

  it("doesn't throw a newcomer at someone far away just because the other player waited long", async () => {
    const { mm, rooms, add } = setup();
    add('old', 1000);
    await vi.advanceTimersByTimeAsync(30_000);
    add('new', 1600);
    await vi.advanceTimersByTimeAsync(0);
    expect(rooms).toEqual([]);
    mm.dispose();
  });

  it('seats a lone player against the computer when they ask, or after the longest wait', async () => {
    const { mm, rooms, events, add } = setup();
    add('a', 1200);
    mm.solo('a');
    await vi.advanceTimersByTimeAsync(0);
    expect(rooms).toEqual([{ game: 'whot', players: ['a'] }]);

    add('b', 1200, 'ayo');
    await vi.advanceTimersByTimeAsync(59_000);
    expect(rooms).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(rooms[1]).toEqual({ game: 'ayo', players: ['b'] });
    expect(events).toEqual(['a→R1', 'b→R2']);
    expect(mm.size).toBe(0);
  });

  it('drops leavers, and replaces the ticket when the same player queues from another tab', async () => {
    const { mm, rooms, events, add } = setup();
    add('tab1', 1200, 'whot', 'p1');
    add('tab2', 1200, 'whot', 'p1');
    expect(events).toEqual(['tab1✗You don join the queue for another tab.']);
    // Never matched against themselves.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(rooms).toEqual([]);
    mm.remove('tab2');
    expect(mm.size).toBe(0);
    add('x', 1200);
    add('y', 1200);
    await vi.advanceTimersByTimeAsync(0);
    expect(rooms).toEqual([{ game: 'whot', players: ['x', 'y'] }]);
  });

  it('tells both players when the room could not be opened', async () => {
    const { events, add } = setup({ fail: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    add('a', 1200);
    add('b', 1200);
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual(['a✗We no fit open the game. Try again.', 'b✗We no fit open the game. Try again.']);
  });
});

describe('supabaseRatings', () => {
  it('reads the rating with the secret key, and defaults to 1200 without a row', async () => {
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('u1') ? [{ rating: 1337 }] : [])));
    const read = supabaseRatings('https://x.supabase.co/', 'sb_secret_test', fetchImpl as unknown as typeof fetch);
    expect(await read('u1', 'ayo')).toBe(1337);
    expect(await read('u2', 'ayo')).toBe(1200);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/ratings?select=rating&user_id=eq.u1&game=eq.ayo');
    expect(init.headers).toEqual({ apikey: 'sb_secret_test' });
  });

  it('throws on a database error, so the queue can fall back to 1200', async () => {
    const read = supabaseRatings('https://x.supabase.co', 'k', (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch);
    await expect(read('u1', 'whot')).rejects.toThrow(/500/);
  });
});
