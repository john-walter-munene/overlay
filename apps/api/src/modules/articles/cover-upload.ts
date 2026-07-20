/**
 * Storage for article cover images in the blog editor (OB-071).
 *
 * Covers are public (shown on blog cards and article pages), so they go in a
 * PUBLIC Supabase bucket and we persist the resulting public URL. For
 * zero-config local development we fall back to a local uploads directory
 * served at `${API_PUBLIC_URL}/uploads/<key>` (see main.ts static mount).
 *
 * We validate MIME type and size before persisting so the endpoint can't be
 * used to stash arbitrary/oversized files.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import {
  deletePublicObject,
  publicUrl,
  storageConfigured,
  uploadPublicObject,
} from '../../integrations/storage/supabase-storage';

/** Accepted cover image types. */
export const ALLOWED_COVER_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Max cover image size in bytes (5 MB — covers are larger than avatars). */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** The subset of a Multer file this helper needs (avoids an @types/multer dep). */
export interface UploadedCover {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export class InvalidCoverError extends Error {}

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
 * Validate and persist a cover image, returning a full public URL. Throws
 * {@link InvalidCoverError} for a missing, oversized or wrong-type file.
 */
export async function storeCover(
  file: UploadedCover | undefined,
): Promise<string> {
  if (!file || !file.buffer?.length) {
    throw new InvalidCoverError('A cover image file is required');
  }
  if (!ALLOWED_COVER_MIME.has(file.mimetype)) {
    throw new InvalidCoverError('Cover must be a JPG, PNG or WEBP image');
  }
  if (file.size > MAX_COVER_BYTES) {
    throw new InvalidCoverError('Cover must be 5 MB or smaller');
  }

  const key = `covers/${objectKey(file.originalname)}`;

  if (storageConfigured()) {
    await uploadPublicObject(key, file.buffer, file.mimetype);
    return publicUrl(key);
  }

  // Local dev fallback: write under the uploads dir, served as a static file.
  const dir = join(uploadDir(), 'covers');
  await mkdir(dir, { recursive: true });
  const fileName = key.slice('covers/'.length);
  await writeFile(join(dir, fileName), file.buffer);
  return `${localBaseUrl()}/uploads/covers/${fileName}`;
}

/** Delete a previously stored cover image by its URL. */
export async function deleteCover(url: string): Promise<void> {
  const base = `${localBaseUrl()}/uploads/`;

  let key: string | null = null;

  if (url.startsWith(base)) {
    key = url.slice(base.length);
  } else {
    const marker = '/storage/v1/object/public/';
    const index = url.indexOf(marker);
    if (index !== -1) {
      key = url.slice(index + marker.length);
    }
  }

  if (!key) return;

  if (storageConfigured()) {
    // The key returned from publicUrl() includes the bucket name prefix.
    // Our stored keys are `covers/<uuid>.ext`. Strip the bucket if present.
    const bucketPrefix = process.env.SUPABASE_AVATAR_BUCKET ?? 'avatars';
    const objectPath = key.startsWith(bucketPrefix + '/')
      ? key.slice(bucketPrefix.length + 1)
      : key;
    await deletePublicObject(objectPath);
    return;
  }

  // Delete the local file if it still exists.
  try {
    await unlink(join(uploadDir(), key));
  } catch {
    // Ignore missing files.
  }
}