import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPushPayload,
  deliverToSubscriptions,
  isGoneStatus,
  toWebPushSubscription,
  vapidConfig,
  type PushSend,
  type StoredPushSubscription,
} from './web-push.ts';

const subs: StoredPushSubscription[] = [
  { endpoint: 'https://push.example/a', p256dh: 'pa', auth: 'aa' },
  { endpoint: 'https://push.example/b', p256dh: 'pb', auth: 'ab' },
];

test('buildPushPayload serializes the service-worker payload', () => {
  const json = buildPushPayload({ title: 'New pick', body: 'x', url: '/feed' });
  assert.deepEqual(JSON.parse(json), {
    title: 'New pick',
    body: 'x',
    url: '/feed',
  });
});

test('toWebPushSubscription reshapes stored rows for the web-push SDK', () => {
  assert.deepEqual(toWebPushSubscription(subs[0]), {
    endpoint: 'https://push.example/a',
    keys: { p256dh: 'pa', auth: 'aa' },
  });
});

test('isGoneStatus flags 404/410 (and nothing else) for pruning', () => {
  assert.equal(isGoneStatus(404), true);
  assert.equal(isGoneStatus(410), true);
  assert.equal(isGoneStatus(201), false);
  assert.equal(isGoneStatus(500), false);
  assert.equal(isGoneStatus(undefined), false);
});

test('vapidConfig returns null without keys and defaults the subject', () => {
  assert.equal(vapidConfig({}), null);
  assert.equal(vapidConfig({ VAPID_PUBLIC_KEY: 'pub' }), null);
  assert.deepEqual(
    vapidConfig({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }),
    { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:no-reply@overlay.bet' },
  );
  assert.equal(
    vapidConfig({
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'https://overlay.bet',
    })?.subject,
    'https://overlay.bet',
  );
});

test('deliverToSubscriptions sends the payload to every subscription', async () => {
  const calls: Array<{ endpoint: string; payload: string }> = [];
  const send: PushSend = async (sub, payload) => {
    calls.push({ endpoint: sub.endpoint, payload });
  };

  const result = await deliverToSubscriptions(subs, 'p', send);

  assert.equal(result.sent, 2);
  assert.deepEqual(result.pruned, []);
  assert.deepEqual(
    calls.map((c) => c.endpoint).sort(),
    ['https://push.example/a', 'https://push.example/b'],
  );
});

test('deliverToSubscriptions collects gone endpoints for pruning', async () => {
  const send: PushSend = async (sub) => {
    if (sub.endpoint.endsWith('/a')) {
      throw Object.assign(new Error('gone'), { statusCode: 410 });
    }
  };

  const result = await deliverToSubscriptions(subs, 'p', send);

  assert.equal(result.sent, 1);
  assert.deepEqual(result.pruned, ['https://push.example/a']);
});

test('deliverToSubscriptions surfaces non-gone errors without pruning', async () => {
  const errors: string[] = [];
  const send: PushSend = async () => {
    throw Object.assign(new Error('boom'), { statusCode: 500 });
  };

  const result = await deliverToSubscriptions(subs, 'p', send, (endpoint) =>
    errors.push(endpoint),
  );

  assert.equal(result.sent, 0);
  assert.deepEqual(result.pruned, []);
  assert.equal(errors.length, 2);
});
