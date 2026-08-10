import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { currencyExponent } from '@overlay/shared';
import type {
  BillingPortalSession,
  CheckoutSession,
  PaymentMethodId,
  PaymentProvider,
  PayoutDestination,
  PayoutEvent,
  ProviderCapabilities,
  SubscriptionEvent,
  TransferResult,
} from './payment-provider.interface';
import { CurrencyService } from '../fx/currency.service';

const FLW_API = 'https://api.flutterwave.com/v3';

/**
 * Flutterwave v3 mobile-money payout rails, keyed by our network id. The value
 * is the network's transfer `account_bank` code. The charge/settlement currency
 * comes from MOBILE_MONEY_CURRENCY (single-market deployments). Verify the code
 * and currency for your target market in the Flutterwave dashboard before going
 * live — mobile-money transfer codes are country-specific (e.g. MTN in Ghana vs
 * Uganda) and can be overridden with FLUTTERWAVE_MOMO_BANKS if needed.
 */
const FLW_MOMO_BANK: Record<string, string> = {
  mpesa: 'MPS', // Kenya M-Pesa (KES)
  mtn_momo: 'MTN', // MTN Mobile Money
  airtel_money: 'AIRTEL', // Airtel Money
};

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
 * Payouts settle through the Flutterwave v3 Transfers API (mobile-money rail):
 * the tipster's network is mapped to an `account_bank` code and the transfer is
 * debited from the Flutterwave balance. Transfers complete asynchronously, so
 * the accepted transfer id is recorded and the final state arrives on the
 * `transfer.completed` webhook.
 *
 * Env: FLUTTERWAVE_SECRET_KEY, FLUTTERWAVE_WEBHOOK_HASH, MOBILE_MONEY_CURRENCY
 * (default KES), FLUTTERWAVE_MOMO_BANKS (optional payout account_bank overrides).
 * Point the Flutterwave webhook at:
 *   {PUBLIC_API_URL}/api/subscriptions/webhook/mobile_money
 *
 * NOTE: prices are stored in USD cents; the charge/payout is sent in
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

  isAvailable(): boolean {
    return this.configured || this.devFallback;
  }

  private readonly log = new Logger(MobileMoneyPaymentProvider.name);

  constructor(private readonly fx: CurrencyService) {}

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
        customizations: { title: 'Overlay Picks subscription' },
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

  parseTransferWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): PayoutEvent | null {
    if (!this.configured) return null;
    // Flutterwave signs webhooks with the same static `verif-hash` used for
    // charge events; payout results arrive on the same URL.
    const signature = headers['verif-hash'];
    if (!signature || !this.webhookHash || signature !== this.webhookHash) {
      return null;
    }
    try {
      const body = JSON.parse(rawBody) as {
        event?: string;
        data?: { id?: number | string; reference?: string; status?: string };
      };
      if (body.event !== 'transfer.completed') return null;
      const data = body.data ?? {};
      const reference = String(data.reference ?? data.id ?? '');
      if (!reference) return null;
      // Flutterwave reports the terminal state as SUCCESSFUL / FAILED.
      const status = data.status === 'SUCCESSFUL' ? 'paid' : 'failed';
      return { status, reference, provider: this.name };
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
      // Never fake a "paid" payout in production — that would mark money as sent
      // without moving any. Only the dev/staging path records a synthetic id.
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Flutterwave is not configured');
      }
      this.log.warn('FLUTTERWAVE_SECRET_KEY unset — recording a synthetic payout');
      return {
        reference: `momo_tr_${params.idempotencyKey}`,
        amountCents: params.amountCents,
      };
    }

    const dest = params.destination;
    const accountBank = this.momoBankFor(dest.network);
    if (!accountBank) {
      throw new Error(
        `Unsupported mobile-money network for payout: ${dest.network}`,
      );
    }
    // Convert the tipster's net balance (USD cents) into the settlement currency
    // so the mobile-money transfer amount is correct for the recipient.
    const quote = await this.fx.quote(params.amountCents, this.currency);
    const currency = quote.currency;
    // Idempotent, charset-safe reference so a retried payout is rejected as a
    // duplicate by Flutterwave rather than paying the tipster twice.
    const reference = `ob_payout_${params.idempotencyKey}`.replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
    const res = await fetch(`${FLW_API}/transfers`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey!}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        account_bank: accountBank,
        account_number: dest.phone,
        amount: quote.amountMinor / 10 ** currencyExponent(currency),
        currency,
        debit_currency: currency,
        narration: 'Overlay Picks tipster payout',
        reference,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Flutterwave transfer failed (${res.status}): ${detail}`);
    }
    const json = (await res.json()) as {
      status: string;
      message?: string;
      data?: { id?: number | string; reference?: string; status?: string };
    };
    if (json.status !== 'success' || !json.data?.id) {
      throw new Error(
        `Flutterwave transfer was not accepted: ${json.message ?? 'unknown error'}`,
      );
    }
    // Transfers settle asynchronously; the queued/accepted id is our reference.
    // Final success/failure arrives later on the `transfer.completed` webhook.
    return {
      reference: String(json.data.reference ?? json.data.id),
      amountCents: params.amountCents,
    };
  }

  /**
   * Resolve the Flutterwave `account_bank` code for a mobile-money network,
   * honouring an optional FLUTTERWAVE_MOMO_BANKS override
   * (`mpesa:MPS,mtn_momo:MTN,…`) before the built-in defaults.
   */
  private momoBankFor(network: string): string | undefined {
    const overrides = process.env.FLUTTERWAVE_MOMO_BANKS;
    if (overrides) {
      for (const pair of overrides.split(',')) {
        const [net, bank] = pair.split(':').map((s) => s.trim());
        if (net === network && bank) return bank;
      }
    }
    return FLW_MOMO_BANK[network];
  }
}
