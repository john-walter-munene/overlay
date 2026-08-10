// Pure Paystack webhook verification + event mapping. No Nest/SDK deps, so it's
// unit-testable under node's type-stripping test runner and reused by the
// PaystackPaymentProvider. Security-critical: the signature check here is what
// stops a forged webhook from granting entitlement.
//
// Paystack signs every webhook with the `x-paystack-signature` header — an
// HMAC-SHA512 of the raw request body keyed with the account's SECRET key
// (there is no separate webhook secret). See https://paystack.com/docs/payments/webhooks/

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  PayoutEvent,
  SubscriptionEvent,
} from './payment-provider.interface';

const PROVIDER = 'paystack';

/** Minimal shape of the Paystack webhook envelope + objects we consume. */
interface PaystackData {
  id?: number | string;
  reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  paid_at?: string;
  subscription_code?: string;
  transfer_code?: string;
  // Paystack returns metadata as an object, or "" (empty string) when none was
  // sent, so it's typed loosely and narrowed before use.
  metadata?: { userId?: string; tipsterId?: string } | string | null;
}

interface PaystackEvent {
  event?: string;
  data?: PaystackData;
}

/**
 * Verify a Paystack webhook signature without the SDK: the `x-paystack-signature`
 * header is the HMAC-SHA512 (hex) of the exact raw body keyed with the account
 * secret, compared in constant time.
 */
export function verifyPaystackSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(header, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Pull the user/tipster identity we stamped into the transaction metadata. */
function metaFromData(
  data: PaystackData,
): { userId: string; tipsterId: string } | null {
  const m = data.metadata;
  if (!m || typeof m !== 'object') return null;
  return m.userId && m.tipsterId
    ? { userId: m.userId, tipsterId: m.tipsterId }
    : null;
}

/** Map a verified Paystack event to our normalized SubscriptionEvent. */
export function mapPaystackEvent(event: PaystackEvent): SubscriptionEvent | null {
  switch (event.event) {
    case 'charge.success': {
      // The money-moving event. Identity travels in the transaction metadata we
      // set at checkout; a subscription charge also carries a subscription_code.
      const data = event.data ?? {};
      if (data.status !== 'success') return null;
      const meta = metaFromData(data);
      if (!meta) return null;
      return {
        type: 'activated',
        userId: meta.userId,
        tipsterId: meta.tipsterId,
        provider: PROVIDER,
        providerSubscriptionId: String(
          data.subscription_code ?? data.reference ?? data.id ?? '',
        ),
        // amountCents is intentionally omitted: Paystack settles in a local
        // currency (NGN/GHS/…), not USD cents, so the funds ledger falls back to
        // the tipster's stored USD subscription price (same as mobile money).
        reference: `paystack:charge:${data.reference ?? data.id ?? ''}`,
        occurredAt: data.paid_at ? new Date(data.paid_at) : undefined,
      };
    }
    default:
      // Subscription-lifecycle events (subscription.disable, invoice.*) don't
      // carry our metadata, so they can't be mapped back to a user/tipster here
      // and are ignored — pay-per-period access simply lapses at period end.
      return null;
  }
}

/**
 * Verify + parse a raw Paystack webhook into a normalized SubscriptionEvent, or
 * null if the secret is missing, the signature is invalid, or the event isn't
 * one we act on.
 */
export function parsePaystackWebhook(
  rawBody: string,
  headers: Record<string, string>,
  secret: string | undefined,
): SubscriptionEvent | null {
  if (!secret) return null;
  if (!verifyPaystackSignature(rawBody, headers['x-paystack-signature'], secret)) {
    return null;
  }
  try {
    return mapPaystackEvent(JSON.parse(rawBody) as PaystackEvent);
  } catch {
    return null;
  }
}

/** Map a verified Paystack transfer event to a normalized PayoutEvent. */
export function mapPaystackTransferEvent(
  event: PaystackEvent,
): PayoutEvent | null {
  const reference = String(event.data?.transfer_code ?? '');
  if (!reference) return null;
  switch (event.event) {
    case 'transfer.success':
      return { status: 'paid', reference, provider: PROVIDER };
    case 'transfer.failed':
    case 'transfer.reversed':
      return { status: 'failed', reference, provider: PROVIDER };
    default:
      return null;
  }
}

/**
 * Verify + parse a raw Paystack *transfer* webhook into a PayoutEvent, or null
 * if the secret is missing, the signature is invalid, or it isn't a terminal
 * transfer event. Paystack posts transfer events to the same URL as charges.
 */
export function parsePaystackTransferWebhook(
  rawBody: string,
  headers: Record<string, string>,
  secret: string | undefined,
): PayoutEvent | null {
  if (!secret) return null;
  if (!verifyPaystackSignature(rawBody, headers['x-paystack-signature'], secret)) {
    return null;
  }
  try {
    return mapPaystackTransferEvent(JSON.parse(rawBody) as PaystackEvent);
  } catch {
    return null;
  }
}
