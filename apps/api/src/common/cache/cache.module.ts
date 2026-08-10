import { Global, Module } from '@nestjs/common';
import { EntityCache } from './entity-cache';
import { CACHE_STORE, RedisCacheStore } from './redis-cache.store';

/** DI token for the cached public tipster profile (OB-130). */
export const TIPSTER_PROFILE_CACHE = Symbol('TIPSTER_PROFILE_CACHE');

/** DI token for the cached public article lists (OB-130). */
export const ARTICLE_LIST_CACHE = Symbol('ARTICLE_LIST_CACHE');

/**
 * Cache lifetimes. Both are short so an unlikely missed invalidation still
 * self-heals within the window; explicit write hooks keep reads correct in the
 * common case.
 */
export const TIPSTER_PROFILE_CACHE_TTL_SECONDS = 60;
export const ARTICLE_LIST_CACHE_TTL_SECONDS = 60;

/**
 * Redis caching layer for hot reads (OB-130). Exposes a single shared
 * {@link RedisCacheStore} connection plus the per-endpoint {@link EntityCache}
 * instances. Global so any feature module can inject a cache (and its
 * invalidation hooks) without re-importing — e.g. the stats worker invalidates
 * the tipster-profile cache after a recompute, while the tipsters module reads
 * through it.
 *
 * Every cache is best-effort: an unreachable Redis degrades to a direct DB read
 * (see {@link EntityCache}), so this layer is purely a performance optimization
 * and never a correctness dependency.
 */
@Global()
@Module({
  providers: [
    RedisCacheStore,
    { provide: CACHE_STORE, useExisting: RedisCacheStore },
    {
      provide: TIPSTER_PROFILE_CACHE,
      useFactory: (store: RedisCacheStore) =>
        new EntityCache(store, 'tipster:profile', TIPSTER_PROFILE_CACHE_TTL_SECONDS),
      inject: [RedisCacheStore],
    },
    {
      provide: ARTICLE_LIST_CACHE,
      useFactory: (store: RedisCacheStore) =>
        new EntityCache(store, 'article:list', ARTICLE_LIST_CACHE_TTL_SECONDS),
      inject: [RedisCacheStore],
    },
  ],
  exports: [CACHE_STORE, TIPSTER_PROFILE_CACHE, ARTICLE_LIST_CACHE],
})
export class CacheModule {}
