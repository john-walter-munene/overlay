'use client';

import { getAccessToken } from './auth';
import { API_URL } from './api';

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

/**
 * Download an export file from the API. Attaches the auth token, triggers a
 * browser download with the filename the server sends.
 */
export async function downloadExport(
  path: string,
  format: ExportFormat = 'xlsx',
  fallbackFilename = 'export',
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}${path}?format=${format}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (body?.message) msg = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition');
  let filename = fallbackFilename;
  if (disposition) {
    const match = disposition.match(/filename="?(.+?)"?$/);
    if (match) filename = match[1];
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}