/**
 * Load the repo-root `.env` into process.env for local dev (OB-045).
 *
 * `nest start` / `node dist/*.js` don't read `.env` automatically. In
 * containers/Render the environment is injected directly (no file), so this is
 * a no-op there. We walk up from the cwd to find the nearest `.env` — that way
 * it works whether the process starts at the repo root or in `apps/api`.
 *
 * Values already present in the environment take precedence (Node's env-file
 * semantics), so this never overrides real production config.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function loadDotenv(): void {
  if (typeof process.loadEnvFile !== 'function') return;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
      } catch {
        /* malformed/locked file — ignore, fall back to real env */
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
