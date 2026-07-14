import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePayout, summarizeEarnings } from './payouts.math.ts';

test('computePayout: standard 25% fee', () => {
  const b = computePayout(100, 1000, 0.25); // 100 subs * $10
  assert.equal(b.grossCents, 100_000);
  assert.equal(b.feeCents, 25_000);
  assert.equal(b.netCents, 75_000);
});

test('computePayout: rounds fee to nearest cent', () => {
  const b = computePayout(3, 999, 0.25); // gross 2997 * .25 = 749.25 → 749
  assert.equal(b.grossCents, 2997);
  assert.equal(b.feeCents, 749);
  assert.equal(b.netCents, 2248);
});

test('computePayout: zero subscribers → all zero', () => {
  const b = computePayout(0, 1000, 0.25);
  assert.deepEqual(b, { grossCents: 0, feeCents: 0, netCents: 0 });
});

test('computePayout: clamps fee rate and floors inputs', () => {
  assert.equal(computePayout(10, 500, 1.5).netCents, 0); // rate clamped to 1
  assert.equal(computePayout(10, 500, -1).feeCents, 0); // rate clamped to 0
  assert.equal(computePayout(2.9, 500.9, 0).grossCents, 1000); // floored
});

test('summarizeEarnings: projected earnings reflect active subscribers and fee rate', () => {
  const s = summarizeEarnings(40, 1000, 0.25); // 40 subs * $10, 25% fee
  assert.equal(s.activeSubscribers, 40);
  assert.equal(s.subscriptionPriceCents, 1000);
  assert.equal(s.feeRate, 0.25);
  assert.deepEqual(s.projected, {
    grossCents: 40_000,
    feeCents: 10_000,
    netCents: 30_000,
  });
  assert.equal(s.paidCents, 0);
  assert.equal(s.pendingCents, 0);
});

test('summarizeEarnings: more subscribers or higher fee change the projection', () => {
  const base = summarizeEarnings(10, 1000, 0.2);
  const moreSubs = summarizeEarnings(20, 1000, 0.2);
  const higherFee = summarizeEarnings(10, 1000, 0.4);
  assert.ok(moreSubs.projected.netCents > base.projected.netCents);
  assert.ok(higherFee.projected.feeCents > base.projected.feeCents);
  assert.ok(higherFee.projected.netCents < base.projected.netCents);
});

test('summarizeEarnings: aggregates paid and pending payout history', () => {
  const s = summarizeEarnings(5, 1000, 0.25, [
    { amountCents: 3000, status: 'paid' },
    { amountCents: 4000, status: 'paid' },
    { amountCents: 3750, status: 'pending' },
    { amountCents: 2000, status: 'failed' },
  ]);
  assert.equal(s.paidCents, 7000);
  assert.equal(s.pendingCents, 3750);
});

test('summarizeEarnings: clamps fee rate and floors/guards inputs', () => {
  const s = summarizeEarnings(-3, 500, 1.5, [
    { amountCents: -100, status: 'paid' },
  ]);
  assert.equal(s.activeSubscribers, 0);
  assert.equal(s.feeRate, 1);
  assert.deepEqual(s.projected, { grossCents: 0, feeCents: 0, netCents: 0 });
  assert.equal(s.paidCents, 0);
});
