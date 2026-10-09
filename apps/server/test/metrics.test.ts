import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ayoRules } from '../src/games';
import { Match } from '../src/match';
import { Metrics, supabaseMetrics, type Count } from '../src/metrics';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('metrics', () => {
  it('sums counts, keeps peaks, and sends one batch per flush', async () => {
    const sent: Count[][] = [];
    const m = new Metrics(async (counts) => void sent.push(counts));
    m.count('game.started', 'whot');
    m.count('game.started', 'whot');
    m.count('game.started', 'ayo');
    m.peak('players.peak', 3);
    m.peak('players.peak', 7);
    m.peak('players.peak', 5);
    await m.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(
      expect.arrayContaining([
        { metric: 'game.started', game: 'whot', value: 2, op: 'sum' },
        { metric: 'game.started', game: 'ayo', value: 1, op: 'sum' },
        { metric: 'players.peak', game: '', value: 7, op: 'max' },
      ]),
    );
    await m.flush();
    expect(sent).toHaveLength(1);
  });

  it('keeps counts when a flush fails, and flushes on a timer', async () => {
    const sink = vi.fn<(c: Count[]) => Promise<void>>().mockRejectedValueOnce(new Error('db down')).mockResolvedValue();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const m = new Metrics(sink);
    m.count('emote.sent', 'ayo', 2);
    m.start(1000);
    await vi.advanceTimersByTimeAsync(1000);
    m.count('emote.sent', 'ayo');
    await vi.advanceTimersByTimeAsync(1000);
    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls[1]![0]).toEqual([{ metric: 'emote.sent', game: 'ayo', value: 3, op: 'sum' }]);
    await m.stop();
  });

  it('does nothing without a sink (development)', () => {
    const m = new Metrics(null);
    m.count('game.started', 'whot');
    expect(m.peek()).toEqual([]);
  });

  it('posts batches to add_daily_counts with the secret key', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await supabaseMetrics('https://x.supabase.co/', 'sb_secret_test', fetchImpl as unknown as typeof fetch)([
      { metric: 'quick.solo', game: 'whot', value: 1, op: 'sum' },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/add_daily_counts');
    expect((init.headers as Record<string, string>).apikey).toBe('sb_secret_test');
    expect(JSON.parse(init.body as string)).toEqual({ counts: [{ metric: 'quick.solo', game: 'whot', value: 1, op: 'sum' }] });
  });

  it('is told about every deal, rematches included, with how many computer seats there are', () => {
    const onBegin = vi.fn();
    const match = new Match('AYOO', ayoRules(), 1, () => {}, { onBegin });
    match.join('a', { nickname: 'a' }, { playerId: 'guest:a', userId: null });
    match.start('a');
    expect(onBegin).toHaveBeenLastCalledWith({ round: 0, computerSeats: 1 });
  });
});
