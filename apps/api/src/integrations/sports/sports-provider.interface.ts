// Provider-agnostic sports-data contract. See docs/VENDOR-SPIKE.md.
// Concrete adapters (The Odds API, API-Football, Betfair, Mock) implement this,
// so the settlement/CLV pipeline never depends on a specific vendor.
import type { MarketGroup } from '@overlay/shared';

export interface ProviderEvent {
  vendorEventId: string;
  sport: string;
  league?: string;
  home: string;
  away: string;
  startTime: Date;
}

export interface MarketOdds {
  /** e.g. '1X2' | 'moneyline' | 'spread' | 'totals' */
  market: string;
  /** selection -> decimal odds (best/aggregated across books) */
  prices: Record<string, number>;
  /** Individual bookmaker lines, retained for comparison and freshness UI. */
  offers?: OddsOffer[];
}

export interface OddsOffer {
  bookmaker: string;
  bookmakerTitle?: string;
  selection: string;
  price: number;
  point?: number;
  updatedAt?: string;
}

export type EventOutcome = 'won' | 'lost' | 'void' | 'half_won' | 'half_lost';

export interface EventResult {
  vendorEventId: string;
  /** Provider-normalized final result, e.g. { winner: 'home' } or scores. */
  raw: Record<string, unknown>;
  /** Resolve a specific selection on a market to an outcome. */
  grade(market: string, selection: string): EventOutcome;
}

/**
 * Normalized score state for one event — live or final. Carries the provider's
 * own last-update timestamp so freshness can be surfaced (a stale in-play score
 * must never look like a current one) and settlement/gating can reason about
 * how recent the score is. `score` is null until the provider observes one.
 */
export interface ScoreState {
  vendorEventId: string;
  /** Whether the provider considers the game finished. */
  completed: boolean;
  /** Latest known home/away score, or null if none has been observed yet. */
  score: { home: number; away: number } | null;
  /** Provider's last score-update timestamp (ISO 8601), or null. */
  lastUpdate: string | null;
}

export interface ProviderSport {
  key: string;
  group: string;
  title: string;
  description?: string;
  active: boolean;
  hasOutrights: boolean;
}

/**
 * One market available on an event, classified by the shared market registry.
 * Surfaced by the on-demand event-detail/inventory endpoint so bettors can see
 * everything on offer (props, period, alternate lines) while `pickable` tells
 * the product which markets a tipster may actually lock a pick on.
 */
export interface ProviderMarketInfo {
  /** Raw provider market key, e.g. 'h2h', 'player_points', 'spreads_q1'. */
  key: string;
  /** Registry group (featured/derived/player_prop/period/alternate/…). */
  group: MarketGroup;
  /** Human label for discovery UIs. */
  label: string;
  /** Whether this market maps to a pickable+settleable canonical market. */
  pickable: boolean;
  /** Canonical markets this provider key can yield (empty = display-only). */
  canonicalMarkets: string[];
  /** Bookmaker keys currently offering this market. */
  bookmakers: string[];
  /** Most recent bookmaker update for this market (ISO 8601), or null. */
  lastUpdate: string | null;
}

export interface SportsDataProvider {
  readonly name: string;

  /** In-season sport catalog for provider-aware discovery and ingestion setup. */
  getSports?(): Promise<ProviderSport[]>;

  /** Upcoming fixtures for ingestion. */
  getUpcomingEvents(sport: string): Promise<ProviderEvent[]>;

  /** Current odds for an event (for capturing odds-at-pick / closing snapshot). */
  getOdds(vendorEventId: string): Promise<MarketOdds[]>;

  /** Final result for a finished event, or null if not yet settled. */
  getResult(vendorEventId: string): Promise<EventResult | null>;

  /**
   * Current in-play score for a live event, or null if unknown / not started
   * (OB-039). Used to gate out live picks on markets the running game has
   * already decided. Optional: providers that can't surface running scores omit
   * it, and the timing gate simply skips the "already decided" check.
   */
  getLiveScore?(
    vendorEventId: string,
  ): Promise<{ home: number; away: number } | null>;

  /**
   * Available market inventory for a single event (featured + props + period +
   * alternate lines), classified for display. On-demand only — costs one vendor
   * credit — so it powers the event-detail surface, not background refresh.
   * Optional: providers without a per-event market listing omit it.
   */
  getMarketInventory?(vendorEventId: string): Promise<ProviderMarketInfo[]>;
}
