import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  subscriptionStatusFromEvent,
  subscriptionStatusLabel,
  formatBillingDate,
  periodEndLabel,
  toSubscriptionView,
  sortSubscriptions,
  type SubscriptionRecord,
} from './subscriptions.ts';

test('subscriptionStatusFromEvent maps webhook event types to statuses', () => {
  assert.equal(subscriptionStatusFromEvent('activated'), 'active');
  assert.equal(subscriptionStatusFromEvent('past_due'), 'past_due');
  assert.equal(subscriptionStatusFromEvent('canceled'), 'canceled');
});

test('subscriptionStatusLabel returns human-readable labels', () => {
  assert.equal(subscriptionStatusLabel('active'), 'Active');
  assert.equal(subscriptionStatusLabel('past_due'), 'Past due');
  assert.equal(subscriptionStatusLabel('canceled'), 'Canceled');
});

test('formatBillingDate formats valid ISO dates and rejects bad input', () => {
  assert.equal(
    formatBillingDate('2026-01-15T00:00:00.000Z', 'en-US'),
    'Jan 15, 2026',
  );
  assert.equal(formatBillingDate(null), null);
  assert.equal(formatBillingDate(undefined), null);
  assert.equal(formatBillingDate('not-a-date'), null);
});

test('periodEndLabel phrases renew vs. retained access by status', () => {
  const iso = '2026-01-15T00:00:00.000Z';
  assert.equal(periodEndLabel('active', iso, 'en-US'), 'Renews on Jan 15, 2026');
  assert.equal(
    periodEndLabel('past_due', iso, 'en-US'),
    'Renews on Jan 15, 2026',
  );
  assert.equal(
    periodEndLabel('canceled', iso, 'en-US'),
    'Access until Jan 15, 2026',
  );
  assert.equal(periodEndLabel('active', null), null);
});

test('toSubscriptionView shapes an active subscription', () => {
  const view = toSubscriptionView(
    {
      id: 's1',
      tipsterId: 't1',
      status: 'active',
      currentPeriodEnd: '2026-01-15T00:00:00.000Z',
    },
    'en-US',
  );
  assert.equal(view.isActive, true);
  assert.equal(view.statusLabel, 'Active');
  assert.equal(view.actionLabel, 'Cancel');
  assert.equal(view.periodEndLabel, 'Renews on Jan 15, 2026');
});

test('toSubscriptionView offers Resume for a canceled subscription', () => {
  const view = toSubscriptionView(
    {
      id: 's2',
      tipsterId: 't2',
      status: 'canceled',
      currentPeriodEnd: null,
    },
    'en-US',
  );
  assert.equal(view.isActive, false);
  assert.equal(view.statusLabel, 'Canceled');
  assert.equal(view.actionLabel, 'Resume');
  assert.equal(view.periodEndLabel, null);
});

test('sortSubscriptions orders active, past_due, canceled then by period end', () => {
  const subs: SubscriptionRecord[] = [
    { id: 'c', tipsterId: 'c', status: 'canceled', currentPeriodEnd: null },
    {
      id: 'a2',
      tipsterId: 'a2',
      status: 'active',
      currentPeriodEnd: '2026-02-01T00:00:00.000Z',
    },
    { id: 'p', tipsterId: 'p', status: 'past_due', currentPeriodEnd: null },
    {
      id: 'a1',
      tipsterId: 'a1',
      status: 'active',
      currentPeriodEnd: '2026-01-01T00:00:00.000Z',
    },
  ];
  assert.deepEqual(
    sortSubscriptions(subs).map((s) => s.id),
    ['a1', 'a2', 'p', 'c'],
  );
});

test('sortSubscriptions does not mutate its input', () => {
  const subs: SubscriptionRecord[] = [
    { id: 'c', tipsterId: 'c', status: 'canceled', currentPeriodEnd: null },
    { id: 'a', tipsterId: 'a', status: 'active', currentPeriodEnd: null },
  ];
  const original = subs.map((s) => s.id);
  sortSubscriptions(subs);
  assert.deepEqual(
    subs.map((s) => s.id),
    original,
  );
});
