import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePayout } from './payouts.math.ts';

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
