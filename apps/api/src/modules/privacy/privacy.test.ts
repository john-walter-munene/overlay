import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildUserExport,
  type ExportablePick,
} from './privacy.ts';

/** A locked, tamper-evident pick row mirroring the Prisma model. */
function pick(over: Partial<ExportablePick & { hash: string; nonce: string; tipsterId: string }> = {}) {
  const base = {
    id: 'pick_1',
    tipsterId: 'user_1',
    eventId: 'evt_1',
    market: 'moneyline',
    selection: 'home',
    oddsAtPick: 1.9,
    stakeUnits: 1,
    status: 'won',
    lockedAt: '2026-01-01T00:00:00.000Z',
    settledAt: '2026-01-02T00:00:00.000Z',
    nonce: 'deadbeef',
    ...over,
  };
  // Deterministic integrity hash over the locked, immutable fields.
  const canonical = [
    base.tipsterId,
    base.eventId,
    base.market,
    base.selection,
    String(base.oddsAtPick),
    String(base.stakeUnits),
  ].join('|');
  const hash =
    over.hash ?? createHash('sha256').update(canonical).update(base.nonce).digest('hex');
  return { ...base, hash };
}

test('buildUserExport bundles only the requesting user data with a timestamp', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');
  const out = buildUserExport(
    {
      user: { id: 'user_1', email: 'real@example.com', role: 'tipster', createdAt: now },
      tipster: { bio: 'hi', sports: ['soccer'], subscriptionPriceCents: 1999, status: 'active', createdAt: now },
      picks: [pick()],
    },
    now,
  );
  assert.equal(out.generatedAt, '2026-07-14T12:00:00.000Z');
  assert.equal(out.account.email, 'real@example.com');
  assert.equal(out.tipsterProfile?.bio, 'hi');
  assert.equal(out.picks.length, 1);
  // Defaults for the omitted collections.
  assert.deepEqual(out.subscriptions, []);
  assert.deepEqual(out.articles, []);
});
