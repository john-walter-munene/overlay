import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock.provider';
import { StripePaymentProvider } from './stripe.provider';
import type { PaymentProvider } from './payment-provider.interface';

/** DI token for the active payment provider. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

@Module({
  providers: [
    MockPaymentProvider,
    StripePaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [MockPaymentProvider, StripePaymentProvider],
      useFactory: (
        mock: MockPaymentProvider,
        stripe: StripePaymentProvider,
      ): PaymentProvider =>
        process.env.PAYMENTS_PROVIDER === 'stripe' ? stripe : mock,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
