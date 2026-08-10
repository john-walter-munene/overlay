import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaymentProviderRegistry } from './payment-provider.registry.ts';
import type {
  PaymentMethodId,
  PaymentProvider,
} from './payment-provider.interface.ts';

/** Minimal fake provider — only name + capabilities matter for routing. */
function fake(
  name: string,
  methods: PaymentMethodId[],
  over: Partial<PaymentProvider['capabilities']> = {},
): PaymentProvider {
  return {
    name,
    capabilities: {
      recurring: true,
      billingPortal: true,
      payouts: true,
      methods,
      ...over,
    },
  } as PaymentProvider;
}

const stripe = fake('stripe', ['card', 'apple_pay', 'google_pay']);
const crypto = fake('crypto', ['usdc', 'usdt'], {
  recurring: false,
  billingPortal: false,
});
const momo = fake('momo', ['mpesa', 'mtn_momo'], { recurring: false });

test('default resolves to the named provider', () => {
  const reg = new PaymentProviderRegistry([stripe, crypto], 'stripe');
  assert.equal(reg.default.name, 'stripe');
});

test('constructor throws when default is not registered', () => {
  assert.throws(() => new PaymentProviderRegistry([stripe], 'crypto'));
});

test('get throws for an unknown provider', () => {
  const reg = new PaymentProviderRegistry([stripe], 'stripe');
  assert.throws(() => reg.get('nope'));
  assert.equal(reg.has('nope'), false);
  assert.equal(reg.has('stripe'), true);
});

test('forMethod routes a method to the provider that settles it', () => {
  const reg = new PaymentProviderRegistry([stripe, crypto, momo], 'stripe');
  assert.equal(reg.forMethod('apple_pay')?.name, 'stripe');
  assert.equal(reg.forMethod('google_pay')?.name, 'stripe');
  assert.equal(reg.forMethod('usdc')?.name, 'crypto');
  assert.equal(reg.forMethod('mpesa')?.name, 'momo');
});

test('forMethod returns undefined when no provider settles the method', () => {
  const reg = new PaymentProviderRegistry([stripe], 'stripe');
  assert.equal(reg.forMethod('usdc'), undefined);
});

test('forMethod prefers the default provider for a shared method', () => {
  // Both Stripe and Paystack settle `card`; the configured default wins.
  const paystack = fake('paystack', ['card'], { billingPortal: false });
  const reg = new PaymentProviderRegistry([stripe, paystack], 'paystack');
  assert.equal(reg.forMethod('card')?.name, 'paystack');
  // A method the default doesn't settle still falls back to whoever does.
  const reg2 = new PaymentProviderRegistry([stripe, paystack, crypto], 'paystack');
  assert.equal(reg2.forMethod('apple_pay')?.name, 'stripe');
  assert.equal(reg2.forMethod('usdc')?.name, 'crypto');
});

test('methods and forMethod skip unavailable providers', () => {
  const offline = {
    ...fake('offline', ['usdc', 'usdt']),
    isAvailable: () => false,
  } as PaymentProvider;
  const reg = new PaymentProviderRegistry([stripe, offline], 'stripe');
  // The offline provider's methods are hidden from the picker…
  assert.deepEqual([...reg.methods()].sort(), ['apple_pay', 'card', 'google_pay']);
  // …and it isn't routed to, even though it's the only usdc settler.
  assert.equal(reg.forMethod('usdc'), undefined);
});

test('forMethod skips an unavailable default and falls back', () => {
  const offlineDefault = {
    ...fake('paystack', ['card']),
    isAvailable: () => false,
  } as PaymentProvider;
  const reg = new PaymentProviderRegistry([offlineDefault, stripe], 'paystack');
  assert.equal(reg.forMethod('card')?.name, 'stripe');
});

test('methods lists the union of enabled methods without duplicates', () => {
  const reg = new PaymentProviderRegistry([stripe, crypto, momo], 'stripe');
  const methods = reg.methods();
  assert.deepEqual(
    [...methods].sort(),
    ['airtel_money', 'apple_pay', 'card', 'google_pay', 'mpesa', 'mtn_momo', 'usdc', 'usdt']
      .filter((m) => methods.includes(m as PaymentMethodId))
      .sort(),
  );
  // No duplicates.
  assert.equal(new Set(methods).size, methods.length);
});
