import { Injectable, Logger } from '@nestjs/common';
import type {
  BillingPortalSession,
  CheckoutSession,
  PaymentProvider,
  PayoutDestination,
  ProviderCapabilities,
  SubscriptionEvent,
  TransferResult,
} from './payment-provider.interface';

/**
 * Stripe adapter (Connect). v1 skeleton — the Stripe SDK is loaded lazily so
 * the app builds/runs without the dependency until Stripe is provisioned.
 * Fill in price/product wiring during Phase 3 integration.
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 *
 * Settles cards plus the Apple Pay / Google Pay wallets, which are card
 * methods that tokenize through Stripe (enabled via the dashboard + Apple Pay
 * domain verification), and supports recurring billing natively.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';

  readonly capabilities: ProviderCapabilities = {
    recurring: true,
    billingPortal: true,
    payouts: true,
    methods: ['card', 'apple_pay', 'google_pay'],
  };

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

  parseWebhook(rawBody: string, headers: Record<string, string>): SubscriptionEvent | null {
    // TODO: verify with stripe.webhooks.constructEvent(rawBody, signature, secret)
    // and map checkout.session.completed / customer.subscription.* events.
    this.log.warn('Stripe webhook parsing not yet implemented');
    void rawBody;
    void headers;
    return null;
  }

  async createBillingPortalSession(params: {
    userId: string;
    returnUrl: string;
  }): Promise<BillingPortalSession> {
    const stripe = await this.stripe();
    // TODO (OB-063): resolve the Stripe customer id for this user once the
    // subscription flow persists it; scaffolded here to keep the interface real.
    const session = await stripe.billingPortal.sessions.create({
      customer: params.userId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  async transferToTipster(params: {
    destination: PayoutDestination;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TransferResult> {
    if (params.destination.kind !== 'stripe') {
      throw new Error('Stripe provider requires a Stripe payout destination');
    }
    const stripe = await this.stripe();
    const transfer = await stripe.transfers.create(
      {
        amount: params.amountCents,
        currency: 'usd',
        destination: params.destination.accountId,
      },
      { idempotencyKey: params.idempotencyKey },
    );
    return { reference: transfer.id, amountCents: params.amountCents };
  }
}
