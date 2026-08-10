// Self-contained (no cross-lib import) so the pure helpers run under Node's
// type-stripping test runner while this module stays in the Next build graph.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Normalized lifecycle status surfaced by the discovery API. */
export type EventStatus = 'upcoming' | 'live' | 'completed';
export type EventStatusFilter = EventStatus | 'all';

export interface EventSummary {
  id: string;
  sport: string;
  sportGroup: string | null;
  league: string | null;
  home: string;
  away: string;
  startTime: string;
  status: EventStatus;
  score: { home: number; away: number } | null;
}

export interface EventsPage {
  events: EventSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface OddsOffer {
  bookmaker: string;
  bookmakerTitle?: string;
  selection: string;
  price: number;
  point?: number;
  updatedAt?: string;
}

export interface MarketOdds {
  market: string;
  prices: Record<string, number>;
  offers?: OddsOffer[];
}

export interface EventDetail {
  event: EventSummary;
  markets: MarketOdds[];
}

/** One market on offer for an event, classified by the shared registry. */
export interface MarketInfo {
  key: string;
  group: string;
  label: string;
  pickable: boolean;
  canonicalMarkets: string[];
  bookmakers: string[];
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

export interface EventsFilter {
  sport?: string;
  group?: string;
  league?: string;
  status?: EventStatusFilter;
  q?: string;
  startFrom?: string;
  startTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * Serialize a discovery filter into a query string, omitting empty values so
 * the URL stays clean and cache-friendly. Pure + unit-tested.
 */
export function buildEventsQuery(filter: EventsFilter): string {
  const qs = new URLSearchParams();
  const set = (k: string, v: string | number | undefined) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (s) qs.set(k, s);
  };
  set('sport', filter.sport);
  set('group', filter.group);
  set('league', filter.league);
  set('status', filter.status);
  set('q', filter.q);
  set('startFrom', filter.startFrom);
  set('startTo', filter.startTo);
  if (filter.limit !== undefined) set('limit', filter.limit);
  if (filter.offset) set('offset', filter.offset);
  return qs.toString();
}

const EMPTY_PAGE: EventsPage = { events: [], total: 0, limit: 0, offset: 0 };

/** Bettor-facing event discovery (public, DB-only). */
export async function discoverEvents(filter: EventsFilter): Promise<EventsPage> {
  try {
    const qs = buildEventsQuery(filter);
    const res = await fetch(`${API_URL}/api/events${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
    });
    if (!res.ok) return EMPTY_PAGE;
    return (await res.json()) as EventsPage;
  } catch {
    return EMPTY_PAGE;
  }
}

/** On-demand event detail: featured markets with best price + bookmaker offers. */
export async function getEventDetail(
  id: string,
  opts: { bookmaker?: string; market?: string } = {},
): Promise<EventDetail | null> {
  try {
    const qs = new URLSearchParams();
    if (opts.bookmaker) qs.set('bookmaker', opts.bookmaker);
    if (opts.market) qs.set('market', opts.market);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await fetch(
      `${API_URL}/api/events/${encodeURIComponent(id)}/detail${suffix}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as EventDetail;
  } catch {
    return null;
  }
}

/** On-demand market inventory: every market on offer, props included (read-only). */
export async function getEventMarkets(id: string): Promise<MarketInfo[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/events/${encodeURIComponent(id)}/markets`,
      { cache: 'no-store' },
    );
    if (!res.ok) return [];
    return (await res.json()) as MarketInfo[];
  } catch {
    return [];
  }
}

/** In-season provider sport catalog (for the group/sport filter options). */
export async function listProviderSports(): Promise<ProviderSport[]> {
  try {
    const res = await fetch(`${API_URL}/api/events/sports`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    return (await res.json()) as ProviderSport[];
  } catch {
    return [];
  }
}

/** Distinct provider sport groups (e.g. "Soccer", "Basketball"), sorted. */
export function sportGroups(catalog: ProviderSport[]): string[] {
  return [...new Set(catalog.filter((s) => s.active).map((s) => s.group))].sort();
}
