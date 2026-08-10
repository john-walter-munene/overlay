import { Logger, type OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import type { CacheStore } from './leaderboard-cache';

/** DI token for the process-wide {@link LeaderboardCache}. */
export const LEADERBOARD_CACHE = Symbol('LEADERBOARD_CACHE');

/**
 * Redis-backed {@link CacheStore}. Mirrors the lazy, fast-failing connection the
 * readiness probe uses (`lazyConnect` + `enableOfflineQueue: false` + bounded
 * retries) so an unreachable Redis rejects promptly instead of buffering — the
 * {@link LeaderboardCache} then swallows the error and falls back to a DB read.
 */
export class RedisCacheStore implements CacheStore, OnModuleDestroy {
  private readonly log = new Logger(RedisCacheStore.name);
  private client?: IORedis;

  private redis(): IORedis {
    if (!this.client) {
      const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
      this.client = new IORedis(url, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2_000,
      });
      // Swallow async connection errors; callers surface them via the command
      // promise, and the cache treats any rejection as a miss/no-op.
      this.client.on('error', (err) =>
        this.log.debug(`leaderboard cache redis error: ${err.message}`),
      );
    }
    return this.client;
  }

  get(key: string): Promise<string | null> {
    return this.redis().get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis().set(key, value, 'EX', ttlSeconds);
  }

  incr(key: string): Promise<number> {
    return this.redis().incr(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = undefined;
    }
  }
}
