import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** Who a client is, as decided in `onAuth` before they join a room. */
export type Identity = {
  /** Owns a seat: reconnecting with the same id gives the seat back. */
  playerId: string;
  /** The Supabase user, when signed in. Results are only saved for these. */
  userId: string | null;
};

export type Authenticator = (token: string | undefined, options: { guestId?: unknown }) => Promise<Identity>;

export class AuthError extends Error {}

/**
 * Signed-in mode: a Supabase access token is required, verified against the project's published signing keys.
 * Anonymous Supabase users count as signed in (that's how guests play), so `userId` is always set.
 */
export function supabaseAuth(supabaseUrl: string, keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))): Authenticator {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  return async (token) => {
    if (!token) throw new AuthError('Sign in first');
    try {
      const { payload } = await jwtVerify(token, keys, { issuer, audience: 'authenticated' });
      if (!payload.sub) throw new AuthError('Bad token');
      return { playerId: payload.sub, userId: payload.sub };
    } catch {
      throw new AuthError('Your sign-in don expire. Refresh the page.');
    }
  };
}

/**
 * Development and tests without Supabase: the device's random `guestId` owns the seat. Anyone who knows it can
 * take the seat, so production must use `supabaseAuth`.
 */
export const guestAuth: Authenticator = async (_token, options) => {
  const id = options.guestId;
  if (typeof id !== 'string' || id.length < 8 || id.length > 64) throw new AuthError('Missing guest id');
  return { playerId: `guest:${id}`, userId: null };
};

/** Picks the mode from the environment: `SUPABASE_URL` set means signed-in mode. */
export function authFromEnv(env: NodeJS.ProcessEnv = process.env): Authenticator {
  if (env.SUPABASE_URL) return supabaseAuth(env.SUPABASE_URL);
  if (env.NODE_ENV === 'production') throw new Error('SUPABASE_URL must be set in production (guest ids are not safe as identity).');
  console.warn('SUPABASE_URL is not set: players are identified by guest ids (development only).');
  return guestAuth;
}
