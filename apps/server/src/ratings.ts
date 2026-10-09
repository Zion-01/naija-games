import type { GameId } from '@naija/online';

/** A player's current rating for a game. Players with no `ratings` row (never played a rated game) are 1200. */
export type RatingSource = (userId: string, game: GameId) => Promise<number>;

export const DEFAULT_RATING = 1200;

/** Reads `ratings` with the secret key, for the verified user from `onAuth` (never a rating the client sent). */
export function supabaseRatings(supabaseUrl: string, secretKey: string, fetchImpl: typeof fetch = fetch): RatingSource {
  const base = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/ratings`;
  return async (userId, game) => {
    const query = new URLSearchParams({ select: 'rating', user_id: `eq.${userId}`, game: `eq.${game}` });
    const res = await fetchImpl(`${base}?${query}`, { headers: { apikey: secretKey } });
    if (!res.ok) throw new Error(`reading ratings failed: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as { rating?: unknown }[];
    const rating = rows[0]?.rating;
    return typeof rating === 'number' ? rating : DEFAULT_RATING;
  };
}

/** Uses Supabase when the server has the secret key; otherwise everyone is 1200 (development). */
export function ratingsFromEnv(env: NodeJS.ProcessEnv = process.env): RatingSource | null {
  return env.SUPABASE_URL && env.SUPABASE_SECRET_KEY ? supabaseRatings(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY) : null;
}
