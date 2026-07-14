import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSubscriberFeed,
  entitledTipsterIds,
  type FeedPick,
  type FeedSubscription,
} from './feed.ts';

function pick(over: Partial<FeedPick>): FeedPick {
  return {
    id: 'p',
    tipsterId: 't1',
    market: '1X2',
    selection: 'Home',
    oddsAtPick: 2,
    stakeUnits: 1,
    note: null,
    status: 'pending',
    clv: null,
    result: null,
    lockedAt: 0,
    settledAt: null,
    event: null,
    ...over,
  };
}

test('entitledTipsterIds: only active subscriptions confer entitlement', () => {
  const subs: FeedSubscription[] = [
    { tipsterId: 'a', status: 'active' },
    { tipsterId: 'b', status: 'canceled' },
    { tipsterId: 'c', status: 'past_due' },
    { tipsterId: 'd', status: 'active' },
  ];
  assert.deepEqual(entitledTipsterIds(subs).sort(), ['a', 'd']);
});

test('entitledTipsterIds: dedupes and handles empty input', () => {
  assert.deepEqual(entitledTipsterIds([]), []);
  assert.deepEqual(
    entitledTipsterIds([
      { tipsterId: 'a', status: 'active' },
      { tipsterId: 'a', status: 'active' },
    ]),
    ['a'],
  );
});

test('buildSubscriberFeed: only entitled tipsters picks appear', () => {
  const subs: FeedSubscription[] = [
    { tipsterId: 'a', status: 'active' },
    { tipsterId: 'b', status: 'canceled' },
  ];
  const picks = [
    pick({ id: 'p1', tipsterId: 'a' }),
    pick({ id: 'p2', tipsterId: 'b' }), // canceled → excluded
    pick({ id: 'p3', tipsterId: 'c' }), // never subscribed → excluded
    pick({ id: 'p4', tipsterId: 'a' }),
  ];
  const feed = buildSubscriberFeed(picks, subs);
  assert.deepEqual(
    feed.map((p) => p.id).sort(),
    ['p1', 'p4'],
  );
  assert.ok(feed.every((p) => p.tipsterId === 'a'));
});

test('buildSubscriberFeed: newest first, ties broken by id', () => {
  const subs: FeedSubscription[] = [{ tipsterId: 'a', status: 'active' }];
  const picks = [
    pick({ id: 'old', tipsterId: 'a', lockedAt: 100 }),
    pick({ id: 'new', tipsterId: 'a', lockedAt: 300 }),
    pick({ id: 'mid-b', tipsterId: 'a', lockedAt: 200 }),
    pick({ id: 'mid-a', tipsterId: 'a', lockedAt: 200 }),
  ];
  const feed = buildSubscriberFeed(picks, subs);
  assert.deepEqual(
    feed.map((p) => p.id),
    ['new', 'mid-a', 'mid-b', 'old'],
  );
});

test('buildSubscriberFeed: includes both pending and settled picks', () => {
  const subs: FeedSubscription[] = [{ tipsterId: 'a', status: 'active' }];
  const picks = [
    pick({ id: 'live', tipsterId: 'a', status: 'pending', lockedAt: 2 }),
    pick({
      id: 'done',
      tipsterId: 'a',
      status: 'won',
      result: 'Home win',
      settledAt: 5,
      lockedAt: 1,
    }),
  ];
  const feed = buildSubscriberFeed(picks, subs);
  assert.deepEqual(
    feed.map((p) => p.status),
    ['pending', 'won'],
  );
});

test('buildSubscriberFeed: no active subscriptions yields empty feed', () => {
  const picks = [pick({ id: 'p1', tipsterId: 'a' })];
  assert.deepEqual(
    buildSubscriberFeed(picks, [{ tipsterId: 'a', status: 'canceled' }]),
    [],
  );
  assert.deepEqual(buildSubscriberFeed(picks, []), []);
});
