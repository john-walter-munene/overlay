import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock.provider';
import { StripePaymentProvider } from './stripe.provider';
import { CryptoPaymentProvider } from './crypto.provider';
import { MobileMoneyPaymentProvider } from './mobile-money.provider';
import { PaymentProviderRegistry } from './payment-provider.registry';
import type { PaymentProvider } from './payment-provider.interface';

/** DI token for the default (env-selected) payment provider. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** DI token for the registry of all wired payment providers. */
export const PAYMENT_REGISTRY = Symbol('PAYMENT_REGISTRY');

/** Resolve the default provider name from env (defaults to the mock). */
function defaultProviderName(): string {
  return process.env.PAYMENTS_PROVIDER === 'stripe' ? 'stripe' : 'mock';
}

@Module({
  providers: [
    MockPaymentProvider,
    StripePaymentProvider,
    CryptoPaymentProvider,
    MobileMoneyPaymentProvider,
    {
      provide: PAYMENT_REGISTRY,
      inject: [
        MockPaymentProvider,
        StripePaymentProvider,
        CryptoPaymentProvider,
        MobileMoneyPaymentProvider,
      ],
      useFactory: (
        mock: MockPaymentProvider,
        stripe: StripePaymentProvider,
        crypto: CryptoPaymentProvider,
        mobileMoney: MobileMoneyPaymentProvider,
      ): PaymentProviderRegistry => {
        const defaultName = defaultProviderName();
        // The mock settles every method, so it must NOT be registered alongside
        // real providers (it would shadow them in forMethod). Include it only
        // when it's the default (dev / staging without real keys).
        const providers =
          defaultName === 'mock'
            ? [mock, stripe, crypto, mobileMoney]
            : [stripe, crypto, mobileMoney];
        return new PaymentProviderRegistry(providers, defaultName);
      },
    },
    {
      provide: PAYMENT_PROVIDER,
      inject: [PAYMENT_REGISTRY],
      useFactory: (registry: PaymentProviderRegistry): PaymentProvider =>
        registry.default,
    },
  ],
  exports: [PAYMENT_PROVIDER, PAYMENT_REGISTRY],
})
export class PaymentsModule {}
