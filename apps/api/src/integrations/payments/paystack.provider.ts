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
import {
  parsePaystackTransferWebhook,
  parsePaystackWebhook,
} from './paystack-webhook';

const PAYSTACK_API = 'https://api.paystack.co';

/**
 * Map our payment-method ids to the Paystack checkout channel that settles them.
 * Methods not listed (e.g. an unspecified generic checkout) leave `channels`
 * unset so Paystack shows every channel enabled on the account.
 */
const PAYSTACK_CHANNEL: Partial<Record<PaymentMethodId, string>> = {
  card: 'card',
  mpesa: 'mobile_money',
  mtn_momo: 'mobile_money',
  airtel_money: 'mobile_money',
};

/**
 * Card + mobile-money provider backed by **Paystack** (OB-06x) — the primary
 * processor for Nigeria, Ghana, South Africa, Kenya and Côte d'Ivoire, where
 * Stripe isn't available.
 *
 * Paystack's hosted checkout (`authorization_url`) fits our redirect flow and
 * settles a broad set of channels: cards, bank transfer, USSD, QR, EFT and
 * **mobile money** (M-Pesa in Kenya, MTN / AirtelTigo / Telecel in Ghana, and
 * Orange / Wave in Côte d'Ivoire). The chosen payment *method* narrows the
 * hosted page to the matching channel; a generic checkout (no method) shows
 * every channel enabled on the dashboard, or the operator's PAYSTACK_CHANNELS
 * allow-list. (Paystack has no Google Pay channel, and Apple Pay is surfaced
 * automatically within the card channel rather than as a separate option.)
 *
 * The initialize call takes a one-off amount, so subscriptions are modelled
 * **pay-per-period** (`recurring: false`): access is granted when the charge
 * succeeds and the subscriber re-pays each cycle. (Native Paystack Plans are a
 * future enhancement — reliable recurring needs a persisted
 * subscription_code → user/tipster mapping, which lifecycle webhooks don't
 * carry.)
 *
 * Without PAYSTACK_SECRET_KEY it falls back to the local success-page flow so
 * the journey is demoable. With the key set it creates a real hosted
 * transaction and verifies webhooks via the `x-paystack-signature` header
 * (HMAC-SHA512 over the raw body, keyed with the same secret).
 *
 * Env: PAYSTACK_SECRET_KEY, PAYSTACK_CURRENCY (default NGN), PAYSTACK_CHANNELS
 * (optional comma-separated channel allow-list for generic checkout). Point the
 * Paystack webhook at:  {PUBLIC_API_URL}/api/subscriptions/webhook/paystack
 *
 * NOTE: prices are stored in USD cents; the FX layer pre-converts to the local
 * charge currency + minor units. Mobile money must be charged in the market's
 * currency (KES / GHS / XOF), so the subscriber's country/currency must resolve
 * through FX — wire FX before charging a non-USD currency in production.
 */
@Injectable()
export class PaystackPaymentProvider implements PaymentProvider {
  readonly name = 'paystack';

  readonly capabilities: ProviderCapabilities = {
    recurring: false,
    billingPortal: false,
    payouts: true,
    methods: ['card', 'mpesa', 'mtn_momo', 'airtel_money'],
  };

  isAvailable(): boolean {
    return this.configured || this.devFallback;
  }

  private readonly log = new Logger(PaystackPaymentProvider.name);

  constructor(private readonly fx: CurrencyService) {}

  private get secretKey(): string | undefined {
    return process.env.PAYSTACK_SECRET_KEY;
  }

  private get currency(): string {
    return process.env.PAYSTACK_CURRENCY ?? 'NGN';
  }

  private get configured(): boolean {
    return Boolean(this.secretKey);
  }

  /** Dev-only success-page fallback (never in production, to avoid free subs). */
  private get devFallback(): boolean {
    return !this.configured && process.env.NODE_ENV !== 'production';
  }

  /**
   * Resolve the Paystack `channels` for a checkout. A specific payment method
   * pins the hosted page to the channel that settles it (e.g. `mpesa` →
   * mobile_money); a generic checkout uses the operator's PAYSTACK_CHANNELS
   * allow-list, else `undefined` so Paystack shows every channel enabled on the
   * dashboard.
   */
  private channelsFor(method?: PaymentMethodId): string[] | undefined {
    const mapped = method ? PAYSTACK_CHANNEL[method] : undefined;
    if (mapped) return [mapped];
    const configured = process.env.PAYSTACK_CHANNELS?.split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    return configured && configured.length ? configured : undefined;
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
        throw new Error('Paystack is not configured');
      }
      // Dev fallback: the success page confirms the charge via the webhook.
      return {
        url: `${webAppUrl}/subscribe/success?provider=paystack&u=${params.userId}&t=${params.tipsterId}`,
        reference: `paystack_sub_${params.userId}_${params.tipsterId}`,
      };
    }

    // Prefer the pre-converted local charge from the FX layer; else fall back to
    // the configured currency with the raw USD amount (dev only). Paystack wants
    // an integer amount in the currency's minor unit (kobo/pesewa/cent).
    const currency = params.chargeCurrency ?? this.currency;
    const amountMinor =
      params.chargeAmountMinor ??
      (params.priceCents / 100) * 10 ** currencyExponent(currency);

    // Our own reference keeps the checkout idempotent and traceable in Paystack.
    const reference = `ob_${params.userId}_${params.tipsterId}_${randomUUID()}`;
    const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey!}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: params.customerEmail ?? `${params.userId}@users.overlay.bet`,
        amount: Math.round(amountMinor),
        currency,
        reference,
        channels: this.channelsFor(params.method),
        // Echoed back on the `charge.success` webhook so we can map the payment
        // to the subscriber + tipster.
        metadata: { userId: params.userId, tipsterId: params.tipsterId },
        callback_url: `${webAppUrl}/subscribe/success`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Paystack transaction initialize failed (${res.status}): ${detail}`,
      );
    }
    const json = (await res.json()) as {
      status: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };
    if (json.status !== true || !json.data?.authorization_url) {
      throw new Error(
        `Paystack did not return an authorization URL: ${json.message ?? 'unknown error'}`,
      );
    }
    return {
      url: json.data.authorization_url,
      reference: json.data.reference ?? reference,
    };
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
            `paystack_sub_${body.userId}_${body.tipsterId}`,
        };
      } catch {
        return null;
      }
    }

    const event = parsePaystackWebhook(rawBody, headers, this.secretKey);
    if (!event) {
      this.log.warn(
        'Paystack webhook rejected (bad signature or unhandled event)',
      );
    }
    return event;
  }

  parseTransferWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): PayoutEvent | null {
    if (!this.configured) return null;
    return parsePaystackTransferWebhook(rawBody, headers, this.secretKey);
  }

  async createBillingPortalSession(): Promise<BillingPortalSession> {
    // Paystack has no hosted portal; subscribers re-pay each period instead.
    throw new Error('Paystack provider has no billing portal');
  }

  /**
   * Pay a tipster out via the Paystack Transfers API: idempotently resolve a
   * transfer recipient for their bank account, then initiate a transfer from the
   * account balance.
   *
   * Operator prerequisites (Paystack dashboard):
   *   - Transfers must be enabled on the business (may require KYC/activation).
   *   - The balance must be funded (source: 'balance').
   *   - "Confirm transfers with OTP" must be turned OFF under Settings →
   *     Preferences → Transfers, so payouts don't stall on a one-time password.
   *
   * NOTE: amountCents is the tipster's net revenue in USD minor units; it's sent
   * here in PAYSTACK_CURRENCY's minor units without FX conversion (a TODO shared
   * with the other rails). Wire the FX layer before paying out a non-USD balance.
   */
  async transferToTipster(params: {
    destination: PayoutDestination;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TransferResult> {
    if (params.destination.kind !== 'paystack') {
      throw new Error('Paystack provider requires a Paystack payout destination');
    }
    if (!this.configured) {
      if (!this.devFallback) throw new Error('Paystack is not configured');
      this.log.warn('PAYSTACK_SECRET_KEY unset — recording a synthetic payout');
      return {
        reference: `paystack_tr_${params.idempotencyKey}`,
        amountCents: params.amountCents,
      };
    }

    const dest = params.destination;
    // Convert the tipster's net balance (USD cents) into Paystack's settlement
    // currency so the transfer amount is correct for the recipient's bank.
    const quote = await this.fx.quote(params.amountCents, this.currency);
    const currency = quote.currency;
    // 1) Resolve the transfer recipient. Paystack dedupes by account+bank and
    //    returns the existing recipient_code, so this is safe to call per payout.
    const recipientRes = await fetch(`${PAYSTACK_API}/transferrecipient`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey!}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'nuban',
        name: dest.accountName,
        account_number: dest.accountNumber,
        bank_code: dest.bankCode,
        currency,
      }),
    });
    if (!recipientRes.ok) {
      const detail = await recipientRes.text().catch(() => '');
      throw new Error(
        `Paystack recipient create failed (${recipientRes.status}): ${detail}`,
      );
    }
    const recipientJson = (await recipientRes.json()) as {
      status: boolean;
      data?: { recipient_code?: string };
    };
    const recipientCode = recipientJson.data?.recipient_code;
    if (recipientJson.status !== true || !recipientCode) {
      throw new Error('Paystack did not return a transfer recipient');
    }

    // 2) Initiate the transfer. The idempotency key doubles as the transfer
    //    reference (sanitized to Paystack's allowed charset) so a retry of the
    //    same payout is rejected as a duplicate rather than paying twice.
    const reference = `ob_payout_${params.idempotencyKey}`.replace(
      /[^a-zA-Z0-9._=-]/g,
      '_',
    );
    const transferRes = await fetch(`${PAYSTACK_API}/transfer`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey!}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        source: 'balance',
        amount: Math.round(quote.amountMinor),
        recipient: recipientCode,
        currency,
        reason: 'Overlay Picks tipster payout',
        reference,
      }),
    });
    if (!transferRes.ok) {
      const detail = await transferRes.text().catch(() => '');
      throw new Error(
        `Paystack transfer failed (${transferRes.status}): ${detail}`,
      );
    }
    const transferJson = (await transferRes.json()) as {
      status: boolean;
      message?: string;
      data?: { transfer_code?: string; status?: string };
    };
    const data = transferJson.data;
    if (transferJson.status !== true || !data?.transfer_code) {
      throw new Error(
        `Paystack transfer was not accepted: ${transferJson.message ?? 'unknown error'}`,
      );
    }
    // With OTP confirmation still enabled the transfer stalls at status 'otp' and
    // needs a manual finalize we don't automate — surface the operator fix.
    if (data.status === 'otp') {
      throw new Error(
        'Paystack returned transfer status "otp": disable "Confirm transfers ' +
          'with OTP" in Settings → Preferences → Transfers to allow automated payouts.',
      );
    }
    return { reference: data.transfer_code, amountCents: params.amountCents };
  }
}
