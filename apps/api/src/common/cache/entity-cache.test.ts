// Unit tests for the generic entity cache (OB-130). These exercise the pure
// caching logic against an in-memory store — no Redis required — covering the
// miss → write → hit → invalidate lifecycle, generation versioning, scoped
// invalidation, the read-through helper, and best-effort degradation when the
// store throws.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EntityCache,
  readThroughCache,
  type CacheStore,
} from './entity-cache.ts';

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
  const cache = new EntityCache(new InMemoryStore(), 'ns');
  const { value, generation } = await cache.read('k');
  assert.equal(value, null);
  assert.equal(generation, 0);
});

test('write then read returns the cached value (hit)', async () => {
  const cache = new EntityCache(new InMemoryStore(), 'ns');
  const data = { name: 'alice', yield: 0.1 };

  const first = await cache.read('k');
  assert.equal(first.value, null);
  await cache.write(first.generation, 'k', data);

  const second = await cache.read('k');
  assert.deepEqual(second.value, data);
});

test('cache is keyed by key', async () => {
  const cache = new EntityCache(new InMemoryStore(), 'ns');
  await cache.write(0, 'a', { v: 1 });

  assert.equal((await cache.read('b')).value, null);
  assert.deepEqual((await cache.read('a')).value, { v: 1 });
});

test('invalidate retires cached entries so the next read is a miss', async () => {
  const cache = new EntityCache(new InMemoryStore(), 'ns');

  const first = await cache.read('k');
  await cache.write(first.generation, 'k', { v: 'stale' });
  assert.deepEqual((await cache.read('k')).value, { v: 'stale' });

  await cache.invalidate();

  const afterInvalidate = await cache.read('k');
  assert.equal(afterInvalidate.value, null);
  assert.equal(afterInvalidate.generation, 1);

  await cache.write(afterInvalidate.generation, 'k', { v: 'fresh' });
  assert.deepEqual((await cache.read('k')).value, { v: 'fresh' });
});

test('invalidate is scoped: other scopes keep their entries', async () => {
  const cache = new EntityCache(new InMemoryStore(), 'ns');

  await cache.write(0, 'k', { v: 'A' }, 'scopeA');
  await cache.write(0, 'k', { v: 'B' }, 'scopeB');

  // Invalidating scopeA must not touch scopeB.
  await cache.invalidate('scopeA');

  assert.equal((await cache.read('k', 'scopeA')).value, null);
  assert.deepEqual((await cache.read('k', 'scopeB')).value, { v: 'B' });
});

test('a write pinned to a superseded generation is never served', async () => {
  // Models the read/write race: a request reads under gen 0, an interleaving
  // write invalidates (gen → 1), then the slow request writes its now-stale
  // value. The stale write lands under gen 0 and is unreachable.
  const cache = new EntityCache(new InMemoryStore(), 'ns');
  const read = await cache.read('k');

  await cache.invalidate();
  await cache.write(read.generation, 'k', { v: 'stale' });

  assert.equal((await cache.read('k')).value, null);
});

test('readThroughCache computes on a miss, caches, then hits', async () => {
  const cache = new EntityCache(new InMemoryStore(), 'ns');
  let calls = 0;
  const compute = async () => {
    calls += 1;
    return { n: calls };
  };

  assert.deepEqual(await readThroughCache(cache, 'k', compute), { n: 1 });
  // Second call is a hit — compute is not invoked again.
  assert.deepEqual(await readThroughCache(cache, 'k', compute), { n: 1 });
  assert.equal(calls, 1);

  // After invalidation the next read recomputes.
  await cache.invalidate();
  assert.deepEqual(await readThroughCache(cache, 'k', compute), { n: 2 });
  assert.equal(calls, 2);
});

test('readThroughCache honors the scope argument', async () => {
  const cache = new EntityCache(new InMemoryStore(), 'ns');
  await readThroughCache(cache, 'k', async () => ({ v: 'A' }), 'scopeA');
  await readThroughCache(cache, 'k', async () => ({ v: 'B' }), 'scopeB');

  await cache.invalidate('scopeA');
  let recomputed = false;
  const a = await readThroughCache(
    cache,
    'k',
    async () => {
      recomputed = true;
      return { v: 'A2' };
    },
    'scopeA',
  );
  assert.deepEqual(a, { v: 'A2' });
  assert.ok(recomputed, 'scopeA recomputes after its invalidation');
  // scopeB is untouched.
  assert.deepEqual(
    await readThroughCache(cache, 'k', async () => ({ v: 'B2' }), 'scopeB'),
    { v: 'B' },
  );
});

test('a broken store degrades gracefully (miss / no-op, never throws)', async () => {
  const cache = new EntityCache(new BrokenStore(), 'ns');

  const read = await cache.read('k');
  assert.equal(read.value, null);
  assert.equal(read.generation, 0);

  // write and invalidate must not throw even though the store rejects.
  await cache.write(0, 'k', { a: 1 });
  await cache.invalidate();

  // readThroughCache still returns the freshly computed value on a broken store.
  const value = await readThroughCache(cache, 'k', async () => ({ ok: true }));
  assert.deepEqual(value, { ok: true });
});
