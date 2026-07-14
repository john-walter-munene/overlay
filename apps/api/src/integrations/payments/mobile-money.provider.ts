import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { currencyExponent } from '@overlay/shared';
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

const FLW_API = 'https://api.flutterwave.com/v3';

/**
 * Mobile-money provider for African markets, backed by **Flutterwave** (OB-06x).
 *
 * Flutterwave's hosted payment page routes M-Pesa (Kenya), MTN MoMo and Airtel
 * Money, which fits our redirect-based checkout. Charges are one-off, so
 * subscriptions are modelled **pay-per-period** (`recurring: false`): access is
 * granted when the charge completes and the subscriber re-pays each cycle.
 *
 * Without FLUTTERWAVE_SECRET_KEY it falls back to the local success-page flow
 * so the journey is demoable. With keys set it creates a real hosted payment
 * link and verifies the webhook via the `verif-hash` header.
 *
 * Env: FLUTTERWAVE_SECRET_KEY, FLUTTERWAVE_WEBHOOK_HASH, MOBILE_MONEY_CURRENCY
 * (default KES). Point the Flutterwave webhook at:
 *   {PUBLIC_API_URL}/api/subscriptions/webhook/mobile_money
 *
 * NOTE: prices are stored in USD cents; the charge is sent in
 * MOBILE_MONEY_CURRENCY without conversion — wire an FX step (TODO) before
 * charging a non-USD currency in production.
 */
@Injectable()
export class MobileMoneyPaymentProvider implements PaymentProvider {
  readonly name = 'mobile_money';

  readonly capabilities: ProviderCapabilities = {
    recurring: false,
    billingPortal: false,
    payouts: true,
    methods: ['mpesa', 'mtn_momo', 'airtel_money'],
  };

  private readonly log = new Logger(MobileMoneyPaymentProvider.name);

  private get secretKey(): string | undefined {
    return process.env.FLUTTERWAVE_SECRET_KEY;
  }

  private get webhookHash(): string | undefined {
    return process.env.FLUTTERWAVE_WEBHOOK_HASH;
  }

  private get currency(): string {
    return process.env.MOBILE_MONEY_CURRENCY ?? 'KES';
  }

  private get configured(): boolean {
    return Boolean(this.secretKey);
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
    customerEmail?: string;
    chargeCurrency?: string;
    chargeAmountMinor?: number;
  }): Promise<CheckoutSession> {
    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';

    if (!this.configured) {
      if (!this.devFallback) {
        throw new Error('Flutterwave is not configured');
      }
      return {
        url: `${webAppUrl}/subscribe/success?provider=mobile_money&u=${params.userId}&t=${params.tipsterId}`,
        reference: `mobile_money_sub_${params.userId}_${params.tipsterId}`,
      };
    }

    // Prefer the pre-converted local charge from the FX layer; else fall back
    // to the configured currency with the raw USD amount (dev only).
    const currency = params.chargeCurrency ?? this.currency;
    const amount =
      params.chargeAmountMinor != null
        ? (
            params.chargeAmountMinor / 10 ** currencyExponent(currency)
          ).toFixed(currencyExponent(currency))
        : (params.priceCents / 100).toFixed(2);

    const txRef = `ob_${params.userId}_${params.tipsterId}_${randomUUID()}`;
    const res = await fetch(`${FLW_API}/payments`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey!}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount,
        currency,
        redirect_url: `${webAppUrl}/subscribe/success`,
        payment_options: 'mpesa,mobilemoneyghana,mobilemoneyuganda,mobilemoneyrwanda',
        customer: {
          email: params.customerEmail ?? `${params.userId}@users.overlay.bet`,
        },
        meta: { userId: params.userId, tipsterId: params.tipsterId },
        customizations: { title: 'Overlay Bets subscription' },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Flutterwave payment failed (${res.status}): ${detail}`);
    }
    const json = (await res.json()) as {
      status: string;
      data?: { link?: string };
    };
    if (json.status !== 'success' || !json.data?.link) {
      throw new Error('Flutterwave did not return a payment link');
    }
    return { url: json.data.link, reference: txRef };
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
            `mobile_money_sub_${body.userId}_${body.tipsterId}`,
        };
      } catch {
        return null;
      }
    }

    // Flutterwave signs webhooks with a static secret hash in `verif-hash`.
    const signature = headers['verif-hash'];
    if (!signature || !this.webhookHash || signature !== this.webhookHash) {
      this.log.warn('Flutterwave webhook hash mismatch');
      return null;
    }

    try {
      const body = JSON.parse(rawBody) as {
        event?: string;
        data?: {
          id?: number | string;
          tx_ref?: string;
          status?: string;
          meta?: Record<string, string>;
        };
      };
      const data = body.data ?? {};
      const meta = data.meta ?? {};
      if (!meta.userId || !meta.tipsterId) return null;
      const succeeded =
        body.event === 'charge.completed' && data.status === 'successful';
      if (!succeeded) return null;
      return {
        type: 'activated',
        userId: meta.userId,
        tipsterId: meta.tipsterId,
        provider: this.name,
        providerSubscriptionId: String(data.id ?? data.tx_ref ?? meta.userId),
      };
    } catch {
      return null;
    }
  }

  async createBillingPortalSession(): Promise<BillingPortalSession> {
    throw new Error('Mobile-money provider has no billing portal');
  }

  async transferToTipster(params: {
    destination: PayoutDestination;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TransferResult> {
    if (params.destination.kind !== 'mobile_money') {
      throw new Error(
        'Mobile-money provider requires a mobile-money payout destination',
      );
    }
    if (!this.configured) {
      this.log.warn('FLUTTERWAVE_SECRET_KEY unset — recording a synthetic payout');
      return {
        reference: `momo_tr_${params.idempotencyKey}`,
        amountCents: params.amountCents,
      };
    }
    // TODO: Flutterwave Transfers API (account_bank per network + phone).
    throw new Error('Mobile-money payout integration not yet implemented');
  }
}
