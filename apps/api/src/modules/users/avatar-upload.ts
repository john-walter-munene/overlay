/**
 * Storage for optional user avatars.
 *
 * Avatars are public (shown on profiles), so they go in a PUBLIC Supabase
 * bucket and we persist the resulting public URL. For zero-config local
 * development we fall back to a local uploads directory served at
 * `${API_PUBLIC_URL}/uploads/<key>` (see main.ts static mount).
 *
 * We validate MIME type and size before persisting so the endpoint can't be
 * used to stash arbitrary/oversized files.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import {
  publicUrl,
  storageConfigured,
  uploadPublicObject,
} from '../../integrations/storage/supabase-storage';

/** Accepted avatar image types. */
export const ALLOWED_AVATAR_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Max avatar size in bytes (2 MB). */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** The subset of a Multer file this helper needs (avoids an @types/multer dep). */
export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export class InvalidAvatarError extends Error {}

function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
}

function localBaseUrl(): string {
  const explicit = process.env.API_PUBLIC_URL?.replace(/\/+$/, '');
  if (explicit) return explicit;
  const port = process.env.PORT ?? process.env.API_PORT ?? 4000;
  return `http://localhost:${port}`;
}

function objectKey(originalName: string): string {
  const ext = extname(originalName).toLowerCase().slice(0, 10) || '.png';
  return `${randomUUID()}${ext}`;
}

/**
 * Validate and persist an avatar image, returning a full public URL. Throws
 * {@link InvalidAvatarError} for a missing, oversized or wrong-type file.
 */
export async function storeAvatar(
  file: UploadedImage | undefined,
): Promise<string> {
  if (!file || !file.buffer?.length) {
    throw new InvalidAvatarError('An image file is required');
  }
  if (!ALLOWED_AVATAR_MIME.has(file.mimetype)) {
    throw new InvalidAvatarError('Avatar must be a JPG, PNG or WEBP image');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new InvalidAvatarError('Avatar must be 2 MB or smaller');
  }

  const key = `avatars/${objectKey(file.originalname)}`;

  if (storageConfigured()) {
    await uploadPublicObject(key, file.buffer, file.mimetype);
    return publicUrl(key);
  }

  // Local dev fallback: write under the uploads dir, served as a static file.
  const dir = join(uploadDir(), 'avatars');
  await mkdir(dir, { recursive: true });
  const fileName = key.slice('avatars/'.length);
  await writeFile(join(dir, fileName), file.buffer);
  return `${localBaseUrl()}/uploads/avatars/${fileName}`;
}
