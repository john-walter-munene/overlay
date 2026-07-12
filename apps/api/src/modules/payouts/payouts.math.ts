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
