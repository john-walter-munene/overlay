// Pure subscription-management helpers (OB-013).
//
// The subscriptions management UI lists a subscriber's active/canceled
// subscriptions with their status and next billing (current period end) date,
// and offers cancel/resume through the Stripe billing portal. These
// dependency-free helpers shape a raw Subscription record into display fields
// and decide which billing-portal action applies, so the same rules can be
// unit-tested and reused by the React page. They mirror the SubscriptionStatus
// enum in prisma/schema.prisma.

/** Lifecycle states a subscription can be in (mirrors the Prisma enum). */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

/** Normalized subscription lifecycle event types from a provider webhook. */
export type SubscriptionEventType = 'activated' | 'canceled' | 'past_due';

/** A subscription record as returned by GET /api/subscriptions/me. */
export interface SubscriptionRecord {
  id: string;
  tipsterId: string;
  status: SubscriptionStatus;
  /** ISO timestamp of the current period end, or null when unknown. */
  currentPeriodEnd: string | null;
}

/** Display-ready view of a subscription for the management UI. */
export interface SubscriptionView {
  id: string;
  tipsterId: string;
  status: SubscriptionStatus;
  /** Human-readable status label, e.g. "Active". */
  statusLabel: string;
  /** Whether the subscription is currently active (grants entitlement). */
  isActive: boolean;
  /** Label describing the billing-portal action, e.g. "Cancel" or "Resume". */
  actionLabel: string;
  /** Full sentence describing the next billing/period-end date, or null. */
  periodEndLabel: string | null;
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
};

/**
 * Map a normalized webhook event type to the resulting subscription status.
 * Kept pure so both the API's webhook handler and tests share one source of
 * truth (a canceled event must flip an active subscription to "canceled").
 */
export function subscriptionStatusFromEvent(
  type: SubscriptionEventType,
): SubscriptionStatus {
  switch (type) {
    case 'activated':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    default:
      return 'canceled';
  }
}

/** Human-readable label for a subscription status. */
export function subscriptionStatusLabel(status: SubscriptionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Decide whether a subscription currently grants access (entitlement), pure so
 * the API gate and tests share one rule. Handles billing edge cases:
 *   - `active`            → entitled.
 *   - `past_due`          → grace access until `currentPeriodEnd` (retry window).
 *   - `canceled`          → entitled until `currentPeriodEnd` (cancel-at-period-end);
 *                           a hard cancel/refund sets the period end in the past → not entitled.
 * A missing/undefined `currentPeriodEnd` means no grace window.
 */
export function isSubscriptionEntitled(
  status: SubscriptionStatus,
  currentPeriodEnd: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status === 'active') return true;
  if (!currentPeriodEnd) return false;
  const end =
    currentPeriodEnd instanceof Date
      ? currentPeriodEnd
      : new Date(currentPeriodEnd);
  if (Number.isNaN(end.getTime())) return false;
  // past_due (grace) and cancel-at-period-end both keep access until the period ends.
  return end.getTime() > now.getTime();
}

/**
 * Whole hours remaining until `currentPeriodEnd` (negative if already past),
 * or null when there's no known period end. Pure so the portal expiry notice
 * and its tests share one calculation.
 */
export function hoursUntilPeriodEnd(
  currentPeriodEnd: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!currentPeriodEnd) return null;
  const end =
    currentPeriodEnd instanceof Date
      ? currentPeriodEnd
      : new Date(currentPeriodEnd);
  if (Number.isNaN(end.getTime())) return null;
  return Math.floor((end.getTime() - now.getTime()) / 3_600_000);
}

/**
 * Whether an in-app "expiring soon" notice should show for a subscription:
 * it still grants access now but its current period ends within `withinHours`
 * (default 36h). Covers pay-per-period rails and cancel-at-period-end. Pure.
 */
export function isSubscriptionExpiringSoon(
  status: SubscriptionStatus,
  currentPeriodEnd: Date | string | null | undefined,
  now: Date = new Date(),
  withinHours = 36,
): boolean {
  if (!isSubscriptionEntitled(status, currentPeriodEnd, now)) return false;
  const hrs = hoursUntilPeriodEnd(currentPeriodEnd, now);
  return hrs != null && hrs >= 0 && hrs <= withinHours;
}

/**
 * Format an ISO date string as a locale date (e.g. "Jan 1, 2026"). Returns null
 * when the input is missing or not a valid date, so callers can hide the field.
 */
export function formatBillingDate(
  iso: string | null | undefined,
  locale?: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Build the sentence shown under a subscription describing its billing period
 * end. Active/past-due subscriptions renew on that date; canceled ones retain
 * access until it. Returns null when there is no known period end.
 */
export function periodEndLabel(
  status: SubscriptionStatus,
  currentPeriodEnd: string | null | undefined,
  locale?: string,
): string | null {
  const date = formatBillingDate(currentPeriodEnd, locale);
  if (!date) return null;
  return status === 'canceled' ? `Access until ${date}` : `Renews on ${date}`;
}

/**
 * Shape a raw subscription record into the display view used by the management
 * UI. Canceled subscriptions can be resumed; others can be canceled — both go
 * through the Stripe billing portal.
 */
export function toSubscriptionView(
  sub: SubscriptionRecord,
  locale?: string,
): SubscriptionView {
  const isActive = sub.status === 'active';
  return {
    id: sub.id,
    tipsterId: sub.tipsterId,
    status: sub.status,
    statusLabel: subscriptionStatusLabel(sub.status),
    isActive,
    actionLabel: sub.status === 'canceled' ? 'Resume' : 'Cancel',
    periodEndLabel: periodEndLabel(sub.status, sub.currentPeriodEnd, locale),
  };
}

/**
 * Sort subscriptions for display: active first, then past_due, then canceled;
 * ties broken by soonest period end. Returns a new array (input untouched).
 */
export function sortSubscriptions<T extends SubscriptionRecord>(
  subs: readonly T[],
): T[] {
  const order: Record<SubscriptionStatus, number> = {
    active: 0,
    past_due: 1,
    canceled: 2,
  };
  return [...subs].sort((a, b) => {
    const byStatus = (order[a.status] ?? 3) - (order[b.status] ?? 3);
    if (byStatus !== 0) return byStatus;
    const aEnd = a.currentPeriodEnd ? Date.parse(a.currentPeriodEnd) : Infinity;
    const bEnd = b.currentPeriodEnd ? Date.parse(b.currentPeriodEnd) : Infinity;
    return aEnd - bEnd;
  });
}
