// Pure mapping/grading for The Odds API v4 responses. No framework deps, so it
// is unit-testable in isolation (Node native TS type-stripping). The provider
// class delegates all response shaping here.
import type {
  EventOutcome,
  EventResult,
  MarketOdds,
  OddsOffer,
  ProviderEvent,
  ProviderMarketInfo,
  ScoreState,
} from './sports-provider.interface';
import { classifyProviderMarket, gradeMarket, spreadKey, totalKey } from '@overlay/shared';

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
  description?: string;
}
export interface OddsApiMarket {
  key: string; // 'h2h' | 'spreads' | 'totals'
  outcomes: OddsApiOutcome[];
  last_update?: string;
}
export interface OddsApiBookmaker {
  key: string;
  title?: string;
  last_update?: string;
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
  /** Provider's last score-update timestamp (ISO 8601), null before kickoff. */
  last_update?: string | null;
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
  const offers: Record<string, OddsOffer[]> = { h2h: [], spreads: [], totals: [] };
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
          offers.h2h.push({ bookmaker: bm.key, bookmakerTitle: bm.title, selection: sel, price: o.price, updatedAt: mk.last_update ?? bm.last_update });
        }
      } else if (mk.key === 'spreads') {
        for (const o of mk.outcomes) {
          if (o.point === undefined) continue;
          const sel = selectionForOutcome(o.name, raw.home_team, raw.away_team);
          if (sel !== 'home' && sel !== 'away') continue;
          better(spreads, spreadKey(sel, o.point), o.price);
          offers.spreads.push({ bookmaker: bm.key, bookmakerTitle: bm.title, selection: spreadKey(sel, o.point), price: o.price, point: o.point, updatedAt: mk.last_update ?? bm.last_update });
        }
      } else if (mk.key === 'totals') {
        for (const o of mk.outcomes) {
          if (o.point === undefined) continue;
          const name = o.name.toLowerCase();
          if (name !== 'over' && name !== 'under') continue;
          better(totals, totalKey(name, o.point), o.price);
          offers.totals.push({ bookmaker: bm.key, bookmakerTitle: bm.title, selection: totalKey(name, o.point), price: o.price, point: o.point, updatedAt: mk.last_update ?? bm.last_update });
        }
      }
    }
  }

  const out: MarketOdds[] = [];
  if (Object.keys(h2h).length > 0) {
    out.push({ market: hasDraw ? '1X2' : 'moneyline', prices: h2h, offers: offers.h2h });
  }
  if (Object.keys(spreads).length > 0) {
    out.push({ market: 'spreads', prices: spreads, offers: offers.spreads });
  }
  if (Object.keys(totals).length > 0) {
    out.push({ market: 'totals', prices: totals, offers: offers.totals });
  }
  return out;
}

/**
 * Map the per-event odds response (`/events/{id}/odds`) for the extra
 * **gradeable** markets we can settle from the final score — BTTS, draw-no-bet
 * and team totals. Only outcomes that map to an unambiguous canonical selection
 * are kept; anything we can't confidently encode is dropped rather than risk a
 * mis-settled pick. Featured markets (h2h/spreads/totals) stay on the cheaper
 * bulk `/odds` call.
 */
export function mapEventOdds(raw: OddsApiEventOdds): MarketOdds[] {
  const btts: Record<string, number> = {};
  const dnb: Record<string, number> = {};
  const teamTotals: Record<string, number> = {};
  const offers: Record<string, OddsOffer[]> = { btts: [], dnb: [], team_totals: [] };

  const better = (bag: Record<string, number>, key: string, price: number) => {
    if (bag[key] === undefined || price > bag[key]) bag[key] = price;
  };

  for (const bm of raw.bookmakers ?? []) {
    for (const mk of bm.markets ?? []) {
      const updatedAt = mk.last_update ?? bm.last_update;
      if (mk.key === 'btts') {
        for (const o of mk.outcomes) {
          const name = o.name.toLowerCase();
          if (name !== 'yes' && name !== 'no') continue;
          better(btts, name, o.price);
          offers.btts.push({ bookmaker: bm.key, bookmakerTitle: bm.title, selection: name, price: o.price, updatedAt });
        }
      } else if (mk.key === 'draw_no_bet') {
        for (const o of mk.outcomes) {
          const sel = selectionForOutcome(o.name, raw.home_team, raw.away_team);
          if (sel !== 'home' && sel !== 'away') continue;
          better(dnb, sel, o.price);
          offers.dnb.push({ bookmaker: bm.key, bookmakerTitle: bm.title, selection: sel, price: o.price, updatedAt });
        }
      } else if (mk.key === 'team_totals') {
        for (const o of mk.outcomes) {
          if (o.point === undefined || !o.description) continue;
          const team = selectionForOutcome(o.description, raw.home_team, raw.away_team);
          const side = o.name.toLowerCase();
          if ((team !== 'home' && team !== 'away') || (side !== 'over' && side !== 'under')) continue;
          const key = `${team} ${side} ${o.point}`;
          better(teamTotals, key, o.price);
          offers.team_totals.push({ bookmaker: bm.key, bookmakerTitle: bm.title, selection: key, price: o.price, point: o.point, updatedAt });
        }
      }
    }
  }

  const out: MarketOdds[] = [];
  if (Object.keys(btts).length > 0) out.push({ market: 'btts', prices: btts, offers: offers.btts });
  if (Object.keys(dnb).length > 0) out.push({ market: 'dnb', prices: dnb, offers: offers.dnb });
  if (Object.keys(teamTotals).length > 0) {
    out.push({ market: 'team_totals', prices: teamTotals, offers: offers.team_totals });
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

/**
 * Normalize a score event into our provider-agnostic {@link ScoreState},
 * pairing the parsed score with the provider's completion flag and last-update
 * timestamp so callers can reason about freshness (a stale in-play score must
 * never be presented as current).
 */
export function scoreStateOf(raw: OddsApiScoreEvent): ScoreState {
  return {
    vendorEventId: raw.id,
    completed: raw.completed,
    score: scoresOf(raw),
    lastUpdate: raw.last_update ?? null,
  };
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

/** A market entry in the `/events/{id}/markets` response (no outcomes). */
export interface OddsApiMarketKey {
  key: string;
  last_update?: string;
}
export interface OddsApiMarketsBookmaker {
  key: string;
  title?: string;
  markets: OddsApiMarketKey[];
}
export interface OddsApiEventMarkets extends OddsApiEvent {
  bookmakers: OddsApiMarketsBookmaker[];
}

/** Latest of two ISO timestamps (either may be undefined). */
function latestIso(a: string | null, b?: string): string | null {
  if (!b) return a;
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * Normalize the event market-inventory response into per-market info,
 * classified by the shared market registry. Aggregates the set of bookmakers
 * offering each market and keeps the most recent update. Sorted featured/
 * pickable markets first, then by key, for stable display.
 */
export function mapMarketInventory(raw: OddsApiEventMarkets): ProviderMarketInfo[] {
  const byKey = new Map<
    string,
    { bookmakers: Set<string>; lastUpdate: string | null }
  >();

  for (const bm of raw.bookmakers ?? []) {
    for (const mk of bm.markets ?? []) {
      const entry = byKey.get(mk.key) ?? { bookmakers: new Set<string>(), lastUpdate: null };
      entry.bookmakers.add(bm.key);
      entry.lastUpdate = latestIso(entry.lastUpdate, mk.last_update);
      byKey.set(mk.key, entry);
    }
  }

  const items: ProviderMarketInfo[] = [];
  for (const [key, entry] of byKey) {
    const cls = classifyProviderMarket(key);
    items.push({
      key,
      group: cls.group,
      label: cls.label,
      pickable: cls.canonicalMarkets.length > 0,
      canonicalMarkets: [...cls.canonicalMarkets],
      bookmakers: [...entry.bookmakers].sort(),
      lastUpdate: entry.lastUpdate,
    });
  }

  return items.sort((a, b) => {
    if (a.pickable !== b.pickable) return a.pickable ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
}
