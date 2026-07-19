// Provider-agnostic sports-data contract. See docs/VENDOR-SPIKE.md.
// Concrete adapters (The Odds API, API-Football, Betfair, Mock) implement this,
// so the settlement/CLV pipeline never depends on a specific vendor.

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
}

export type EventOutcome = 'won' | 'lost' | 'void' | 'half_won' | 'half_lost';

export interface EventResult {
  vendorEventId: string;
  /** Provider-normalized final result, e.g. { winner: 'home' } or scores. */
  raw: Record<string, unknown>;
  /** Resolve a specific selection on a market to an outcome. */
  grade(market: string, selection: string): EventOutcome;
}

export interface SportsDataProvider {
  readonly name: string;

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
}
