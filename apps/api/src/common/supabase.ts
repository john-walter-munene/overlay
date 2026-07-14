import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/**
 * Supabase Auth token verification (OB-145).
 *
 * Modern Supabase projects sign access tokens with an asymmetric key (ES256)
 * exposed via a JWKS endpoint, so the API verifies signatures against the
 * project's public keys — no shared secret required. `jose` caches the JWKS.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is not set');
  return url.replace(/\/+$/, '');
}

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl()}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

export interface SupabaseClaims extends JWTPayload {
  sub: string;
  email?: string;
  /** Custom app metadata (e.g. role) set on the Supabase user. */
  app_metadata?: { role?: string } & Record<string, unknown>;
  user_metadata?: { role?: string } & Record<string, unknown>;
}

/**
 * Verify a Supabase access token and return its claims. Throws if invalid,
 * expired, or issued by another project.
 */
export async function verifySupabaseToken(
  token: string,
): Promise<SupabaseClaims> {
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: `${supabaseUrl()}/auth/v1`,
    audience: 'authenticated',
  });
  if (!payload.sub) throw new Error('Token missing sub');
  return payload as SupabaseClaims;
}
