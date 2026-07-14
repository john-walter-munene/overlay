import { Injectable } from '@nestjs/common';
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
 * In-memory payments provider for local dev and tests. Checkout immediately
 * "succeeds": the URL points back to a local success route and parseWebhook
 * accepts a JSON body so the full subscription flow runs without Stripe.
 *
 * Advertises every method so the whole picker can be exercised locally.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  readonly capabilities: ProviderCapabilities = {
    recurring: true,
    billingPortal: true,
    payouts: true,
    methods: [
      'card',
      'apple_pay',
      'google_pay',
      'usdc',
      'usdt',
      'mpesa',
      'mtn_momo',
      'airtel_money',
    ],
  };

  async createSubscriptionCheckout(params: {
    userId: string;
    tipsterId: string;
    priceCents: number;
  }): Promise<CheckoutSession> {
    const reference = `mock_sub_${params.userId}_${params.tipsterId}`;
    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';
    return {
      url: `${webAppUrl}/subscribe/success?provider=mock&u=${params.userId}&t=${params.tipsterId}`,
      reference,
    };
  }

  async createBillingPortalSession(params: {
    userId: string;
    returnUrl: string;
  }): Promise<BillingPortalSession> {
    // No real Stripe portal locally: point the subscriber at the in-app mock
    // portal, which cancels/resumes by firing the same webhook as production.
    void params.userId;
    void params.returnUrl;
    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';
    return { url: `${webAppUrl}/account/subscriptions/portal` };
  }

  parseWebhook(rawBody: string): SubscriptionEvent | null {
    try {
      const body = JSON.parse(rawBody);
      if (!body.userId || !body.tipsterId) return null;      return {
        type: body.type ?? 'activated',
        userId: body.userId,
        tipsterId: body.tipsterId,
        provider: this.name,
        providerSubscriptionId:
          body.providerSubscriptionId ??
          `mock_sub_${body.userId}_${body.tipsterId}`,
        currentPeriodEnd: body.currentPeriodEnd
          ? new Date(body.currentPeriodEnd)
          : undefined,
      };
    } catch {
      return null;
    }
  }

  async transferToTipster(params: {
    destination: PayoutDestination;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TransferResult> {
    return {
      reference: `mock_tr_${params.idempotencyKey}`,
      amountCents: params.amountCents,
    };
  }
}
