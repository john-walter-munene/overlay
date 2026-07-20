// Integration test: OB-035 — DB-level pick immutability (append-only
// enforcement). Exercises the Postgres BEFORE UPDATE trigger installed by the
// 20260719130000_pick_immutability_trigger migration against a REAL Postgres,
// driving Prisma directly so it runs under the strip-only test loader.
//
// Verifies that the database itself — not just the app-layer guard — refuses to
// mutate a locked pick's core wager/integrity fields, while still allowing the
// sanctioned settlement pipeline (closing-line capture while pending, the
// pending -> terminal grade, and the one-time post-settlement CLV write).
//
// DATABASE_URL is honored; it defaults to the local compose connection so the
// test works out of the box in dev (run `npm run db:up` first).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { generateNonce, hashPick, type PickPayload } from '@overlay/shared';

const DB_URL =
  process.env.DATABASE_URL ??
  '******localhost:5432/overlay?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const tag = randomUUID().slice(0, 8);
const tipsterId = `it_immut_${tag}`;
let eventId = '';

const PEPPER = 'itest-pepper';

/** Insert a fresh, locked (pending) pick the way PicksService does. */
async function lockPick(over: Partial<PickPayload> = {}) {
  const payload: PickPayload = {
    tipsterId,
    eventId,
    market: '1x2',
    selection: 'home',
    oddsAtPick: 2.5,
    stakeUnits: 1,
    ...over,
  };
  const nonce = generateNonce();
  const hash = hashPick(payload, nonce, PEPPER);
  return prisma.pick.create({ data: { ...payload, hash, nonce, status: 'pending' } });
}

before(async () => {
  await prisma.$connect();
  await prisma.user.create({
    data: { id: tipsterId, email: `${tipsterId}@itest.local`, role: 'tipster' },
  });
  await prisma.tipster.create({
    data: { userId: tipsterId, displayName: 'Immutability Tester', sports: ['football'] },
  });
  const event = await prisma.event.create({
    data: {
      vendorEventId: `it_evt_${tag}`,
      sport: 'football',
      home: 'Home',
      away: 'Away',
      startTime: new Date(Date.now() + 60 * 60 * 1000),
      status: 'scheduled',
    },
  });
  eventId = event.id;
});

after(async () => {
  await prisma.pick.deleteMany({ where: { tipsterId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.tipster.deleteMany({ where: { userId: tipsterId } });
  await prisma.user.deleteMany({ where: { id: tipsterId } });
  await prisma.$disconnect();
});

test('a locked pick\'s odds cannot be mutated at the DB layer', async () => {
  const pick = await lockPick();

  // The DB trigger rejects the UPDATE — the app-layer guard is not involved.
  await assert.rejects(
    () => prisma.pick.update({ where: { id: pick.id }, data: { oddsAtPick: 9.99 } }),
    /append-only|core fields/i,
  );

  const after = await prisma.pick.findUniqueOrThrow({ where: { id: pick.id } });
  assert.equal(after.oddsAtPick, 2.5, 'odds are unchanged');
});

test('every core wager/integrity field is frozen at the DB layer', async () => {
  const pick = await lockPick({ selection: 'away' });

  const mutations: Array<Record<string, unknown>> = [
    { market: 'totals' },
    { selection: 'home' },
    { oddsAtPick: 3.3 },
    { stakeUnits: 5 },
    { hash: 'tampered' },
    { nonce: 'tampered' },
    { lockedAt: new Date(0) },
  ];
  for (const data of mutations) {
    await assert.rejects(
      () => prisma.pick.update({ where: { id: pick.id }, data }),
      /append-only|core fields/i,
      `mutating ${Object.keys(data)[0]} must be rejected`,
    );
  }
});

test('settlement fields require a pending -> terminal transition', async () => {
  const pick = await lockPick();

  // Capturing the closing line while pending is allowed (pre-settlement).
  await prisma.pick.update({ where: { id: pick.id }, data: { closingOdds: 2.4 } });

  // Writing grading outputs WITHOUT transitioning out of pending is rejected.
  await assert.rejects(
    () =>
      prisma.pick.update({
        where: { id: pick.id },
        data: { result: '{"score":"1-0"}', settledAt: new Date() },
      }),
    /pending -> terminal transition/i,
  );

  // The sanctioned pending -> terminal settlement write succeeds...
  await prisma.pick.update({
    where: { id: pick.id },
    data: { status: 'won', result: '{"score":"1-0"}', settledAt: new Date() },
  });
  // ...and CLV can be filled in once afterwards.
  await prisma.pick.update({ where: { id: pick.id }, data: { clv: 0.05 } });

  const settled = await prisma.pick.findUniqueOrThrow({ where: { id: pick.id } });
  assert.equal(settled.status, 'won');
  assert.equal(settled.clv, 0.05);
});

test('a settled pick can no longer be re-graded or un-settled at the DB layer', async () => {
  const pick = await lockPick();
  await prisma.pick.update({
    where: { id: pick.id },
    data: { status: 'won', result: '{"score":"1-0"}', settledAt: new Date(), clv: 0.02 },
  });

  // Re-grading, un-settling, back-dating and rewriting CLV are all rejected.
  await assert.rejects(
    () => prisma.pick.update({ where: { id: pick.id }, data: { status: 'lost' } }),
    /already settled/i,
  );
  await assert.rejects(
    () => prisma.pick.update({ where: { id: pick.id }, data: { status: 'pending' } }),
    /already settled/i,
  );
  await assert.rejects(
    () => prisma.pick.update({ where: { id: pick.id }, data: { settledAt: new Date(0) } }),
    /already settled/i,
  );
  await assert.rejects(
    () => prisma.pick.update({ where: { id: pick.id }, data: { clv: 0.5 } }),
    /only be written once/i,
  );

  const frozen = await prisma.pick.findUniqueOrThrow({ where: { id: pick.id } });
  assert.equal(frozen.status, 'won');
  assert.equal(frozen.clv, 0.02);
});
