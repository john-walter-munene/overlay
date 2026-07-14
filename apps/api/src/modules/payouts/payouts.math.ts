// Pure payout math. No framework deps → unit-testable. Money is handled in
// integer cents throughout to avoid floating-point drift.

export interface PayoutBreakdown {
  grossCents: number;
  feeCents: number;
  netCents: number;
}

/**
 * Compute a tipster's monthly payout.
 *   gross = activeSubscribers * priceCents
 *   fee   = round(gross * feeRate)   (platform take)
 *   net   = gross - fee
 * feeRate is clamped to [0, 1]. Fee rounds to the nearest cent.
 */
export function computePayout(
  activeSubscribers: number,
  priceCents: number,
  feeRate: number,
): PayoutBreakdown {
  const subs = Math.max(0, Math.floor(activeSubscribers));
  const price = Math.max(0, Math.floor(priceCents));
  const rate = Math.min(1, Math.max(0, feeRate));

  const grossCents = subs * price;
  const feeCents = Math.round(grossCents * rate);
  const netCents = grossCents - feeCents;
  return { grossCents, feeCents, netCents };
}

/** A single historical payout row surfaced in the earnings UI. */
export interface PayoutRecord {
  amountCents: number;
  status: string;
}

/** Earnings overview for a tipster: projected month + historical totals. */
export interface EarningsSummary {
  activeSubscribers: number;
  subscriptionPriceCents: number;
  feeRate: number;
  /** Projected earnings for the current active subscribers at the current price. */
  projected: PayoutBreakdown;
  /** Net cents already paid out to the tipster (status === 'paid'). */
  paidCents: number;
  /** Net cents awaiting transfer (status === 'pending'). */
  pendingCents: number;
}

/**
 * Summarize a tipster's earnings from their current active subscribers, the
 * platform fee rate and their payout history. The projected breakdown mirrors
 * {@link computePayout} so the earnings shown always reflect the active
 * subscriber count and fee rate. Historical amounts are already net of fees.
 */
export function summarizeEarnings(
  activeSubscribers: number,
  priceCents: number,
  feeRate: number,
  payouts: readonly PayoutRecord[] = [],
): EarningsSummary {
  const projected = computePayout(activeSubscribers, priceCents, feeRate);
  const rate = Math.min(1, Math.max(0, feeRate));

  let paidCents = 0;
  let pendingCents = 0;
  for (const p of payouts) {
    const amount = Math.max(0, Math.floor(p.amountCents));
    if (p.status === 'paid') paidCents += amount;
    else if (p.status === 'pending') pendingCents += amount;
  }

  return {
    activeSubscribers: Math.max(0, Math.floor(activeSubscribers)),
    subscriptionPriceCents: Math.max(0, Math.floor(priceCents)),
    feeRate: rate,
    projected,
    paidCents,
    pendingCents,
  };
}
