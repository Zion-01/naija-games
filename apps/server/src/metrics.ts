import type { GameId } from '@naija/online';

/**
 * Anonymous gameplay totals ("privacy-friendly analytics"): counters and peaks, kept in memory and flushed in one
 * batch about once a minute to the `daily_counts` table. Nothing here identifies a player: no ids, codes or names.
 */
export type Metric =
  | 'room.invite'
  | 'room.quick'
  | 'game.started'
  | 'game.with_computer'
  | 'game.rematch'
  | 'game.finished'
  | 'game.abandoned'
  | 'quick.matched'
  | 'quick.solo'
  | 'emote.sent'
  | 'players.peak'
  | 'rooms.peak';

export type Count = { metric: Metric; game: GameId | ''; value: number; op: 'sum' | 'max' };
export type MetricsSink = (counts: Count[]) => Promise<void>;

export class Metrics {
  private pending = new Map<string, Count>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly sink: MetricsSink | null) {}

  /** Adds to today's count. */
  count(metric: Metric, game: GameId | '' = '', by = 1) {
    if (!this.sink) return;
    const key = `${metric}|${game}|sum`;
    const c = this.pending.get(key);
    if (c) c.value += by;
    else this.pending.set(key, { metric, game, value: by, op: 'sum' });
  }

  /** Records a level (players online…); the day keeps the highest one seen. */
  peak(metric: Metric, value: number, game: GameId | '' = '') {
    if (!this.sink) return;
    const key = `${metric}|${game}|max`;
    const c = this.pending.get(key);
    if (c) c.value = Math.max(c.value, value);
    else this.pending.set(key, { metric, game, value, op: 'max' });
  }

  /** What would be sent on the next flush (tests). */
  peek(): Count[] {
    return [...this.pending.values()];
  }

  /** Sends what's pending. A failed batch is merged back, so counts survive a short database outage. */
  async flush() {
    if (!this.sink || this.pending.size === 0) return;
    const batch = [...this.pending.values()];
    this.pending = new Map();
    try {
      await this.sink(batch);
    } catch (e) {
      console.error('metrics: flush failed, keeping the counts for next time:', e);
      for (const c of batch) c.op === 'max' ? this.peak(c.metric, c.value, c.game) : this.count(c.metric, c.game, c.value);
    }
  }

  start(everyMs = 60_000) {
    if (!this.sink || this.timer) return;
    this.timer = setInterval(() => void this.flush(), everyMs);
    this.timer.unref?.();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }
}

/** Writes batches through the `add_daily_counts` database function with the secret key. */
export function supabaseMetrics(supabaseUrl: string, secretKey: string, fetchImpl: typeof fetch = fetch): MetricsSink {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/add_daily_counts`;
  return async (counts) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { apikey: secretKey, 'content-type': 'application/json' },
      body: JSON.stringify({ counts }),
    });
    if (!res.ok) throw new Error(`add_daily_counts failed: ${res.status} ${await res.text()}`);
  };
}

/** Counts are only kept when the server can save them (SUPABASE_URL and SUPABASE_SECRET_KEY). */
export function metricsFromEnv(env: NodeJS.ProcessEnv = process.env): MetricsSink | null {
  return env.SUPABASE_URL && env.SUPABASE_SECRET_KEY ? supabaseMetrics(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY) : null;
}
