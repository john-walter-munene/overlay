/**
 * Generic, best-effort read-through cache for hot reads (OB-130). Generalizes
 * the generation-versioned leaderboard cache (OB-055) so any read-heavy,
 * write-invalidated endpoint — tipster profiles, article lists — can be served
 * from Redis with a short TTL and correct invalidation, without recomputing the
 * (join-heavy) query on every request.
 *
 * Like the leaderboard cache it is I/O-agnostic: it talks to a tiny
 * {@link CacheStore} port (get/set/incr) so the correctness-critical logic is
 * unit-testable against an in-memory map, and a Redis adapter lives in
 * `redis-cache.store.ts`.
 *
 * Invalidation is generation-versioned and scoped: bumping a scope's generation
 * counter retires every entry under that scope at once (old keys just expire on
 * their TTL) with no key scan. A `scope` lets callers invalidate a single
 * entity (e.g. one tipster's profile) without evicting unrelated entries; the
 * default/global scope backs list caches that change on any write.
 *
 * Every operation is best-effort: any store failure is swallowed and reported
 * as a miss / no-op, so an unreachable Redis degrades to a direct recompute
 * rather than breaking the endpoint.
 */

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
 * the cached value, or `null` on a miss. */
export interface EntityCacheRead<T> {
  generation: number;
  value: T | null;
}

/** Default cache lifetime. A short TTL bounds staleness even if an explicit
 * invalidation is ever missed. */
export const DEFAULT_CACHE_TTL_SECONDS = 60;

/** Sentinel scope for caches that invalidate globally (e.g. list endpoints). */
const GLOBAL_SCOPE = '';

/**
 * Best-effort, generation-versioned cache for a namespace of entries. Entries
 * are addressed by an arbitrary string `key` (typically a query signature or an
 * entity id) within an optional `scope` used as the invalidation unit.
 */
export class EntityCache {
  private readonly store: CacheStore;
  private readonly namespace: string;
  private readonly ttlSeconds: number;

  constructor(
    store: CacheStore,
    namespace: string,
    ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS,
  ) {
    this.store = store;
    this.namespace = namespace;
    this.ttlSeconds = ttlSeconds;
  }

  private generationKey(scope: string): string {
    return scope === GLOBAL_SCOPE
      ? `${this.namespace}:generation`
      : `${this.namespace}:generation:${scope}`;
  }

  private entryKey(generation: number, scope: string, key: string): string {
    return `${this.namespace}:v${generation}:${scope}:${key}`;
  }

  private async generation(scope: string): Promise<number> {
    const raw = await this.store.get(this.generationKey(scope));
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Look up a cached value. Returns the current generation alongside the value
   * so the caller can pass it back to {@link write} — pinning the write to the
   * generation observed at read time so a concurrent invalidation can't be
   * overwritten with stale data.
   */
  async read<T>(
    key: string,
    scope: string = GLOBAL_SCOPE,
  ): Promise<EntityCacheRead<T>> {
    try {
      const generation = await this.generation(scope);
      const raw = await this.store.get(this.entryKey(generation, scope, key));
      return {
        generation,
        value: raw === null ? null : (JSON.parse(raw) as T),
      };
    } catch {
      // Treat any failure (unreachable store, malformed value) as a miss.
      return { generation: 0, value: null };
    }
  }

  /** Store a freshly computed value under the generation from {@link read}. */
  async write<T>(
    generation: number,
    key: string,
    value: T,
    scope: string = GLOBAL_SCOPE,
  ): Promise<void> {
    try {
      await this.store.set(
        this.entryKey(generation, scope, key),
        JSON.stringify(value),
        this.ttlSeconds,
      );
    } catch {
      // Best-effort: a failed write just means the next read is a miss.
    }
  }

  /**
   * Retire every cached entry in a scope. Bumping the generation makes all
   * previous keys under the scope unreachable (they expire on their own TTL), so
   * the next read is a miss and recomputes fresh. Called after each write that
   * changes the underlying data.
   */
  async invalidate(scope: string = GLOBAL_SCOPE): Promise<void> {
    try {
      await this.store.incr(this.generationKey(scope));
    } catch {
      // Best-effort: if the bump fails the short TTL still bounds staleness.
    }
  }
}

/**
 * Serve `compute()`'s result through the cache: return the cached value on a
 * hit, otherwise compute it and store it under the generation observed at read
 * time (so an invalidation mid-flight can't be overwritten). The cache is
 * best-effort, so a cold/unreachable cache simply recomputes.
 */
export async function readThroughCache<T>(
  cache: EntityCache,
  key: string,
  compute: () => Promise<T>,
  scope?: string,
): Promise<T> {
  const cached = await cache.read<T>(key, scope);
  if (cached.value !== null) return cached.value;

  const value = await compute();
  await cache.write(cached.generation, key, value, scope);
  return value;
}
