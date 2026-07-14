import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePayoutTarget,
  type TipsterPayoutFields,
} from './payout-destination.ts';

function fields(over: Partial<TipsterPayoutFields> = {}): TipsterPayoutFields {
  return {
    payoutMethod: null,
    stripeAccountId: null,
    payoutWalletAddress: null,
    payoutWalletChain: null,
    payoutMobileNumber: null,
    payoutMobileNetwork: null,
    ...over,
  };
}

test('returns null when nothing is configured', () => {
  assert.equal(resolvePayoutTarget(fields()), null);
});

test('legacy stripeAccountId with no explicit method resolves to Stripe', () => {
  const r = resolvePayoutTarget(fields({ stripeAccountId: 'acct_123' }));
  assert.deepEqual(r, {
    provider: 'stripe',
    destination: { kind: 'stripe', accountId: 'acct_123' },
  });
});

test('crypto method resolves to a wallet destination', () => {
  const r = resolvePayoutTarget(
    fields({
      payoutMethod: 'crypto',
      payoutWalletAddress: '0xabc',
      payoutWalletChain: 'polygon',
    }),
  );
  assert.deepEqual(r, {
    provider: 'crypto',
    destination: { kind: 'crypto', address: '0xabc', chain: 'polygon' },
  });
});

test('mobile money method resolves to a phone destination', () => {
  const r = resolvePayoutTarget(
    fields({
      payoutMethod: 'mobile_money',
      payoutMobileNumber: '+254700000000',
      payoutMobileNetwork: 'mpesa',
    }),
  );
  assert.deepEqual(r, {
    provider: 'mobile_money',
    destination: {
      kind: 'mobile_money',
      phone: '+254700000000',
      network: 'mpesa',
    },
  });
});

test('incomplete details for the chosen method return null', () => {
  assert.equal(
    resolvePayoutTarget(fields({ payoutMethod: 'crypto', payoutWalletAddress: '0xabc' })),
    null,
  );
  assert.equal(
    resolvePayoutTarget(fields({ payoutMethod: 'mobile_money', payoutMobileNumber: '+254' })),
    null,
  );
  assert.equal(resolvePayoutTarget(fields({ payoutMethod: 'stripe' })), null);
});

test('explicit method takes precedence over a legacy stripe account', () => {
  const r = resolvePayoutTarget(
    fields({
      payoutMethod: 'crypto',
      stripeAccountId: 'acct_legacy',
      payoutWalletAddress: '0xabc',
      payoutWalletChain: 'ethereum',
    }),
  );
  assert.equal(r?.provider, 'crypto');
});
