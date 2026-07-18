// Integration test: exercises the live/in-play pick model (OB-039) against a
// REAL Postgres. It mirrors what PicksService.createLockedPick does — apply the
// timing gate, hash + server-timestamp, INSERT into the append-only picks table
// — but drives Prisma directly so it runs under the strip-only test loader
// (which can't import the decorator/param-property Nest service).
//
// Verifies: a live pick placed AFTER kickoff is accepted (while a late
// pre-match pick on the same in-play event is rejected), is hashed +
// server-timestamped, is graded on the final result, carries no CLV, and keeps
// its immutable core fields + integrity hash through settlement.
//
// DATABASE_URL is honored; it defaults to the local compose connection so the
// test works out of the box in dev (run `npm run db:up` first).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  generateNonce,
  hashPick,
  verifyPick,
  type PickPayload,
  type PickType,
} from '@overlay/shared';
import { evaluatePickTiming } from './cutoff.ts';

const DB_URL =
  process.env.DATABASE_URL ??
  '******localhost:5432/overlay?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const tag = randomUUID().slice(0, 8);
const tipsterId = `it_livepick_${tag}`;
let eventId = '';

const PEPPER = 'itest-pepper';

/** Mirror of PicksService.createLockedPick's timing gate + hash-lock + insert. */
async function lockPick(pickType: PickType, over: Partial<PickPayload> = {}) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const timing = evaluatePickTiming(pickType, event);
  if (!timing.ok) throw new Error(timing.reason);

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

  return prisma.$transaction(async (tx) => {
    const created = await tx.pick.create({
      data: { ...payload, pickType, hash, nonce, status: 'pending' },
    });
    await tx.auditLog.create({
      data: {
        actor: `tipster:${tipsterId}`,
        action: 'pick.locked',
        entity: 'Pick',
        entityId: created.id,
        payload: { hash, pickType },
      },
    });
    return created;
  });
}

before(async () => {
  await prisma.$connect();
  await prisma.user.create({
    data: { id: tipsterId, email: `${tipsterId}@itest.local`, role: 'tipster' },
  });
  await prisma.tipster.create({
    data: { userId: tipsterId, displayName: 'Live Tester', sports: ['football'] },
  });
  // Event that has ALREADY kicked off (in play): pre-match cutoff would reject.
  const event = await prisma.event.create({
    data: {
      vendorEventId: `it_evt_${tag}`,
      sport: 'football',
      home: 'Home',
      away: 'Away',
      startTime: new Date(Date.now() - 30 * 60 * 1000),
      status: 'scheduled',
    },
  });
  eventId = event.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actor: `tipster:${tipsterId}` } });
  await prisma.pick.deleteMany({ where: { tipsterId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.tipster.deleteMany({ where: { userId: tipsterId } });
  await prisma.user.deleteMany({ where: { id: tipsterId } });
  await prisma.$disconnect();
});

test('a late pre_match pick on an in-play event is rejected (OB-038 cutoff holds)', async () => {
  await assert.rejects(() => lockPick('pre_match'), /already started/);
});

test('a live pick is accepted after kickoff, hashed and server-timestamped', async () => {
  const startedAt = Date.now();
  const pick = await lockPick('live', { selection: 'away', oddsAtPick: 3.0 });

  assert.equal(pick.pickType, 'live');
  assert.equal(pick.status, 'pending');
  assert.equal(pick.hash.length, 64, 'has a sha256 hash');
  assert.ok(pick.nonce.length > 0, 'has a nonce');
  // Server-clock lock timestamp.
  const locked = pick.lockedAt.getTime();
  assert.ok(locked >= startedAt && locked <= Date.now() + 1000);

  // The hash verifies against the canonical wager payload + nonce + pepper.
  const payload: PickPayload = {
    tipsterId,
    eventId,
    market: pick.market,
    selection: pick.selection,
    oddsAtPick: pick.oddsAtPick,
    stakeUnits: pick.stakeUnits,
  };
  assert.ok(verifyPick(payload, pick.nonce, PEPPER, pick.hash));
  assert.ok(!verifyPick({ ...payload, selection: 'home' }, pick.nonce, PEPPER, pick.hash));

  const audit = await prisma.auditLog.findFirst({
    where: { entity: 'Pick', entityId: pick.id, action: 'pick.locked' },
  });
  assert.ok(audit, 'wrote a pick.locked audit entry');
});

test('a live pick is graded on the final result and its core fields stay immutable', async () => {
  const pick = await lockPick('live', { selection: 'home', oddsAtPick: 2.0 });
  const originalHash = pick.hash;
  const originalLockedAt = pick.lockedAt.getTime();

  // Settlement writes ONLY settlement fields (as the worker does).
  await prisma.pick.update({
    where: { id: pick.id },
    data: { status: 'won', result: '{"score":"1-0"}', settledAt: new Date() },
  });

  const graded = await prisma.pick.findUniqueOrThrow({ where: { id: pick.id } });
  assert.equal(graded.status, 'won');
  assert.ok(graded.settledAt, 'is timestamped at settlement');
  // Immutable integrity + wager fields are untouched by grading.
  assert.equal(graded.hash, originalHash);
  assert.equal(graded.lockedAt.getTime(), originalLockedAt);
  assert.equal(graded.pickType, 'live');
  assert.equal(graded.selection, 'home');
  assert.equal(graded.oddsAtPick, 2.0);
  // Live picks carry no CLV — never populated by the settlement pipeline.
  assert.equal(graded.clv, null);
  assert.equal(graded.closingOdds, null);
  // The stored hash still verifies the (unchanged) wager payload post-settlement.
  assert.ok(
    verifyPick(
      {
        tipsterId,
        eventId,
        market: graded.market,
        selection: graded.selection,
        oddsAtPick: graded.oddsAtPick,
        stakeUnits: graded.stakeUnits,
      },
      graded.nonce,
      PEPPER,
      graded.hash,
    ),
  );
});
