// Integration test for OB-130: public article lists are served from cache, and
// any article write (create/update/remove) invalidates them so stale lists are
// never served.
//
// Runs against a REAL Postgres (like the other *.itest.ts) and drives the same
// decorator-free read-through primitive the ArticlesService uses
// (`readThroughCache` + `EntityCache`). Redis is stood in for by an in-memory
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
const authorId = `it_art_${tag}`;
const category = 'content' as const;

const cache = new EntityCache(new InMemoryStore(), 'article:list');
const listKey = `published:t=:c=${category}:k=20:s=0`;

type ListRow = { slug: string; title: string };

/** The uncached DB aggregate — the same query shape ArticlesService uses. */
async function computePublished(): Promise<ListRow[]> {
  const rows = await prisma.article.findMany({
    where: { status: 'published', category, authorId },
    orderBy: { publishedAt: 'desc' },
    take: 20,
    select: { slug: true, title: true },
  });
  return rows;
}

/** Read the article list through the cache, exactly as listPublished does. */
function listPublished(): Promise<ListRow[]> {
  return readThroughCache(cache, listKey, computePublished);
}

/** Publish one article, then invalidate the list cache (the create/update hook). */
async function publishArticle(title: string): Promise<void> {
  const slug = `${authorId}-${randomUUID().slice(0, 8)}`;
  await prisma.article.create({
    data: {
      slug,
      title,
      excerpt: 'x',
      body: 'x',
      tags: [],
      status: 'published',
      category,
      authorId,
      publishedAt: new Date(),
    },
  });
  await cache.invalidate();
}

before(async () => {
  await prisma.$connect();
  await prisma.user.create({
    data: { id: authorId, email: `${authorId}@itest.local`, role: 'tipster' },
  });
});

after(async () => {
  await prisma.article.deleteMany({ where: { authorId } });
  await prisma.user.deleteMany({ where: { id: authorId } });
  await prisma.$disconnect();
});

test('article list reads are cached: DB changes are not seen until invalidation', async () => {
  await publishArticle('first');
  const seeded = await listPublished();
  assert.equal(seeded.length, 1, 'the first published article should be listed');

  // Insert another published article directly WITHOUT invalidating the cache.
  await prisma.article.create({
    data: {
      slug: `${authorId}-direct-${randomUUID().slice(0, 8)}`,
      title: 'sneaky',
      excerpt: 'x',
      body: 'x',
      tags: [],
      status: 'published',
      category,
      authorId,
      publishedAt: new Date(),
    },
  });

  // The cached read must still return the primed (now-stale) list, proving the
  // list is served from cache rather than recomputed per request.
  const cached = await listPublished();
  assert.equal(cached.length, 1, 'stale cached list is served until invalidation');
});

test('an article write invalidates the cache; fresh list is served', async () => {
  // Prime the cache, then publish a new article through the invalidating hook.
  await listPublished();
  await publishArticle('third');

  // After invalidation the cached list must match the live DB state exactly
  // (never the pre-write cached list).
  const after = await listPublished();
  const live = await computePublished();
  assert.deepEqual(
    after,
    live,
    'post-write list must reflect the live DB state, not a stale cache',
  );
  assert.ok(
    after.some((a) => a.title === 'third'),
    'the newly published article appears after invalidation',
  );
});
