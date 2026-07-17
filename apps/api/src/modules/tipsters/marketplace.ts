/**
 * Pure marketplace query logic for the tipster discovery page (OB-010).
 *
 * Kept free of Nest/Prisma so the filter → sort → paginate behaviour can be
 * unit-tested in isolation (mirrors payouts.math.ts / stats.ts). The service
 * fetches the small set of verified tipster rows and delegates the actual
 * narrowing and ordering here.
 */

export type MarketplaceSort = 'yield' | 'clv' | 'winRate';

export const MARKETPLACE_SORTS: readonly MarketplaceSort[] = [
  'yield',
  'clv',
  'winRate',
];

export const DEFAULT_MIN_SAMPLE = 10;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** Normalized, validated query — safe to hand straight to filtering/paging. */
export interface MarketplaceQuery {
  sport: string | null;
  maxPriceCents: number | null;
  minSample: number;
  sort: MarketplaceSort;
  page: number;
  pageSize: number;
}

/** A single verified tipster row eligible for the marketplace. */
export interface MarketplaceRow {
  tipsterId: string;
  yield: number;
  clvAvg: number;
  winRate: number;
  sampleSize: number;
  sports: string[];
  subscriptionPriceCents: number;
  bio: string | null;
  country: string | null;
  /** Public display name (displayName → username); null falls back to id in UI. */
  name: string | null;
  /** Optional avatar URL; null falls back to a generated avatar in the UI. */
  avatarUrl: string | null;
}

export interface MarketplacePage {
  items: MarketplaceRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Raw string params as received from the query string. */
export type RawMarketplaceQuery = Partial<
  Record<'sport' | 'maxPrice' | 'minSample' | 'sort' | 'page' | 'pageSize', string>
>;

function toInt(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Parse/clamp untrusted query-string params into a safe {@link MarketplaceQuery}.
 * Invalid values fall back to defaults rather than throwing so the SSR page
 * always renders.
 */
export function normalizeMarketplaceQuery(
  raw: RawMarketplaceQuery = {},
): MarketplaceQuery {
  const sportRaw = raw.sport?.trim();
  const sort = MARKETPLACE_SORTS.includes(raw.sort as MarketplaceSort)
    ? (raw.sort as MarketplaceSort)
    : 'yield';

  const maxPrice = toInt(raw.maxPrice);
  const minSample = toInt(raw.minSample);
  const page = toInt(raw.page);
  const pageSize = toInt(raw.pageSize);

  return {
    sport: sportRaw ? sportRaw : null,
    maxPriceCents: maxPrice != null && maxPrice >= 0 ? maxPrice : null,
    minSample: minSample != null && minSample >= 0 ? minSample : DEFAULT_MIN_SAMPLE,
    sort,
    page: page != null && page >= 1 ? page : 1,
    pageSize:
      pageSize != null && pageSize >= 1
        ? Math.min(pageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE,
  };
}

function sortKey(row: MarketplaceRow, sort: MarketplaceSort): number {
  switch (sort) {
    case 'clv':
      return row.clvAvg;
    case 'winRate':
      return row.winRate;
    case 'yield':
    default:
      return row.yield;
  }
}

/**
 * Filter, sort and paginate verified tipster rows.
 *
 * - Filters narrow the set by sport (case-insensitive membership), maximum
 *   subscription price and minimum settled sample size.
 * - Sorting is descending on the chosen metric, with CLV then tipsterId as
 *   stable tie-breakers so pagination is deterministic.
 */
export function filterAndRankTipsters(
  rows: MarketplaceRow[],
  query: MarketplaceQuery,
): MarketplacePage {
  const sport = query.sport?.toLowerCase() ?? null;

  const filtered = rows.filter((r) => {
    if (r.sampleSize < query.minSample) return false;
    if (
      query.maxPriceCents != null &&
      r.subscriptionPriceCents > query.maxPriceCents
    ) {
      return false;
    }
    if (sport && !r.sports.some((s) => s.toLowerCase() === sport)) {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const diff = sortKey(b, query.sort) - sortKey(a, query.sort);
    if (diff !== 0) return diff;
    if (b.clvAvg !== a.clvAvg) return b.clvAvg - a.clvAvg;
    return a.tipsterId.localeCompare(b.tipsterId);
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;
  const items = filtered.slice(start, start + query.pageSize);

  return { items, total, page, pageSize: query.pageSize, totalPages };
}
