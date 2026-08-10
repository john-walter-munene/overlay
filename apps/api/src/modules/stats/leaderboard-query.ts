/**
 * Decorator-free read-through wrapper for the leaderboard (OB-055). Extracted
 * from the Nest service so the cache wiring is unit/integration-testable under
 * the `--experimental-strip-types` runner (which rejects decorators / parameter
 * properties), mirroring `health.checks.ts` and `announcements.core.ts`.
 */

import type { LeaderboardCache } from './leaderboard-cache';

/**
 * Serve `compute()`'s result through the cache: return the cached rows on a hit,
 * otherwise compute fresh rows and store them under the generation observed at
 * read time (so a settlement that invalidates mid-flight can't be overwritten).
 * The cache is best-effort, so a cold/unreachable cache simply recomputes.
 */
export async function readLeaderboardCached<T>(
  cache: LeaderboardCache,
  minSampleSize: number,
  limit: number,
  compute: () => Promise<T[]>,
): Promise<T[]> {
  const cached = await cache.read<T>(minSampleSize, limit);
  if (cached.rows !== null) return cached.rows;

  const rows = await compute();
  await cache.write(cached.generation, minSampleSize, limit, rows);
  return rows;
}
