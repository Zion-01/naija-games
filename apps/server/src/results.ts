import type { RatingChange } from '@naija/online';
import type { MatchRecord } from './match';

/** What saving a game gives back: each rated seat's rating change (empty when the game wasn't rated). */
export type SavedResult = { ratings: RatingChange[] };

export type ResultSink = (record: MatchRecord) => Promise<SavedResult>;

/** Saves finished games through the `record_match` database function, which also updates Elo ratings. */
export function supabaseResults(supabaseUrl: string, secretKey: string, fetchImpl: typeof fetch = fetch): ResultSink {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/record_match`;
  return async (record) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { apikey: secretKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        game: record.game,
        room_code: record.code,
        round: record.round,
        started_at: new Date(record.startedAt).toISOString(),
        players: record.players.map((p) => ({
          seat: p.seat,
          user_id: p.userId,
          name: p.name,
          kind: p.kind,
          result: p.result,
          abandoned: p.abandoned,
        })),
      }),
    });
    if (!res.ok) throw new Error(`record_match failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { ratings?: RatingChange[] };
    return { ratings: Array.isArray(body.ratings) ? body.ratings : [] };
  };
}

/** Saves results only when the server has the secret key; otherwise games simply aren't recorded. */
export function resultsFromEnv(env: NodeJS.ProcessEnv = process.env): ResultSink | null {
  if (env.SUPABASE_URL && env.SUPABASE_SECRET_KEY) return supabaseResults(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  if (env.SUPABASE_URL) console.warn('SUPABASE_SECRET_KEY is not set: online results will not be saved.');
  return null;
}
