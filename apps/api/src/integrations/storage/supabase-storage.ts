/**
 * Supabase Storage adapter (OB-020) for private onboarding identity documents.
 *
 * Uses the Storage REST API directly (global fetch) rather than pulling in the
 * `@supabase/supabase-js` SDK — mirroring how auth verifies JWTs with `jose`.
 * Requests are authenticated with the project's SERVICE ROLE key, so the target
 * bucket MUST be private (RLS/anon has no access); documents are only ever read
 * back through short-lived signed URLs minted server-side for admin review.
 *
 * Config:
 *   SUPABASE_URL                 — project URL (already required for auth)
 *   SUPABASE_SERVICE_ROLE_KEY    — server-only service role key (secret)
 *   SUPABASE_STORAGE_BUCKET      — private bucket name (default identity-documents)
 */

const DEFAULT_BUCKET = 'identity-documents';

/** True when Supabase Storage is configured (URL + service role key present). */
export function storageConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function baseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is not set');
  return url.replace(/\/+$/, '');
}

function serviceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return key;
}

function bucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? DEFAULT_BUCKET;
}

/** Public bucket for avatars (world-readable objects, served via public URL). */
function publicBucket(): string {
  return process.env.SUPABASE_AVATAR_BUCKET ?? 'avatars';
}

function authHeaders(): Record<string, string> {
  const key = serviceKey();
  return { authorization: `Bearer ${key}`, apikey: key };
}

/** Encode each path segment while preserving the `/` separators. */
function encodeObjectPath(objectPath: string): string {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

/**
 * Upload (upsert) an object into the private bucket. `objectPath` is the
 * storage-relative key (e.g. `<uuid>.pdf`). Throws on a non-2xx response.
 */
export async function uploadObject(
  objectPath: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/storage/v1/object/${bucket()}/${encodeObjectPath(objectPath)}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'content-type': contentType,
        'cache-control': '3600',
        'x-upsert': 'true',
      },
      body,
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase Storage upload failed (${res.status}): ${detail}`);
  }
}

/**
 * Mint a short-lived signed URL (default 5 minutes) for reading a private
 * object. Returns an absolute URL the browser can fetch directly.
 */
export async function createSignedUrl(
  objectPath: string,
  expiresIn = 300,
): Promise<string> {
  const res = await fetch(
    `${baseUrl()}/storage/v1/object/sign/${bucket()}/${encodeObjectPath(objectPath)}`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase Storage sign failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { signedURL: string };
  // The API returns a path relative to /storage/v1 (e.g. /object/sign/...).
  return `${baseUrl()}/storage/v1${data.signedURL}`;
}

/**
 * Upload (upsert) an object into the PUBLIC bucket (avatars). The bucket must be
 * marked public in Supabase so objects are world-readable via {@link publicUrl}.
 */
export async function uploadPublicObject(
  objectPath: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/storage/v1/object/${publicBucket()}/${encodeObjectPath(objectPath)}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'content-type': contentType,
        'cache-control': '3600',
        'x-upsert': 'true',
      },
      body,
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase Storage upload failed (${res.status}): ${detail}`);
  }
}

/** Stable public URL for an object in the public bucket. */
export function publicUrl(objectPath: string): string {
  return `${baseUrl()}/storage/v1/object/public/${publicBucket()}/${encodeObjectPath(objectPath)}`;
}

