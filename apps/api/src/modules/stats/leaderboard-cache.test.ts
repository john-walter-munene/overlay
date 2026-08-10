// Unit tests for the leaderboard cache (OB-055). These exercise the pure
// caching logic against an in-memory store — no Redis required — covering the
// miss → write → hit → invalidate lifecycle, generation versioning, and the
// best-effort degradation when the store throws.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LeaderboardCache,
  leaderboardEntryKey,
  LEADERBOARD_GENERATION_KEY,
  type CacheStore,
} from './leaderboard-cache.ts';

/** Simple map-backed store standing in for Redis. */
class InMemoryStore implements CacheStore {
  readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.map.get(key) ?? '0') + 1;
    this.map.set(key, String(next));
    return next;
  }
}

/** Store whose every operation rejects, simulating an unreachable Redis. */
class BrokenStore implements CacheStore {
  async get(): Promise<string | null> {
    throw new Error('redis down');
  }
  async set(): Promise<void> {
    throw new Error('redis down');
  }
  async incr(): Promise<number> {
    throw new Error('redis down');
  }
}

test('read is a miss before anything is written', async () => {
  const cache = new LeaderboardCache(new InMemoryStore());
  const { rows, generation } = await cache.read(10, 100);
  assert.equal(rows, null);
  assert.equal(generation, 0);
});

test('write then read returns the cached rows (hit)', async () => {
  const cache = new LeaderboardCache(new InMemoryStore());
  const data = [{ name: 'alice', yield: 0.1 }];

  const first = await cache.read(10, 100);
  assert.equal(first.rows, null);
  await cache.write(first.generation, 10, 100, data);

  const second = await cache.read(10, 100);
  assert.deepEqual(second.rows, data);
});

test('cache is keyed by query shape', async () => {
  const cache = new LeaderboardCache(new InMemoryStore());
  await cache.write(0, 10, 100, [{ a: 1 }]);

  // Different minSample / limit must not collide with the entry above.
  assert.equal((await cache.read(50, 100)).rows, null);
  assert.equal((await cache.read(10, 25)).rows, null);
  assert.deepEqual((await cache.read(10, 100)).rows, [{ a: 1 }]);
});

test('invalidate retires cached entries so the next read is a miss', async () => {
  const store = new InMemoryStore();
  const cache = new LeaderboardCache(store);

  const first = await cache.read(10, 100);
  await cache.write(first.generation, 10, 100, [{ v: 'stale' }]);
  assert.deepEqual((await cache.read(10, 100)).rows, [{ v: 'stale' }]);

  await cache.invalidate();

  // After invalidation the generation advances and the old entry is unreachable.
  const afterInvalidate = await cache.read(10, 100);
  assert.equal(afterInvalidate.rows, null);
  assert.equal(afterInvalidate.generation, 1);

  await cache.write(afterInvalidate.generation, 10, 100, [{ v: 'fresh' }]);
  assert.deepEqual((await cache.read(10, 100)).rows, [{ v: 'fresh' }]);
});

test('a write pinned to a superseded generation is never served', async () => {
  // Models the read/settlement/write race: a request reads under gen 0, an
  // interleaving settlement invalidates (gen → 1), then the slow request writes
  // its now-stale rows. The stale write lands under gen 0 and is unreachable.
  const cache = new LeaderboardCache(new InMemoryStore());
  const read = await cache.read(10, 100);

  await cache.invalidate();
  await cache.write(read.generation, 10, 100, [{ v: 'stale' }]);

  assert.equal((await cache.read(10, 100)).rows, null);
});

test('generation counter uses the shared key', async () => {
  const store = new InMemoryStore();
  const cache = new LeaderboardCache(store);
  await cache.invalidate();
  assert.equal(store.map.get(LEADERBOARD_GENERATION_KEY), '1');
});

test('entry key encodes generation and query shape', () => {
  assert.equal(leaderboardEntryKey(2, 10, 100), 'leaderboard:v2:s10:l100');
});

test('a broken store degrades gracefully (miss / no-op, never throws)', async () => {
  const cache = new LeaderboardCache(new BrokenStore());

  const read = await cache.read(10, 100);
  assert.equal(read.rows, null);
  assert.equal(read.generation, 0);

  // write and invalidate must not throw even though the store rejects.
  await cache.write(0, 10, 100, [{ a: 1 }]);
  await cache.invalidate();
});
