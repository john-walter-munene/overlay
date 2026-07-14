/**
 * Pure payout-destination resolution (OB-06x).
 *
 * Maps a tipster's stored payout preference + details to the provider that
 * should pay them and a typed {@link PayoutDestination}. Kept free of Nest/
 * Prisma so the branching (and the "incomplete details → skip" rule) is
 * unit-tested in isolation. Returns null when no complete destination is set,
 * so the payout run leaves that tipster's payout pending rather than failing.
 */
import type { PayoutDestination } from '../../integrations/payments/payment-provider.interface';

/** The tipster fields consulted to resolve a payout target. */
export interface TipsterPayoutFields {
  payoutMethod: string | null;
  stripeAccountId: string | null;
  payoutWalletAddress: string | null;
  payoutWalletChain: string | null;
  payoutMobileNumber: string | null;
  payoutMobileNetwork: string | null;
}

export interface ResolvedPayout {
  /** Registry name of the provider that settles this payout. */
  provider: string;
  destination: PayoutDestination;
}

function nonEmpty(v: string | null): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Resolve where + how a tipster is paid out, or null if no complete
 * destination is configured. Falls back to Stripe when a legacy
 * `stripeAccountId` exists but no explicit `payoutMethod` was chosen.
 */
export function resolvePayoutTarget(
  t: TipsterPayoutFields,
): ResolvedPayout | null {
  const method =
    t.payoutMethod ?? (nonEmpty(t.stripeAccountId) ? 'stripe' : null);

  switch (method) {
    case 'stripe':
      return nonEmpty(t.stripeAccountId)
        ? {
            provider: 'stripe',
            destination: { kind: 'stripe', accountId: t.stripeAccountId },
          }
        : null;
    case 'crypto':
      return nonEmpty(t.payoutWalletAddress) && nonEmpty(t.payoutWalletChain)
        ? {
            provider: 'crypto',
            destination: {
              kind: 'crypto',
              address: t.payoutWalletAddress,
              chain: t.payoutWalletChain,
            },
          }
        : null;
    case 'mobile_money':
      return nonEmpty(t.payoutMobileNumber) && nonEmpty(t.payoutMobileNetwork)
        ? {
            provider: 'mobile_money',
            destination: {
              kind: 'mobile_money',
              phone: t.payoutMobileNumber,
              network: t.payoutMobileNetwork,
            },
          }
        : null;
    default:
      return null;
  }
}
