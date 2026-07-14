import { Injectable, Logger } from '@nestjs/common';
import type {
  CheckoutSession,
  PaymentProvider,
  SubscriptionEvent,
  TransferResult,
} from './payment-provider.interface';

/**
 * Stripe adapter (Connect). v1 skeleton — the Stripe SDK is loaded lazily so
 * the app builds/runs without the dependency until Stripe is provisioned.
 * Fill in price/product wiring during Phase 3 integration.
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly log = new Logger(StripePaymentProvider.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async stripe(): Promise<any> {
    if (!this.client) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
      const mod = await import('stripe');
      const Stripe = mod.default;
      this.client = new Stripe(key);
    }
    return this.client;
  }

  async createSubscriptionCheckout(params: {
    userId: string;
    tipsterId: string;
    priceCents: number;
  }): Promise<CheckoutSession> {
    const stripe = await this.stripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      // TODO: use a per-tipster Price; inline price_data shown for scaffolding.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            unit_amount: params.priceCents,
            product_data: { name: `Tipster ${params.tipsterId}` },
          },
        },
      ],
      client_reference_id: `${params.userId}:${params.tipsterId}`,
      success_url: `${process.env.WEB_APP_URL ?? 'http://localhost:3000'}/subscribe/success`,
      cancel_url: `${process.env.WEB_APP_URL ?? 'http://localhost:3000'}/subscribe/cancel`,
    });
    return { url: session.url, reference: session.id };
  }

  parseWebhook(rawBody: string, signature: string): SubscriptionEvent | null {
    // TODO: verify with stripe.webhooks.constructEvent(rawBody, signature, secret)
    // and map checkout.session.completed / customer.subscription.* events.
    this.log.warn('Stripe webhook parsing not yet implemented');
    void rawBody;
    void signature;
    return null;
  }

  async transferToTipster(params: {
    tipsterAccountId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TransferResult> {
    const stripe = await this.stripe();
    const transfer = await stripe.transfers.create(
      {
        amount: params.amountCents,
        currency: 'usd',
        destination: params.tipsterAccountId,
      },
      { idempotencyKey: params.idempotencyKey },
    );
    return { reference: transfer.id, amountCents: params.amountCents };
  }
}
