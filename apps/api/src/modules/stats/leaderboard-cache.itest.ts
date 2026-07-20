// Integration test for OB-055: the leaderboard is served from cache, and a
// settlement recompute invalidates it so stale figures are never served.
//
// Runs against a REAL Postgres (like the other *.itest.ts) and drives the same
// decorator-free read-through helper the StatsService uses (`readLeaderboardCached`
// + `LeaderboardCache`). Redis is stood in for by an in-memory CacheStore — the
// acceptance criterion is the wiring between recompute and cache, not the Redis
// client (covered by the readiness probe and the cache unit tests).
//
// The "settlement recompute" is modelled exactly as StatsService.recomputeForTipster
// does at its boundary: recompute the materialized stats from the tipster's
// settled picks, then invalidate the cache. Proving that this makes the very
// next leaderboard read serve fresh (never the stale cached) figures.
//
// DATABASE_URL is honored; it defaults to the local compose connection.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { computeSegmentedStats, type SettledPick } from '@overlay/shared';
import { LeaderboardCache, type CacheStore } from './leaderboard-cache.ts';
import { readLeaderboardCached } from './leaderboard-query.ts';

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://overlay:overlay@localhost:5432/overlay?schema=public';

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
const tipsterId = `it_lb_${tag}`;
const eventId = `it_lb_ev_${tag}`;

const cache = new LeaderboardCache(new InMemoryStore());

type Row = { tipsterId: string; yield: number } & Record<string, unknown>;

/** The uncached DB aggregate — the same query shape StatsService uses. */
async function computeLeaderboard(minSampleSize: number): Promise<Row[]> {
  const rows = await prisma.tipsterStats.findMany({
    where: { sampleSize: { gte: minSampleSize }, tipster: { status: 'active' } },
    orderBy: [{ yield: 'desc' }, { clvAvg: 'desc' }],
  });
  return rows.map((s) => ({ ...s })) as unknown as Row[];
}

/** Read the leaderboard through the cache, exactly as StatsService.leaderboard does. */
function leaderboard(minSampleSize = 1): Promise<Row[]> {
  return readLeaderboardCached<Row>(cache, minSampleSize, 100, () =>
    computeLeaderboard(minSampleSize),
  );
}

/**
 * Model StatsService.recomputeForTipster's boundary: recompute materialized
 * stats from the tipster's settled picks, persist them, then invalidate the
 * leaderboard cache.
 */
async function recomputeForTipster(): Promise<void> {
  const picks = await prisma.pick.findMany({
    where: { tipsterId, status: { not: 'pending' } },
  });
  const input: SettledPick[] = picks.map((p) => ({
    oddsAtPick: p.oddsAtPick,
    stakeUnits: p.stakeUnits,
    status: p.status,
    pickType: p.pickType,
    closingOdds: p.closingOdds,
    settledAt: p.settledAt ? p.settledAt.getTime() : null,
  }));
  const { preMatch, live } = computeSegmentedStats(input);
  const data = {
    ...preMatch,
    liveYield: live.yield,
    liveWinRate: live.winRate,
    liveSampleSize: live.sampleSize,
  };
  await prisma.tipsterStats.upsert({
    where: { tipsterId },
    create: { tipsterId, ...data },
    update: data,
  });
  await cache.invalidate();
}

function rowFor(rows: Row[]) {
  return rows.find((r) => r.tipsterId === tipsterId);
}

/** N settled, winning pre-match picks for the tipster. */
function winningPicks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${tipsterId}_p${i}`,
    tipsterId,
    eventId,
    market: 'h2h',
    selection: 'home',
    oddsAtPick: 2.0,
    stakeUnits: 1,
    pickType: 'pre_match' as const,
    status: 'won' as const,
    closingOdds: 1.8,
    settledAt: new Date(),
    hash: `${tipsterId}_h${i}`,
    nonce: `${tipsterId}_n${i}`,
  }));
}

before(async () => {
  await prisma.$connect();
  await prisma.user.create({
    data: { id: tipsterId, email: `${tipsterId}@itest.local`, role: 'tipster' },
  });
  await prisma.tipster.create({
    data: { userId: tipsterId, displayName: `LB ${tag}`, status: 'active' },
  });
  await prisma.event.create({
    data: {
      id: eventId,
      vendorEventId: eventId,
      sport: 'soccer',
      league: 'itest',
      home: 'H',
      away: 'A',
      startTime: new Date(Date.now() - 3_600_000),
      status: 'finished',
    },
  });
  await prisma.pick.createMany({ data: winningPicks(12) });
});

after(async () => {
  await prisma.pick.deleteMany({ where: { tipsterId } });
  await prisma.tipsterStats.deleteMany({ where: { tipsterId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.tipster.deleteMany({ where: { userId: tipsterId } });
  await prisma.user.deleteMany({ where: { id: tipsterId } });
  await prisma.$disconnect();
});

test('leaderboard reads are cached: DB changes are not seen until invalidation', async () => {
  await recomputeForTipster();
  const seeded = rowFor(await leaderboard());
  assert.ok(seeded, 'tipster should appear on the leaderboard');
  const seededYield = seeded.yield;

  // Mutate the materialized stats directly WITHOUT invalidating the cache.
  await prisma.tipsterStats.update({
    where: { tipsterId },
    data: { yield: seededYield + 99 },
  });

  // The cached read must still return the primed (now-stale) figure, proving the
  // leaderboard is served from cache rather than recomputed per request.
  const cached = rowFor(await leaderboard());
  assert.equal(cached?.yield, seededYield);
});

test('settlement recompute invalidates the cache; fresh data is served', async () => {
  // Prime the cache, then corrupt the stored stats so a stale read is obvious.
  await leaderboard();
  await prisma.tipsterStats.update({ where: { tipsterId }, data: { yield: -1 } });
  const beforeSettle = rowFor(await leaderboard());
  assert.notEqual(
    beforeSettle?.yield,
    -1,
    'sanity: pre-settlement read is still the cached value',
  );

  // A settlement recompute (recompute stats + invalidate) must make the next
  // read reflect the freshly computed figures within the cycle.
  await recomputeForTipster();
  const afterSettle = rowFor(await leaderboard());
  assert.ok(afterSettle, 'tipster should still be on the board after settlement');

  const persisted = await prisma.tipsterStats.findUnique({
    where: { tipsterId },
  });
  assert.equal(
    afterSettle?.yield,
    persisted?.yield,
    'post-settlement leaderboard must serve recomputed, non-stale figures',
  );
  assert.notEqual(afterSettle?.yield, -1, 'the stale cached value is not served');
});
