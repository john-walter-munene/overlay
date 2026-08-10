// Integration test: OB-120 — Indexing & query performance review. Asserts, via
// EXPLAIN against a REAL Postgres, that the hot leaderboard, profile, feed and
// settlement queries are served by the composite indexes added in the
// 20260720000000_ob120_query_indexes migration — never a sequential scan of the
// large Pick/Event tables, and (where the index provides ordering) never an
// in-memory sort.
//
// EXPLAIN is planned, not ANALYZEd, so nothing is executed; a small deterministic
// fixture plus ANALYZE gives the planner realistic statistics. Sequential scans
// (and, for the ordering-sensitive queries, sorts and bitmap scans) are disabled
// for the planning session so the assertion deterministically proves the intended
// index can serve each query regardless of the tiny test dataset — if the index
// were missing, Postgres would fall back to a Seq Scan and the assertion fails.
//
// DATABASE_URL is honored; it defaults to the local compose connection so the
// test works out of the box in dev (run `npm run db:up` first).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const DB_URL =
  process.env.DATABASE_URL ??
  `postgresql://${'overlay'}:${'overlay'}@localhost:5432/overlay?schema=public`;

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const tag = randomUUID().slice(0, 8);
const tipsterA = `it_idx_a_${tag}`;
const tipsterB = `it_idx_b_${tag}`;
const eventTag = `it_idx_evt_${tag}`;
let eventId = '';

/**
 * Plan a query with sequential scans disabled (and optionally bitmap scans /
 * sorts) for the session, returning the EXPLAIN text. SET LOCAL + EXPLAIN run
 * inside one interactive transaction so they share a single pinned connection.
 */
async function explain(
  sql: string,
  opts: { noBitmap?: boolean; noSort?: boolean } = {},
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
    if (opts.noBitmap) await tx.$executeRawUnsafe('SET LOCAL enable_bitmapscan = off');
    if (opts.noSort) await tx.$executeRawUnsafe('SET LOCAL enable_sort = off');
    const rows = (await tx.$queryRawUnsafe(
      `EXPLAIN (COSTS OFF) ${sql}`,
    )) as Array<Record<string, string>>;
    return rows.map((r) => r['QUERY PLAN']).join('\n');
  });
}

before(async () => {
  await prisma.$connect();
  for (const [i, id] of [tipsterA, tipsterB].entries()) {
    await prisma.user.create({
      data: { id, email: `${id}@itest.local`, role: 'tipster' },
    });
    await prisma.tipster.create({
      data: { userId: id, displayName: `Idx Tester ${i}`, sports: ['soccer'], status: 'active' },
    });
    await prisma.tipsterStats.create({
      data: { tipsterId: id, yield: 0.1 - i * 0.02, clvAvg: 0.03, winRate: 0.55, sampleSize: 50 },
    });
  }
  const event = await prisma.event.create({
    data: {
      vendorEventId: eventTag,
      sport: 'soccer',
      home: 'Home',
      away: 'Away',
      startTime: new Date(Date.now() - 60 * 60 * 1000),
      status: 'scheduled',
    },
  });
  eventId = event.id;
  // Settlement capture scans events at/after kickoff that are not yet captured
  // (closingCapturedAt IS NULL). In production the overwhelming majority of past
  // events are already captured, so a plain startTime scan reads (and filters
  // out) most of the table. Seed that realistic distribution — many captured
  // past events plus a handful of uncaptured ones — so ANALYZE reflects that
  // `closingCapturedAt IS NULL` is highly selective and the planner proves the
  // (closingCapturedAt, startTime) index actually serves the query.
  const capturedEvents = Array.from({ length: 200 }, (_, n) => {
    const start = new Date(Date.now() - (n + 2) * 60 * 60 * 1000);
    return {
      vendorEventId: `${eventTag}_cap_${n}`,
      sport: 'soccer',
      home: 'Home',
      away: 'Away',
      startTime: start,
      status: 'settled',
      closingCapturedAt: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    };
  });
  await prisma.event.createMany({ data: capturedEvents });
  const now = Date.now();
  const picks = Array.from({ length: 40 }, (_, n) => ({
    tipsterId: n % 2 === 0 ? tipsterA : tipsterB,
    eventId,
    market: '1x2',
    selection: 'home',
    oddsAtPick: 2.0,
    stakeUnits: 1,
    hash: `h_${tag}_${n}`,
    nonce: `n_${tag}_${n}`,
    lockedAt: new Date(now - n * 60_000),
    status: (n % 3 === 0 ? 'pending' : 'won') as 'pending' | 'won',
  }));
  await prisma.pick.createMany({ data: picks });
  await prisma.$executeRawUnsafe('ANALYZE "Pick", "Event", "TipsterStats", "Tipster"');
});

after(async () => {
  await prisma.pick.deleteMany({ where: { tipsterId: { in: [tipsterA, tipsterB] } } });
  await prisma.event.deleteMany({ where: { vendorEventId: { startsWith: eventTag } } });
  await prisma.tipsterStats.deleteMany({ where: { tipsterId: { in: [tipsterA, tipsterB] } } });
  await prisma.tipster.deleteMany({ where: { userId: { in: [tipsterA, tipsterB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [tipsterA, tipsterB] } } });
  await prisma.$disconnect();
});

test('profile track record uses the (tipsterId, lockedAt) index, no seq scan or sort', async () => {
  const plan = await explain(
    `SELECT * FROM "Pick" WHERE "tipsterId" = '${tipsterA}' AND status <> 'pending' ORDER BY "lockedAt" DESC LIMIT 100`,
    { noBitmap: true, noSort: true },
  );
  assert.match(plan, /Pick_tipsterId_lockedAt_idx/, plan);
  assert.doesNotMatch(plan, /Seq Scan/, plan);
  assert.doesNotMatch(plan, /Sort/, plan);
});

test('subscriber feed (tipsterId IN …) is served by the (tipsterId, lockedAt) index, no seq scan', async () => {
  const plan = await explain(
    `SELECT * FROM "Pick" WHERE "tipsterId" IN ('${tipsterA}', '${tipsterB}') ORDER BY "lockedAt" DESC LIMIT 100`,
  );
  assert.match(plan, /Pick_tipsterId_lockedAt_idx/, plan);
  assert.doesNotMatch(plan, /Seq Scan/, plan);
});

test('settlement closing-odds capture uses the (closingCapturedAt, startTime) index, no seq scan', async () => {
  const plan = await explain(
    `SELECT * FROM "Event" WHERE "startTime" <= now() AND "closingCapturedAt" IS NULL`,
  );
  assert.match(plan, /Event_closingCapturedAt_startTime_idx/, plan);
  assert.doesNotMatch(plan, /Seq Scan/, plan);
});

test('leaderboard ranking uses the (yield, clvAvg) index, no seq scan or sort', async () => {
  const plan = await explain(
    `SELECT s.* FROM "TipsterStats" s JOIN "Tipster" t ON t."userId" = s."tipsterId" WHERE s."sampleSize" >= 10 AND t.status = 'active' ORDER BY s.yield DESC, s."clvAvg" DESC LIMIT 100`,
    { noBitmap: true, noSort: true },
  );
  assert.match(plan, /TipsterStats_yield_clvAvg_idx/, plan);
  assert.doesNotMatch(plan, /Seq Scan/, plan);
  assert.doesNotMatch(plan, /Sort/, plan);
});
