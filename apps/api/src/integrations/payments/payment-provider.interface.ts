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
 * mobile money → phone + network, Paystack → bank account).
 */
export type PayoutDestination =
  | { kind: 'stripe'; accountId: string }
  | { kind: 'crypto'; address: string; chain: string }
  | { kind: 'mobile_money'; phone: string; network: string }
  | {
      kind: 'paystack';
      /** Local bank account number (NUBAN for Nigeria). */
      accountNumber: string;
      /** Paystack bank code for the account's bank. */
      bankCode: string;
      /** Account holder name, as registered with the bank. */
      accountName: string;
    };

/** A normalized subscription lifecycle event from a provider webhook. */
export interface SubscriptionEvent {
  type: 'activated' | 'canceled' | 'past_due' | 'refunded';
  userId: string;
  tipsterId: string;
  /** Name of the provider that produced this event. */
  provider: string;
  providerSubscriptionId: string;
  currentPeriodEnd?: Date;
  /**
   * Collected amount in USD minor units for a money-moving event (`activated`
   * grants revenue; `refunded` reverses it). Omitted when the provider webhook
   * doesn't carry an amount — the funds ledger then falls back to the tipster's
   * stored subscription price.
   */
  amountCents?: number;
  /**
   * Unique provider-side reference (charge / session / invoice / event id) used
   * to record the payment in the funds ledger idempotently. Falls back to
   * {@link providerSubscriptionId} when absent.
   */
  reference?: string;
  /** When the payment occurred (drives the payout period). Defaults to now. */
  occurredAt?: Date;
}

/** A normalized payout/transfer lifecycle event from a provider webhook. */
export interface PayoutEvent {
  /** Terminal outcome of the transfer. */
  status: 'paid' | 'failed';
  /**
   * Provider transfer identifier stored on the Payout when the transfer was
   * initiated (Payout.stripeTransferId) — Paystack `transfer_code`, Flutterwave
   * transfer reference — used to correlate this event back to the payout row.
   */
  reference: string;
  /** Name of the provider that produced this event. */
  provider: string;
}

export interface PaymentProvider {
  readonly name: string;

  /** What this provider supports (methods, recurring, payouts, portal). */
  readonly capabilities: ProviderCapabilities;

  /**
   * Whether this provider can currently start a checkout — i.e. it has its keys
   * configured, or a dev fallback is available (non-production). Used to filter
   * the payment-method picker so it never offers a method whose provider isn't
   * usable. Optional; treated as available when not implemented.
   */
  isAvailable?(): boolean;

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

  /**
   * Verify + normalize a raw *transfer/payout* webhook into a PayoutEvent, or
   * null if it isn't a transfer event we act on. Providers settle payouts
   * asynchronously and post the final state to the **same** webhook URL as
   * charges, so this runs as a fallback when {@link parseWebhook} yields no
   * subscription event. Optional — only providers with async payouts implement it.
   */
  parseTransferWebhook?(
    rawBody: string,
    headers: Record<string, string>,
  ): PayoutEvent | null;
}
