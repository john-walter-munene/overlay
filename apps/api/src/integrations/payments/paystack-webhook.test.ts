import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  parsePaystackTransferWebhook,
  parsePaystackWebhook,
} from './paystack-webhook.ts';

const SECRET = 'sk_test_paystack_secret';

/** Build a valid `x-paystack-signature` for a raw body, as Paystack does. */
function sign(rawBody: string, secret = SECRET): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}

test('rejects a webhook when no signature header is present', () => {
  const body = JSON.stringify({ event: 'charge.success' });
  assert.equal(parsePaystackWebhook(body, {}, SECRET), null);
});

test('rejects a webhook with a tampered body (signature mismatch)', () => {
  const body = JSON.stringify({
    event: 'charge.success',
    data: { status: 'success', metadata: { userId: 'u1', tipsterId: 't9' } },
  });
  const header = sign(body);
  const tampered = body.replace('success', 'failed');
  assert.equal(
    parsePaystackWebhook(tampered, { 'x-paystack-signature': header }, SECRET),
    null,
  );
});

test('rejects when the secret is not configured', () => {
  const body = JSON.stringify({ event: 'charge.success' });
  assert.equal(
    parsePaystackWebhook(body, { 'x-paystack-signature': sign(body) }, undefined),
    null,
  );
});

test('maps a verified charge.success to an activated event via metadata', () => {
  const body = JSON.stringify({
    event: 'charge.success',
    data: {
      id: 302961,
      reference: 'ob_user_1_tipster_9_abc',
      status: 'success',
      amount: 500000,
      currency: 'NGN',
      paid_at: '2026-01-01T00:00:00.000Z',
      subscription_code: 'SUB_abc123',
      metadata: { userId: 'user_1', tipsterId: 'tipster_9' },
    },
  });
  const evt = parsePaystackWebhook(
    body,
    { 'x-paystack-signature': sign(body) },
    SECRET,
  );
  assert.ok(evt);
  assert.equal(evt.type, 'activated');
  assert.equal(evt.userId, 'user_1');
  assert.equal(evt.tipsterId, 'tipster_9');
  assert.equal(evt.provider, 'paystack');
  assert.equal(evt.providerSubscriptionId, 'SUB_abc123');
  assert.equal(evt.reference, 'paystack:charge:ob_user_1_tipster_9_abc');
  // Local-currency charge → amount is left to the ledger's stored-price fallback.
  assert.equal(evt.amountCents, undefined);
});

test('falls back to the transaction reference when no subscription_code', () => {
  const body = JSON.stringify({
    event: 'charge.success',
    data: {
      reference: 'ob_user_2_tipster_3_xyz',
      status: 'success',
      metadata: { userId: 'user_2', tipsterId: 'tipster_3' },
    },
  });
  const evt = parsePaystackWebhook(
    body,
    { 'x-paystack-signature': sign(body) },
    SECRET,
  );
  assert.ok(evt);
  assert.equal(evt.providerSubscriptionId, 'ob_user_2_tipster_3_xyz');
});

test('ignores a charge.success without our identity metadata', () => {
  const body = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'r1', status: 'success', metadata: '' },
  });
  assert.equal(
    parsePaystackWebhook(body, { 'x-paystack-signature': sign(body) }, SECRET),
    null,
  );
});

test('ignores a non-success charge and unhandled lifecycle events', () => {
  const failed = JSON.stringify({
    event: 'charge.success',
    data: { status: 'failed', metadata: { userId: 'u', tipsterId: 't' } },
  });
  assert.equal(
    parsePaystackWebhook(failed, { 'x-paystack-signature': sign(failed) }, SECRET),
    null,
  );

  const disable = JSON.stringify({
    event: 'subscription.disable',
    data: { subscription_code: 'SUB_abc123' },
  });
  assert.equal(
    parsePaystackWebhook(
      disable,
      { 'x-paystack-signature': sign(disable) },
      SECRET,
    ),
    null,
  );
});

test('transfer.success maps to a paid payout event via transfer_code', () => {
  const body = JSON.stringify({
    event: 'transfer.success',
    data: { transfer_code: 'TRF_abc123', reference: 'ob_payout_x', status: 'success' },
  });
  const evt = parsePaystackTransferWebhook(
    body,
    { 'x-paystack-signature': sign(body) },
    SECRET,
  );
  assert.ok(evt);
  assert.equal(evt.status, 'paid');
  assert.equal(evt.reference, 'TRF_abc123');
  assert.equal(evt.provider, 'paystack');
});

test('transfer.failed and transfer.reversed map to a failed payout event', () => {
  for (const event of ['transfer.failed', 'transfer.reversed']) {
    const body = JSON.stringify({ event, data: { transfer_code: 'TRF_z' } });
    const evt = parsePaystackTransferWebhook(
      body,
      { 'x-paystack-signature': sign(body) },
      SECRET,
    );
    assert.ok(evt);
    assert.equal(evt.status, 'failed');
    assert.equal(evt.reference, 'TRF_z');
  }
});

test('transfer webhook rejects a bad signature and ignores charge events', () => {
  const body = JSON.stringify({
    event: 'transfer.success',
    data: { transfer_code: 'TRF_z' },
  });
  assert.equal(
    parsePaystackTransferWebhook(body, { 'x-paystack-signature': 'bad' }, SECRET),
    null,
  );
  // A charge event is not a transfer event.
  const charge = JSON.stringify({
    event: 'charge.success',
    data: { status: 'success', metadata: { userId: 'u', tipsterId: 't' } },
  });
  assert.equal(
    parsePaystackTransferWebhook(
      charge,
      { 'x-paystack-signature': sign(charge) },
      SECRET,
    ),
    null,
  );
});
