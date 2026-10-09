import { describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { AuthError, authFromEnv, guestAuth, supabaseAuth } from '../src/auth';

const URL = 'https://example.supabase.co';

async function setup() {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
  const auth = supabaseAuth(URL, createLocalJWKSet({ keys: [jwk] }));
  const sign = (claims: { sub?: string; iss?: string; aud?: string; exp?: string }) => {
    const jwt = new SignJWT({ role: 'authenticated', is_anonymous: true })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer(claims.iss ?? `${URL}/auth/v1`)
      .setAudience(claims.aud ?? 'authenticated')
      .setIssuedAt()
      .setExpirationTime(claims.exp ?? '1h');
    if (claims.sub !== undefined) jwt.setSubject(claims.sub);
    return jwt.sign(privateKey);
  };
  return { auth, sign };
}

describe('supabaseAuth', () => {
  it('accepts a valid access token and uses its user id for the seat', async () => {
    const { auth, sign } = await setup();
    const token = await sign({ sub: 'user-123' });
    await expect(auth(token, { guestId: 'ignored-guest-id' })).resolves.toEqual({ playerId: 'user-123', userId: 'user-123' });
  });

  it('refuses missing, foreign, expired and unsigned tokens', async () => {
    const { auth, sign } = await setup();
    await expect(auth(undefined, {})).rejects.toThrow(AuthError);
    await expect(auth(await sign({ sub: 'u', iss: 'https://evil.supabase.co/auth/v1' }), {})).rejects.toThrow(AuthError);
    await expect(auth(await sign({ sub: 'u', aud: 'anon' }), {})).rejects.toThrow(AuthError);
    await expect(auth(await sign({ sub: 'u', exp: '-1m' }), {})).rejects.toThrow(AuthError);
    await expect(auth(await sign({}), {})).rejects.toThrow(AuthError);
    const other = await setup();
    await expect(auth(await other.sign({ sub: 'u' }), {})).rejects.toThrow(AuthError);
  });
});

describe('guestAuth', () => {
  it('uses the device guest id, never as an account', async () => {
    await expect(guestAuth(undefined, { guestId: 'guest-abc-123' })).resolves.toEqual({ playerId: 'guest:guest-abc-123', userId: null });
    await expect(guestAuth(undefined, { guestId: 'short' })).rejects.toThrow(AuthError);
    await expect(guestAuth(undefined, {})).rejects.toThrow(AuthError);
  });
});

describe('authFromEnv', () => {
  it('refuses to run a production server on guest ids', () => {
    expect(() => authFromEnv({ NODE_ENV: 'production' })).toThrow(/SUPABASE_URL/);
    expect(authFromEnv({ NODE_ENV: 'test' })).toBe(guestAuth);
  });
});
