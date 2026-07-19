// Pure mapping/grading for The Odds API v4 responses. No framework deps, so it
// is unit-testable in isolation (Node native TS type-stripping). The provider
// class delegates all response shaping here.
import type {
  EventOutcome,
  EventResult,
  MarketOdds,
  ProviderEvent,
} from './sports-provider.interface';
import { gradeMarket, spreadKey, totalKey } from '@overlay/shared';

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
  /** Handicap (spreads) or total (totals) line; absent for h2h. */
  point?: number;
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
 * bookmakers, for every supported market:
 *   - h2h    → '1X2' (3-way, with Draw) or 'moneyline' (2-way)
 *   - spreads→ 'spreads', keyed '<home|away> <signed line>'
 *   - totals → 'totals', keyed '<over|under> <line>'
 * Distinct lines are distinct selections, so a pick matches its exact line.
 */
export function mapOdds(raw: OddsApiEventOdds): MarketOdds[] {
  const h2h: Record<string, number> = {};
  const spreads: Record<string, number> = {};
  const totals: Record<string, number> = {};
  let hasDraw = false;

  const better = (bag: Record<string, number>, key: string, price: number) => {
    if (bag[key] === undefined || price > bag[key]) bag[key] = price;
  };

  for (const bm of raw.bookmakers ?? []) {
    for (const mk of bm.markets ?? []) {
      if (mk.key === 'h2h') {
        for (const o of mk.outcomes) {
          const sel = selectionForOutcome(o.name, raw.home_team, raw.away_team);
          if (!sel) continue;
          if (sel === 'draw') hasDraw = true;
          better(h2h, sel, o.price);
        }
      } else if (mk.key === 'spreads') {
        for (const o of mk.outcomes) {
          if (o.point === undefined) continue;
          const sel = selectionForOutcome(o.name, raw.home_team, raw.away_team);
          if (sel !== 'home' && sel !== 'away') continue;
          better(spreads, spreadKey(sel, o.point), o.price);
        }
      } else if (mk.key === 'totals') {
        for (const o of mk.outcomes) {
          if (o.point === undefined) continue;
          const name = o.name.toLowerCase();
          if (name !== 'over' && name !== 'under') continue;
          better(totals, totalKey(name, o.point), o.price);
        }
      }
    }
  }

  const out: MarketOdds[] = [];
  if (Object.keys(h2h).length > 0) {
    out.push({ market: hasDraw ? '1X2' : 'moneyline', prices: h2h });
  }
  if (Object.keys(spreads).length > 0) {
    out.push({ market: 'spreads', prices: spreads });
  }
  if (Object.keys(totals).length > 0) {
    out.push({ market: 'totals', prices: totals });
  }
  return out;
}

/** Extract the current home/away score from a score event, or null if absent. */
export function scoresOf(
  raw: OddsApiScoreEvent,
): { home: number; away: number } | null {
  if (!raw.scores) return null;
  const scoreOf = (team: string): number | null => {
    const s = raw.scores!.find((x) => x.name === team);
    return s ? Number(s.score) : null;
  };
  const home = scoreOf(raw.home_team);
  const away = scoreOf(raw.away_team);
  if (home === null || away === null || Number.isNaN(home) || Number.isNaN(away)) {
    return null;
  }
  return { home, away };
}

/** Grade a selection from final scores (delegates to the shared grader). */
export function gradeFromScores(
  raw: OddsApiScoreEvent,
  market: string,
  selection: string,
): EventOutcome {
  if (!raw.completed || !raw.scores) return 'void';

  const scoreOf = (team: string): number | null => {
    const s = raw.scores!.find((x) => x.name === team);
    return s ? Number(s.score) : null;
  };
  const home = scoreOf(raw.home_team);
  const away = scoreOf(raw.away_team);
  if (home === null || away === null || Number.isNaN(home) || Number.isNaN(away)) {
    return 'void';
  }
  return gradeMarket(market, selection, home, away);
}

/** Build an EventResult (with grade closure) from a score event. */
export function toEventResult(raw: OddsApiScoreEvent): EventResult {
  return {
    vendorEventId: raw.id,
    raw: raw as unknown as Record<string, unknown>,
    grade: (market, selection) => gradeFromScores(raw, market, selection),
  };
}
