/**
 * Market capability registry (Phase 1).
 *
 * The single source of truth for what a market can *do* in the product —
 * separate from how it grades. It exists so the richer provider data we can now
 * surface (player props, period/half markets, alternate lines, outrights) can be
 * **displayed** to bettors without ever silently becoming **pickable** or
 * **settleable**. A market only becomes pickable/settleable when it has an
 * explicit canonical mapping AND a grader in {@link gradeMarket}.
 *
 * Three capabilities, in increasing trust:
 *   - `displayable` — safe to show in discovery UIs (read-only).
 *   - `pickable`    — a tipster may lock a pick on it (server-validated).
 *   - `settleable`  — the settlement engine can grade it from a result.
 *
 * Invariant (enforced by tests): the set of `pickable` canonical markets is
 * exactly {@link SUPPORTED_MARKETS}. Adding a market to the grader without
 * registering it here — or vice versa — fails the drift guard.
 */

import {
  SUPPORTED_MARKETS,
  isSupportedMarket,
  type SupportedMarket,
} from './grading.ts';

/** What a market is allowed to do in the product, in increasing trust. */
export type MarketCapability = 'displayable' | 'pickable' | 'settleable';

/** High-level grouping used for dashboard organisation and safety rules. */
export type MarketGroup =
  | 'featured' // h2h/1X2, spreads, totals — first-class, carry aggregated odds
  | 'derived' // btts, dnb, double_chance, correct_score, … pickable, score-graded
  | 'player_prop' // player_points, player_pass_tds, … display-only for now
  | 'period' // quarter/half/period/innings markets — display-only for now
  | 'alternate' // alternate_spreads/totals — display-only for now
  | 'outright' // futures / outrights
  | 'exchange' // lay markets on betting exchanges
  | 'other'; // anything unrecognised — display-only

/** Full display+pick+settle capability set (a canonical, gradeable market). */
const FULL: readonly MarketCapability[] = [
  'displayable',
  'pickable',
  'settleable',
];
/** Read-only: safe to show, never pickable/settleable. */
const DISPLAY_ONLY: readonly MarketCapability[] = ['displayable'];

/** A canonical market the product supports for picks and settlement. */
export interface CanonicalMarketDef {
  /** Canonical key — also the pick `market` value and grading key. */
  key: SupportedMarket;
  /** Human label for UI. */
  label: string;
  /**
   * `featured` markets carry aggregated best-price odds from the odds mapper
   * (h2h/spreads/totals); `derived` markets are pickable + score-graded but do
   * not currently carry aggregated live odds.
   */
  group: 'featured' | 'derived';
  capabilities: readonly MarketCapability[];
}

/**
 * Canonical, product-supported markets. Every entry is displayable + pickable +
 * settleable. Keyed by the canonical market string used across the pick DTO,
 * the pick form and {@link gradeMarket}.
 */
export const CANONICAL_MARKETS: Record<SupportedMarket, CanonicalMarketDef> = {
  '1X2': { key: '1X2', label: '1X2 (3-way)', group: 'featured', capabilities: FULL },
  moneyline: { key: 'moneyline', label: 'Moneyline', group: 'featured', capabilities: FULL },
  spreads: { key: 'spreads', label: 'Handicap (spreads)', group: 'featured', capabilities: FULL },
  totals: { key: 'totals', label: 'Totals (over/under)', group: 'featured', capabilities: FULL },
  dnb: { key: 'dnb', label: 'Draw no bet', group: 'derived', capabilities: FULL },
  double_chance: { key: 'double_chance', label: 'Double chance', group: 'derived', capabilities: FULL },
  btts: { key: 'btts', label: 'Both teams to score', group: 'derived', capabilities: FULL },
  odd_even: { key: 'odd_even', label: 'Odd/even', group: 'derived', capabilities: FULL },
  correct_score: { key: 'correct_score', label: 'Correct score', group: 'derived', capabilities: FULL },
  team_totals: { key: 'team_totals', label: 'Team totals', group: 'derived', capabilities: FULL },
};

/** Canonical markets that carry aggregated best-price odds (featured group). */
export const FEATURED_MARKETS = Object.values(CANONICAL_MARKETS)
  .filter((m) => m.group === 'featured')
  .map((m) => m.key);

/** The set of canonical markets a tipster may lock a pick on. */
export function pickableCanonicalMarkets(): SupportedMarket[] {
  return (Object.values(CANONICAL_MARKETS) as CanonicalMarketDef[])
    .filter((m) => m.capabilities.includes('pickable'))
    .map((m) => m.key);
}

/** Whether a canonical market key may be picked (server-side pick gate). */
export function isPickableMarket(market: string): market is SupportedMarket {
  return isSupportedMarket(market) && CANONICAL_MARKETS[market].capabilities.includes('pickable');
}

/** Whether a canonical market key can be graded by the settlement engine. */
export function isSettleableMarket(market: string): market is SupportedMarket {
  return isSupportedMarket(market) && CANONICAL_MARKETS[market].capabilities.includes('settleable');
}

/**
 * Classification of a raw provider market key (e.g. The Odds API `h2h`,
 * `player_pass_tds`, `spreads_q1`, `alternate_totals`, `outrights`).
 */
export interface ProviderMarketClass {
  /** The raw provider market key, unchanged. */
  providerKey: string;
  group: MarketGroup;
  /**
   * Canonical pickable/settleable markets this provider key can yield. Empty
   * means the market is display-only (props/period/alternate/outright/unknown).
   * `h2h` can yield either `1X2` (with a draw) or `moneyline` (2-way); the odds
   * mapper decides which from the outcomes.
   */
  canonicalMarkets: readonly SupportedMarket[];
  capabilities: readonly MarketCapability[];
  /** Human label for discovery UIs. */
  label: string;
}

/**
 * Featured/derived provider market keys we can map to canonical, gradeable
 * markets. Everything not listed here is display-only unless it matches a
 * prop/period/alternate/outright pattern below.
 */
const FEATURED_PROVIDER_MARKETS: Record<
  string,
  { group: 'featured' | 'derived'; canonical: readonly SupportedMarket[]; label: string }
> = {
  h2h: { group: 'featured', canonical: ['1X2', 'moneyline'], label: 'Head to head' },
  h2h_3_way: { group: 'featured', canonical: ['1X2'], label: 'Head to head (3-way)' },
  spreads: { group: 'featured', canonical: ['spreads'], label: 'Handicap (spreads)' },
  totals: { group: 'featured', canonical: ['totals'], label: 'Totals (over/under)' },
  btts: { group: 'derived', canonical: ['btts'], label: 'Both teams to score' },
  double_chance: { group: 'derived', canonical: ['double_chance'], label: 'Double chance' },
  draw_no_bet: { group: 'derived', canonical: ['dnb'], label: 'Draw no bet' },
  team_totals: { group: 'derived', canonical: ['team_totals'], label: 'Team totals' },
};

/** Period/half/quarter/innings tokens that mark a market as period-scoped. */
const PERIOD_PATTERN =
  /(?:^|_)(?:q[1-4]|h[12]|p[1-3]|[1-4](?:st|nd|rd|th)|1st_1_innings|innings|periods?|quarters?|halves|sets?)(?:$|_)/i;

/**
 * Classify a raw provider market key into its group + canonical capability.
 * Pure and total: every input returns a class; unknown keys are display-only.
 */
export function classifyProviderMarket(providerKey: string): ProviderMarketClass {
  const key = providerKey.trim().toLowerCase();

  // Exchange lay markets (e.g. h2h_lay, outrights_lay) — display-only.
  if (key.endsWith('_lay')) {
    return { providerKey, group: 'exchange', canonicalMarkets: [], capabilities: DISPLAY_ONLY, label: 'Exchange lay' };
  }

  // Outrights / futures — display-only.
  if (key === 'outrights' || key.startsWith('outrights')) {
    return { providerKey, group: 'outright', canonicalMarkets: [], capabilities: DISPLAY_ONLY, label: 'Outright / futures' };
  }

  // Player props — display-only until player-stat results + grading exist.
  if (key.startsWith('player_')) {
    return { providerKey, group: 'player_prop', canonicalMarkets: [], capabilities: DISPLAY_ONLY, label: humanizeMarketKey(key) };
  }

  // Alternate lines — display-only (grading of alt lines is a later slice).
  if (key.startsWith('alternate_')) {
    return { providerKey, group: 'alternate', canonicalMarkets: [], capabilities: DISPLAY_ONLY, label: humanizeMarketKey(key) };
  }

  // Featured/derived exact keys (full-match) map to canonical, gradeable markets.
  const featured = FEATURED_PROVIDER_MARKETS[key];
  if (featured) {
    return {
      providerKey,
      group: featured.group,
      canonicalMarkets: featured.canonical,
      capabilities: FULL,
      label: featured.label,
    };
  }

  // Period/half/quarter/innings variants of otherwise-featured markets — the
  // running-score grader only settles full-time, so these are display-only.
  if (PERIOD_PATTERN.test(key)) {
    return { providerKey, group: 'period', canonicalMarkets: [], capabilities: DISPLAY_ONLY, label: humanizeMarketKey(key) };
  }

  // Unknown — safe to show, never pickable/settleable.
  return { providerKey, group: 'other', canonicalMarkets: [], capabilities: DISPLAY_ONLY, label: humanizeMarketKey(key) };
}

/** Whether a provider market key maps to a pickable canonical market. */
export function isPickableProviderMarket(providerKey: string): boolean {
  return classifyProviderMarket(providerKey).canonicalMarkets.length > 0;
}

/** Turn a snake_case provider market key into a readable label. */
export function humanizeMarketKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}
