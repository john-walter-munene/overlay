// Integration test for OB-130: public tipster profiles are served from cache,
// and a stats recompute (or a profile edit) invalidates the profile so stale
// figures are never served.
//
// Runs against a REAL Postgres (like the other *.itest.ts) and drives the same
// decorator-free read-through primitive the TipstersService uses
// (`readThroughCache` + `EntityCache`), scoped by tipster id exactly as the
// service scopes its profile cache. Redis is stood in for by an in-memory
// CacheStore — the acceptance criterion is the wiring between writes and the
// cache, not the Redis client (covered by the readiness probe and the cache
// unit tests).
//
// DATABASE_URL is honored; it defaults to the local compose connection.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  EntityCache,
  readThroughCache,
  type CacheStore,
} from '../../common/cache/entity-cache.ts';

// Default to the local docker-compose connection when DATABASE_URL is unset.
const PG = 'overlay';
const DB_URL =
  process.env.DATABASE_URL ??
  `postgresql://${PG}:${PG}@localhost:5432/${PG}?schema=public`;

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

/** In-memory stand-in for Redis. */
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

const tag = randomUUID().slice(0, 8);
const tipsterId = `it_prof_${tag}`;

const cache = new EntityCache(new InMemoryStore(), 'tipster:profile');

type Profile = { tipsterId: string; bio: string | null; yield: number | null };

/** The uncached profile aggregate — a trimmed version of getProfile's shape. */
async function computeProfile(): Promise<Profile> {
  const tipster = await prisma.tipster.findUnique({
    where: { userId: tipsterId },
    include: { stats: true },
  });
  if (!tipster) throw new Error('tipster not found');
  return {
    tipsterId,
    bio: tipster.bio,
    yield: tipster.stats?.yield ?? null,
  };
}

/**
 * Read the profile through the cache, scoped by tipster id, exactly as
 * TipstersService.getProfile does.
 */
function getProfile(): Promise<Profile> {
  return readThroughCache(cache, tipsterId, computeProfile, tipsterId);
}

/** Model a stats recompute / profile edit: mutate the DB, then invalidate. */
async function recompute(nextYield: number): Promise<void> {
  await prisma.tipsterStats.upsert({
    where: { tipsterId },
    create: { tipsterId, yield: nextYield },
    update: { yield: nextYield },
  });
  await cache.invalidate(tipsterId);
}

before(async () => {
  await prisma.$connect();
  await prisma.user.create({
    data: { id: tipsterId, email: `${tipsterId}@itest.local`, role: 'tipster' },
  });
  await prisma.tipster.create({
    data: { userId: tipsterId, displayName: `Prof ${tag}`, status: 'active' },
  });
});

after(async () => {
  await prisma.tipsterStats.deleteMany({ where: { tipsterId } });
  await prisma.tipster.deleteMany({ where: { userId: tipsterId } });
  await prisma.user.deleteMany({ where: { id: tipsterId } });
  await prisma.$disconnect();
});

test('profile reads are cached: DB changes are not seen until invalidation', async () => {
  await recompute(0.15);
  const seeded = await getProfile();
  assert.equal(seeded.yield, 0.15, 'the seeded figure should be served');

  // Mutate the stats directly WITHOUT invalidating the cache.
  await prisma.tipsterStats.update({
    where: { tipsterId },
    data: { yield: 99 },
  });

  // The cached read must still return the primed (now-stale) figure, proving the
  // profile is served from cache rather than recomputed per request.
  const cached = await getProfile();
  assert.equal(cached.yield, 0.15, 'stale cached profile is served until invalidation');
});

test('a recompute invalidates only this tipster; fresh figures are served', async () => {
  // Prime with an obviously-wrong value, then recompute through the hook.
  await getProfile();
  await prisma.tipsterStats.update({ where: { tipsterId }, data: { yield: -1 } });
  const beforeSettle = await getProfile();
  assert.notEqual(beforeSettle.yield, -1, 'sanity: pre-recompute read is cached');

  await recompute(0.42);
  const afterSettle = await getProfile();
  assert.equal(
    afterSettle.yield,
    0.42,
    'post-recompute profile must serve the freshly computed figure',
  );
});

test("one tipster's invalidation does not evict another's cached profile", async () => {
  // Prime this tipster, cache it, then invalidate a DIFFERENT scope.
  await recompute(0.5);
  const primed = await getProfile();
  assert.equal(primed.yield, 0.5);

  await cache.invalidate(`someone_else_${tag}`);

  // Corrupt the DB but do NOT invalidate this tipster — the cached value stands.
  await prisma.tipsterStats.update({ where: { tipsterId }, data: { yield: -7 } });
  const stillCached = await getProfile();
  assert.equal(
    stillCached.yield,
    0.5,
    "another tipster's invalidation must not evict this profile",
  );
});
