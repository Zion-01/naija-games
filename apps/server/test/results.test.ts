import { describe, expect, it, vi } from 'vitest';
import { supabaseResults } from '../src/results';

const record = {
  game: 'whot' as const,
  code: 'ABCD',
  round: 2,
  startedAt: Date.UTC(2026, 9, 9, 12),
  players: [
    { seat: 0, userId: 'user-a', name: 'Ada', kind: 'human' as const, result: 'won' as const, abandoned: false },
    { seat: 1, userId: null, name: 'Mama Put', kind: 'ai' as const, result: 'lost' as const, abandoned: false },
  ],
};

describe('supabaseResults', () => {
  it('calls record_match with the secret key and returns the rating changes', async () => {
    const ratings = [{ seat: 0, before: 1200, after: 1220 }];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ match_id: 'm1', ratings })));
    const saved = await supabaseResults('https://x.supabase.co/', 'sb_secret_test', fetchImpl)(record);

    expect(saved).toEqual({ ratings });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/record_match');
    expect(init.headers).toMatchObject({ apikey: 'sb_secret_test' });
    expect(JSON.parse(init.body as string)).toEqual({
      game: 'whot',
      room_code: 'ABCD',
      round: 2,
      started_at: '2026-10-09T12:00:00.000Z',
      players: [
        { seat: 0, user_id: 'user-a', name: 'Ada', kind: 'human', result: 'won', abandoned: false },
        { seat: 1, user_id: null, name: 'Mama Put', kind: 'ai', result: 'lost', abandoned: false },
      ],
    });
  });

  it('throws on a database error so the room can log it', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"message":"permission denied"}', { status: 401 }));
    await expect(supabaseResults('https://x.supabase.co', 'bad', fetchImpl)(record)).rejects.toThrow(/401/);
  });
});
