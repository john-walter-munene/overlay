// Provider-agnostic payments contract. Subscriptions and payouts depend on
// this, never on Stripe directly — so a Mock provider can run the full flow
// locally without keys, and Stripe is swappable.

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

/** A normalized subscription lifecycle event from a provider webhook. */
export interface SubscriptionEvent {
  type: 'activated' | 'canceled' | 'past_due';
  userId: string;
  tipsterId: string;
  providerSubscriptionId: string;
  currentPeriodEnd?: Date;
}

export interface PaymentProvider {
  readonly name: string;

  /** Start a subscription checkout for a user subscribing to a tipster. */
  createSubscriptionCheckout(params: {
    userId: string;
    tipsterId: string;
    priceCents: number;
  }): Promise<CheckoutSession>;

  /** Verify + normalize a raw webhook payload into a SubscriptionEvent. */
  parseWebhook(rawBody: string, signature: string): SubscriptionEvent | null;

  /**
   * Create a billing-portal session where the subscriber can manage, cancel or
   * resume their subscriptions (Stripe billing portal). `returnUrl` is where
   * the provider sends the subscriber back to after they finish.
   */
  createBillingPortalSession(params: {
    userId: string;
    returnUrl: string;
  }): Promise<BillingPortalSession>;

  /** Pay a tipster out (Stripe Connect transfer). */
  transferToTipster(params: {
    tipsterAccountId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TransferResult>;
}
