import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ANONYMIZED_EMAIL_DOMAIN,
  PII_ERASURE_FIELDS,
  anonymizedEmail,
  buildUserExport,
  tipsterErasureData,
  userErasureData,
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

test('userErasureData strips direct PII and replaces email with a non-deliverable placeholder', () => {
  const data = userErasureData('user_42');
  assert.equal(data.email, 'deleted-user_42@deleted.overlay');
  assert.equal(data.passwordHash, null);
  assert.equal(data.supabaseUserId, null);
  // Every declared User PII field is addressed by the erasure payload.
  for (const field of PII_ERASURE_FIELDS.User) {
    assert.ok(field in data, `expected erasure to cover User.${field}`);
  }
});

test('anonymizedEmail is deterministic, unique per user and uses the sink domain', () => {
  assert.equal(anonymizedEmail('a'), anonymizedEmail('a'));
  assert.notEqual(anonymizedEmail('a'), anonymizedEmail('b'));
  assert.ok(anonymizedEmail('a').endsWith(`@${ANONYMIZED_EMAIL_DOMAIN}`));
});

test('tipsterErasureData clears bio + payout account and hides the profile', () => {
  const data = tipsterErasureData();
  assert.equal(data.bio, null);
  assert.equal(data.stripeAccountId, null);
  assert.equal(data.status, 'suspended');
});

test('erasure never touches the append-only Pick model', () => {
  // Erasure only produces update payloads for User/Tipster; picks are excluded.
  assert.ok(!('Pick' in PII_ERASURE_FIELDS));
  const touched = { ...userErasureData('user_1'), ...tipsterErasureData() };
  for (const key of ['id', 'hash', 'nonce', 'lockedAt', 'oddsAtPick', 'stakeUnits']) {
    assert.ok(!(key in touched), `erasure must not write Pick.${key}`);
  }
});

test('erasing a tipster preserves each pick and its integrity hash', () => {
  const picks = [pick({ id: 'p1' }), pick({ id: 'p2', selection: 'away' })];
  const before = structuredClone(picks);

  // Simulate an account erasure: only User/Tipster rows are rewritten.
  const user = { id: 'user_1', email: 'real@example.com', passwordHash: 'x', supabaseUserId: 'sup_1' };
  const erasedUser = { ...user, ...userErasureData(user.id) };
  const tipster = { userId: 'user_1', bio: 'sharp bettor', stripeAccountId: 'acct_1', status: 'active' };
  const erasedTipster = { ...tipster, ...tipsterErasureData() };

  // PII is gone from the mutable rows...
  assert.notEqual(erasedUser.email, user.email);
  assert.equal(erasedUser.passwordHash, null);
  assert.equal(erasedUser.supabaseUserId, null);
  assert.equal(erasedTipster.bio, null);
  assert.equal(erasedTipster.stripeAccountId, null);

  // ...while every append-only pick — including tipsterId and the tamper-evident
  // hash/nonce — is byte-for-byte unchanged.
  assert.deepEqual(picks, before);
  for (const p of picks) {
    assert.equal(p.tipsterId, 'user_1');
    const canonical = [p.tipsterId, p.eventId, p.market, p.selection, String(p.oddsAtPick), String(p.stakeUnits)].join('|');
    const recomputed = createHash('sha256').update(canonical).update(p.nonce).digest('hex');
    assert.equal(p.hash, recomputed);
  }
});

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
