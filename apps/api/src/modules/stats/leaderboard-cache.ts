/**
 * Leaderboard cache (OB-055). The leaderboard is read on every marketplace page
 * load but only changes when the settlement worker recomputes stats, so serving
 * it from a full DB aggregate per request is wasteful. This caches the rendered
 * rows in Redis and invalidates them after each stats recompute, so the board
 * "updates within minutes of settlement" without recomputing per request.
 *
 * The cache is deliberately I/O-agnostic: it talks to a tiny {@link CacheStore}
 * port (get/set/incr) so the correctness-critical caching logic is unit-testable
 * with an in-memory store, mirroring how the readiness checks take probe
 * functions. A Redis-backed store lives in `leaderboard-cache.redis.ts`.
 *
 * Every operation is best-effort: any store failure is swallowed and reported as
 * a miss / no-op so an unreachable Redis degrades to a direct DB read rather
 * than breaking the leaderboard.
 */

/** Default cache lifetime. A short TTL bounds staleness even if an explicit
 * invalidation is ever missed, satisfying the "within minutes" exit criteria. */
export const LEADERBOARD_CACHE_TTL_SECONDS = 60;

/** Monotonic generation counter; bumping it retires every cached entry at once
 * without an expensive key scan. */
export const LEADERBOARD_GENERATION_KEY = 'leaderboard:generation';

/**
 * Minimal key/value port the cache depends on. Implemented by a Redis adapter in
 * production and by an in-memory map in tests.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  incr(key: string): Promise<number>;
}

/** Result of a cache read: the generation the value was keyed under (so the
 * subsequent write reuses it and can't clobber a concurrent invalidation) and
 * the cached rows, or `null` on a miss. */
export interface LeaderboardCacheRead<T> {
  generation: number;
  rows: T[] | null;
}

/** Build the cache key for a specific query shape under a given generation. */
export function leaderboardEntryKey(
  generation: number,
  minSampleSize: number,
  limit: number,
): string {
  return `leaderboard:v${generation}:s${minSampleSize}:l${limit}`;
}

/**
 * Best-effort, generation-versioned cache for leaderboard result sets.
 */
export class LeaderboardCache {
  private readonly store: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    store: CacheStore,
    ttlSeconds: number = LEADERBOARD_CACHE_TTL_SECONDS,
  ) {
    this.store = store;
    this.ttlSeconds = ttlSeconds;
  }

  private async generation(): Promise<number> {
    const raw = await this.store.get(LEADERBOARD_GENERATION_KEY);
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Look up a cached leaderboard for the given query shape. Returns the current
   * generation alongside the rows so the caller can pass it back to {@link write}
   * — pinning the write to the generation observed at read time so a settlement
   * that invalidates in between can't be overwritten with stale data.
   */
  async read<T>(
    minSampleSize: number,
    limit: number,
  ): Promise<LeaderboardCacheRead<T>> {
    try {
      const generation = await this.generation();
      const raw = await this.store.get(
        leaderboardEntryKey(generation, minSampleSize, limit),
      );
      return {
        generation,
        rows: raw === null ? null : (JSON.parse(raw) as T[]),
      };
    } catch {
      // Treat any failure (unreachable store, malformed value) as a miss.
      return { generation: 0, rows: null };
    }
  }

  /** Store a freshly computed leaderboard under the generation from {@link read}. */
  async write<T>(
    generation: number,
    minSampleSize: number,
    limit: number,
    rows: T[],
  ): Promise<void> {
    try {
      await this.store.set(
        leaderboardEntryKey(generation, minSampleSize, limit),
        JSON.stringify(rows),
        this.ttlSeconds,
      );
    } catch {
      // Best-effort: a failed write just means the next read is a miss.
    }
  }

  /**
   * Retire every cached leaderboard. Bumping the generation makes all previous
   * keys unreachable (they expire on their own TTL), so the next read is a miss
   * and recomputes fresh rows. Called after each stats recompute.
   */
  async invalidate(): Promise<void> {
    try {
      await this.store.incr(LEADERBOARD_GENERATION_KEY);
    } catch {
      // Best-effort: if the bump fails the short TTL still bounds staleness.
    }
  }
}
