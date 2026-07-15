/**
 * Pure, framework-free logic for the subscriber "My feed" (OB-012).
 *
 * Kept decorator-free so it can be exercised directly by the unit-test runner
 * (`node --experimental-strip-types`). The Nest service composes these helpers
 * with Prisma queries.
 */

/** Minimal subscription shape the entitlement gate needs. */
export interface FeedSubscription {
  tipsterId: string;
  status: string;
}

/** One pick as it appears in a subscriber's aggregated feed. */
export interface FeedPick {
  id: string;
  tipsterId: string;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
  /** Optional tipster-authored context, or null. */
  note: string | null;
  status: string;
  clv: number | null;
  result: string | null;
  /** Lock time as epoch milliseconds — the newest-first sort key. */
  lockedAt: number;
  /** Settlement time as epoch milliseconds, or null while pending. */
  settledAt: number | null;
  event: {
    sport: string;
    home: string;
    away: string;
    startTime: number;
  } | null;
}

/** A Prisma pick row (with its event included) as returned by findMany. */
export interface PickRecord {
  id: string;
  tipsterId: string;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
  note: string | null;
  status: string;
  clv: number | null;
  result: string | null;
  lockedAt: Date;
  settledAt: Date | null;
  event: {
    sport: string;
    home: string;
    away: string;
    startTime: Date;
  } | null;
}

/** Map a Prisma pick (with event) to the wire {@link FeedPick} shape. */
export function toPickRow(p: PickRecord): FeedPick {
  return {
    id: p.id,
    tipsterId: p.tipsterId,
    market: p.market,
    selection: p.selection,
    oddsAtPick: p.oddsAtPick,
    stakeUnits: p.stakeUnits,
    note: p.note,
    status: p.status,
    clv: p.clv,
    result: p.result,
    lockedAt: p.lockedAt.getTime(),
    settledAt: p.settledAt ? p.settledAt.getTime() : null,
    event: p.event
      ? {
          sport: p.event.sport,
          home: p.event.home,
          away: p.event.away,
          startTime: p.event.startTime.getTime(),
        }
      : null,
  };
}

/**
 * Tipster ids the user is *currently entitled* to: only tipsters with an
 * `active` subscription. Canceled/past-due subscriptions confer no access.
 */
export function entitledTipsterIds(
  subscriptions: readonly FeedSubscription[],
): string[] {
  return [
    ...new Set(
      subscriptions
        .filter((s) => s.status === 'active')
        .map((s) => s.tipsterId),
    ),
  ];
}

/**
 * Build the subscriber "My feed": live/pending + settled picks aggregated from
 * every tipster the user is *actively* subscribed to, newest first.
 *
 * Entitlement gate: picks from tipsters without an active subscription are
 * dropped, so a lapsed or never-subscribed tipster's picks can never leak in.
 * Ordering is deterministic — newest `lockedAt` first, ties broken by id.
 */
export function buildSubscriberFeed<T extends FeedPick>(
  picks: readonly T[],
  subscriptions: readonly FeedSubscription[],
): T[] {
  const entitled = new Set(entitledTipsterIds(subscriptions));
  return picks
    .filter((p) => entitled.has(p.tipsterId))
    .sort((a, b) => b.lockedAt - a.lockedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
