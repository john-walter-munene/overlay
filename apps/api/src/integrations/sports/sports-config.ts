/**
 * Sports-data provider configuration (Phase 2).
 *
 * Pure parsing/validation of the env knobs that shape vendor requests, so the
 * quota-sensitive inputs (regions × markets, score window) are centralized,
 * clamped and unit-testable rather than scattered as inline strings. Defaults
 * preserve the historical behavior (single EU region, featured markets, 3-day
 * result window).
 */

/** Bookmaker regions The Odds API accepts. More regions ⇒ more credits. */
export const KNOWN_REGIONS = ['us', 'us2', 'uk', 'au', 'eu'] as const;

/**
 * Featured market keys safe for background odds refresh. Restricted on purpose:
 * props/period/alternate markets are on-demand only (event-detail), so they can
 * never inflate the recurring `regions × markets` credit cost.
 */
export const FEATURED_ODDS_MARKETS = ['h2h', 'spreads', 'totals'] as const;

/**
 * Extra **gradeable** markets fetched from the per-event odds endpoint
 * (`/events/{id}/odds`) — settleable from the final score, so tipsters get live
 * prices + closing odds + CLV on them. Restricted to the keys the mapper can
 * encode unambiguously. Off by default (empty) since the per-event call costs
 * additional credits; enable on a paid tier via SPORTS_EVENT_MARKETS.
 */
export const EVENT_ODDS_MARKETS = ['btts', 'draw_no_bet', 'team_totals'] as const;

export interface SportsProviderConfig {
  /** Comma-joined region list for odds requests (e.g. "eu" or "eu,us"). */
  regions: string;
  /** Comma-joined featured market keys for odds requests. */
  markets: string;
  /**
   * Comma-joined extra gradeable markets fetched per-event (empty = off).
   * Each adds a per-event odds call (credits = markets × regions).
   */
  eventMarkets: string;
  /** Completed-result window in days (1–3); larger costs 2 credits vs 1. */
  scoresDaysFrom: number;
  /** How long a score stays "fresh" before the UI marks it stale (ms). */
  scoreStaleMs: number;
}

export const DEFAULT_SPORTS_CONFIG: SportsProviderConfig = {
  regions: 'eu',
  markets: 'h2h,spreads,totals',
  eventMarkets: '',
  scoresDaysFrom: 3,
  scoreStaleMs: 120_000,
};

function parseList<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: string,
): string {
  if (!raw) return fallback;
  const set = new Set(allowed as readonly string[]);
  const picked = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => set.has(s));
  // De-dupe while preserving order.
  const seen = new Set<string>();
  const out = picked.filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
  return out.length > 0 ? out.join(',') : fallback;
}

function parseIntEnv(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/**
 * Parse + validate the sports provider config from an env bag. Unknown regions
 * or markets are dropped; empty results fall back to the safe defaults.
 */
export function parseSportsConfig(
  env: Record<string, string | undefined> = process.env,
): SportsProviderConfig {
  return {
    regions: parseList(env.SPORTS_ODDS_REGIONS, KNOWN_REGIONS, DEFAULT_SPORTS_CONFIG.regions),
    markets: parseList(
      env.SPORTS_FEATURED_MARKETS,
      FEATURED_ODDS_MARKETS,
      DEFAULT_SPORTS_CONFIG.markets,
    ),
    eventMarkets: parseList(env.SPORTS_EVENT_MARKETS, EVENT_ODDS_MARKETS, ''),
    scoresDaysFrom: parseIntEnv(env.SPORTS_SCORES_DAYS_FROM, DEFAULT_SPORTS_CONFIG.scoresDaysFrom, 1, 3),
    scoreStaleMs: parseIntEnv(
      env.SPORTS_SCORE_STALE_MS,
      DEFAULT_SPORTS_CONFIG.scoreStaleMs,
      1_000,
      3_600_000,
    ),
  };
}
