import { Injectable } from '@nestjs/common';
import type {
  CheckoutSession,
  PaymentProvider,
  SubscriptionEvent,
  TransferResult,
} from './payment-provider.interface';

/**
 * In-memory payments provider for local dev and tests. Checkout immediately
 * "succeeds": the URL points back to a local success route and parseWebhook
 * accepts a JSON body so the full subscription flow runs without Stripe.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async createSubscriptionCheckout(params: {
    userId: string;
    tipsterId: string;
    priceCents: number;
  }): Promise<CheckoutSession> {
    const reference = `mock_sub_${params.userId}_${params.tipsterId}`;
    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';
    return {
      url: `${webAppUrl}/subscribe/success?ref=${reference}`,
      reference,
    };
  }

  parseWebhook(rawBody: string): SubscriptionEvent | null {
    try {
      const body = JSON.parse(rawBody);
      if (!body.userId || !body.tipsterId) return null;
      return {
        type: body.type ?? 'activated',
        userId: body.userId,
        tipsterId: body.tipsterId,
        providerSubscriptionId:
          body.providerSubscriptionId ?? `mock_sub_${body.userId}`,
        currentPeriodEnd: body.currentPeriodEnd
          ? new Date(body.currentPeriodEnd)
          : undefined,
      };
    } catch {
      return null;
    }
  }

  async transferToTipster(params: {
    tipsterAccountId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TransferResult> {
    return {
      reference: `mock_tr_${params.idempotencyKey}`,
      amountCents: params.amountCents,
    };
  }
}
