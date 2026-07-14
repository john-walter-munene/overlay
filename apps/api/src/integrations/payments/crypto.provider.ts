import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  BillingPortalSession,
  CheckoutSession,
  PaymentMethodId,
  PaymentProvider,
  PayoutDestination,
  ProviderCapabilities,
  SubscriptionEvent,
  TransferResult,
} from './payment-provider.interface';

const COMMERCE_API = 'https://api.commerce.coinbase.com';
const COMMERCE_VERSION = '2018-03-22';

/**
 * Crypto stablecoin provider backed by **Coinbase Commerce** (OB-06x).
 *
 * Crypto has no card-on-file, so subscriptions are modelled **pay-per-period**
 * (`recurring: false`): each cycle is a fresh hosted charge and access is
 * granted when the charge confirms. Prices are quoted in fiat (USD) and settled
 * on Coinbase's hosted page in a stablecoin (USDC/USDT).
 *
 * Without COINBASE_COMMERCE_API_KEY it falls back to the local success-page
 * flow so the journey is demoable. With keys set it creates a real hosted
 * charge and verifies webhook signatures (HMAC-SHA256 over the raw body with
 * the shared webhook secret).
 *
 * Env: COINBASE_COMMERCE_API_KEY, COINBASE_COMMERCE_WEBHOOK_SECRET.
 * Point the Coinbase Commerce webhook at:
 *   {PUBLIC_API_URL}/api/subscriptions/webhook/crypto
 *
 * Note: Coinbase Commerce is checkout-only — crypto payouts are a separate
 * rail, so {@link transferToTipster} is not implemented against it.
 */
@Injectable()
export class CryptoPaymentProvider implements PaymentProvider {
  readonly name = 'crypto';

  readonly capabilities: ProviderCapabilities = {
    recurring: false,
    billingPortal: false,
    payouts: true,
    methods: ['usdc', 'usdt'],
  };

  private readonly log = new Logger(CryptoPaymentProvider.name);

  private get apiKey(): string | undefined {
    return process.env.COINBASE_COMMERCE_API_KEY;
  }

  private get webhookSecret(): string | undefined {
    return process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  }

  private get configured(): boolean {
    return Boolean(this.apiKey);
  }

  /** Dev-only success-page fallback (never in production, to avoid free subs). */
  private get devFallback(): boolean {
    return !this.configured && process.env.NODE_ENV !== 'production';
  }

  async createSubscriptionCheckout(params: {
    userId: string;
    tipsterId: string;
    priceCents: number;
    method?: PaymentMethodId;
  }): Promise<CheckoutSession> {
    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';

    if (!this.configured) {
      if (!this.devFallback) {
        throw new Error('Coinbase Commerce is not configured');
      }
      // Dev fallback: the success page confirms the charge via the webhook.
      return {
        url: `${webAppUrl}/subscribe/success?provider=crypto&u=${params.userId}&t=${params.tipsterId}`,
        reference: `crypto_sub_${params.userId}_${params.tipsterId}`,
      };
    }

    const res = await fetch(`${COMMERCE_API}/charges`, {
      method: 'POST',
      headers: {
        'X-CC-Api-Key': this.apiKey!,
        'X-CC-Version': COMMERCE_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Overlay Bets subscription',
        description: `Subscription to tipster ${params.tipsterId}`,
        pricing_type: 'fixed_price',
        local_price: {
          amount: (params.priceCents / 100).toFixed(2),
          currency: 'USD',
        },
        metadata: { userId: params.userId, tipsterId: params.tipsterId },
        redirect_url: `${webAppUrl}/subscribe/success`,
        cancel_url: `${webAppUrl}/subscribe/cancel`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Coinbase Commerce charge failed (${res.status}): ${detail}`,
      );
    }
    const json = (await res.json()) as {
      data: { hosted_url: string; code: string };
    };
    return { url: json.data.hosted_url, reference: json.data.code };
  }

  parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): SubscriptionEvent | null {
    if (!this.configured) {
      if (!this.devFallback) return null;
      // Dev path: the success page posts a plain JSON body (no signature).
      try {
        const body = JSON.parse(rawBody);
        if (!body.userId || !body.tipsterId) return null;
        return {
          type: body.type ?? 'activated',
          userId: body.userId,
          tipsterId: body.tipsterId,
          provider: this.name,
          providerSubscriptionId:
            body.providerSubscriptionId ??
            `crypto_sub_${body.userId}_${body.tipsterId}`,
        };
      } catch {
        return null;
      }
    }

    const signature = headers['x-cc-webhook-signature'];
    const secret = this.webhookSecret;
    if (!signature || !secret) return null;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!hexEqual(signature, expected)) {
      this.log.warn('Coinbase Commerce webhook signature mismatch');
      return null;
    }

    try {
      const body = JSON.parse(rawBody) as {
        event?: {
          type?: string;
          data?: {
            code?: string;
            id?: string;
            metadata?: Record<string, string>;
          };
        };
      };
      const event = body.event;
      const meta = event?.data?.metadata ?? {};
      if (!meta.userId || !meta.tipsterId) return null;
      // Only a confirmed charge grants access (pay-per-period).
      if (event?.type !== 'charge:confirmed') return null;
      return {
        type: 'activated',
        userId: meta.userId,
        tipsterId: meta.tipsterId,
        provider: this.name,
        providerSubscriptionId:
          event.data?.code ?? event.data?.id ?? `crypto_${meta.userId}`,
      };
    } catch {
      return null;
    }
  }

  async createBillingPortalSession(): Promise<BillingPortalSession> {
    // Crypto has no hosted portal; subscribers re-pay each period instead.
    throw new Error('Crypto provider has no billing portal');
  }

  async transferToTipster(params: {
    destination: PayoutDestination;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TransferResult> {
    if (params.destination.kind !== 'crypto') {
      throw new Error('Crypto provider requires a crypto payout destination');
    }
    // Coinbase Commerce is checkout-only; on-chain payouts are a separate rail.
    if (!this.configured) {
      this.log.warn('Coinbase Commerce unset — recording a synthetic payout');
      return {
        reference: `crypto_tr_${params.idempotencyKey}`,
        amountCents: params.amountCents,
      };
    }
    throw new Error('Crypto payouts are not supported via Coinbase Commerce');
  }
}

/** Constant-time compare of two hex strings. */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
