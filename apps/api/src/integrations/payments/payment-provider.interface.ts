// Provider-agnostic payments contract. Subscriptions and payouts depend on
// this, never on Stripe directly — so a Mock provider can run the full flow
// locally without keys, and providers (Stripe cards + wallets, crypto
// stablecoins, mobile money) are swappable and can coexist.

/**
 * A concrete payment method a subscriber picks at checkout. Methods are NOT
 * providers — several methods can settle through one provider (e.g. card,
 * Apple Pay and Google Pay all settle through Stripe). Each provider declares
 * which methods it supports via {@link ProviderCapabilities.methods}.
 */
export type PaymentMethodId =
  | 'card'
  | 'apple_pay'
  | 'google_pay'
  | 'usdc'
  | 'usdt'
  | 'mpesa'
  | 'mtn_momo'
  | 'airtel_money';

/** What a provider can do — used to route methods and gate UI/flows. */
export interface ProviderCapabilities {
  /** Can bill on a recurring schedule (card-on-file). Crypto/mobile money
   * are typically pay-per-period and set this false. */
  recurring: boolean;
  /** Offers a hosted billing/management portal (Stripe). */
  billingPortal: boolean;
  /** Can pay tipsters out through this rail. */
  payouts: boolean;
  /** Payment methods this provider settles. */
  methods: readonly PaymentMethodId[];
}

export interface CheckoutSession {
  /** URL to redirect the subscriber to (mock returns a synthetic URL). */
  url: string;
  /** Provider-side subscription/session id, when known. */
  reference?: string;
}

/** A hosted billing-portal session the subscriber is redirected to. */
export interface BillingPortalSession {
  /** URL of the provider's billing portal (mock returns a synthetic URL). */
  url: string;
}

export interface TransferResult {
  reference: string;
  amountCents: number;
}

/**
 * Where a tipster is paid out, tagged by rail. Each provider accepts only the
 * destination kind(s) it settles (Stripe → connected account, crypto → wallet,
 * mobile money → phone + network).
 */
export type PayoutDestination =
  | { kind: 'stripe'; accountId: string }
  | { kind: 'crypto'; address: string; chain: string }
  | { kind: 'mobile_money'; phone: string; network: string };

/** A normalized subscription lifecycle event from a provider webhook. */
export interface SubscriptionEvent {
  type: 'activated' | 'canceled' | 'past_due';
  userId: string;
  tipsterId: string;
  /** Name of the provider that produced this event. */
  provider: string;
  providerSubscriptionId: string;
  currentPeriodEnd?: Date;
}

export interface PaymentProvider {
  readonly name: string;

  /** What this provider supports (methods, recurring, payouts, portal). */
  readonly capabilities: ProviderCapabilities;

  /** Start a subscription checkout for a user subscribing to a tipster. */
  createSubscriptionCheckout(params: {
    userId: string;
    tipsterId: string;
    /** Base price in USD cents (the stored price). */
    priceCents: number;
    /** Method the subscriber chose, when the provider settles more than one. */
    method?: PaymentMethodId;
    /** Subscriber email — required by some providers (e.g. Flutterwave). */
    customerEmail?: string;
    /** Local charge currency (ISO 4217) when FX conversion applies. */
    chargeCurrency?: string;
    /** Charge amount in `chargeCurrency` minor units, pre-converted from USD. */
    chargeAmountMinor?: number;
  }): Promise<CheckoutSession>;

  /**
   * Verify + normalize a raw webhook payload into a SubscriptionEvent. Given the
   * raw request body and its headers (lowercased) so each provider can check its
   * own signature header (Stripe `stripe-signature`, Coinbase Commerce
   * `x-cc-webhook-signature`, Flutterwave `verif-hash`).
   */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): SubscriptionEvent | null;

  /**
   * Create a billing-portal session where the subscriber can manage, cancel or
   * resume their subscriptions (Stripe billing portal). `returnUrl` is where
   * the provider sends the subscriber back to after they finish.
   */
  createBillingPortalSession(params: {
    userId: string;
    returnUrl: string;
  }): Promise<BillingPortalSession>;

  /** Pay a tipster out on this provider's rail. */
  transferToTipster(params: {
    destination: PayoutDestination;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TransferResult>;
}
