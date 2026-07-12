// Pure mapping/grading for The Odds API v4 responses. No framework deps, so it
// is unit-testable in isolation (Node native TS type-stripping). The provider
// class delegates all response shaping here.
import type {
  EventOutcome,
  EventResult,
  MarketOdds,
  ProviderEvent,
} from './sports-provider.interface';

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  home_team: string;
  away_team: string;
  commence_time: string;
}

export interface OddsApiOutcome {
  name: string;
  price: number;
}
export interface OddsApiMarket {
  key: string; // 'h2h' | 'spreads' | 'totals'
  outcomes: OddsApiOutcome[];
}
export interface OddsApiBookmaker {
  key: string;
  markets: OddsApiMarket[];
}
export interface OddsApiEventOdds extends OddsApiEvent {
  bookmakers: OddsApiBookmaker[];
}

export interface OddsApiScore {
  name: string;
  score: string;
}
export interface OddsApiScoreEvent {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: OddsApiScore[] | null;
}

export function mapEvents(raw: OddsApiEvent[]): ProviderEvent[] {
  return raw.map((e) => ({
    vendorEventId: e.id,
    sport: e.sport_key,
    league: e.sport_title,
    home: e.home_team,
    away: e.away_team,
    startTime: new Date(e.commence_time),
  }));
}

/** Map an h2h outcome name to our canonical selection. */
export function selectionForOutcome(
  outcomeName: string,
  home: string,
  away: string,
): 'home' | 'draw' | 'away' | null {
  if (outcomeName === home) return 'home';
  if (outcomeName === away) return 'away';
  if (outcomeName.toLowerCase() === 'draw') return 'draw';
  return null;
}

/**
 * Aggregate the best (highest) decimal price per selection across all
 * bookmakers for the h2h market. 3-way (with Draw) → '1X2', else 'moneyline'.
 */
export function mapOdds(raw: OddsApiEventOdds): MarketOdds[] {
  const best: Record<string, number> = {};
  let hasDraw = false;

  for (const bm of raw.bookmakers ?? []) {
    const h2h = bm.markets.find((m) => m.key === 'h2h');
    if (!h2h) continue;
    for (const o of h2h.outcomes) {
      const sel = selectionForOutcome(o.name, raw.home_team, raw.away_team);
      if (!sel) continue;
      if (sel === 'draw') hasDraw = true;
      if (best[sel] === undefined || o.price > best[sel]) best[sel] = o.price;
    }
  }

  if (Object.keys(best).length === 0) return [];
  return [{ market: hasDraw ? '1X2' : 'moneyline', prices: best }];
}

/** Grade a selection from final scores. */
export function gradeFromScores(
  raw: OddsApiScoreEvent,
  market: string,
  selection: string,
): EventOutcome {
  if (!raw.completed || !raw.scores) return 'void';
  if (market !== '1X2' && market !== 'moneyline') return 'void';

  const scoreOf = (team: string): number | null => {
    const s = raw.scores!.find((x) => x.name === team);
    return s ? Number(s.score) : null;
  };
  const home = scoreOf(raw.home_team);
  const away = scoreOf(raw.away_team);
  if (home === null || away === null || Number.isNaN(home) || Number.isNaN(away)) {
    return 'void';
  }

  const winner: 'home' | 'draw' | 'away' =
    home > away ? 'home' : away > home ? 'away' : 'draw';

  // Moneyline is 2-way: a draw voids the bet (push).
  if (market === 'moneyline' && winner === 'draw') return 'void';
  return selection === winner ? 'won' : 'lost';
}

/** Build an EventResult (with grade closure) from a score event. */
export function toEventResult(raw: OddsApiScoreEvent): EventResult {
  return {
    vendorEventId: raw.id,
    raw: raw as unknown as Record<string, unknown>,
    grade: (market, selection) => gradeFromScores(raw, market, selection),
  };
}
