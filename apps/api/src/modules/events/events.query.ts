/**
 * Pure event-discovery query logic (Phase 3).
 *
 * Kept free of Nest/Prisma (mirrors marketplace.ts / users-query.ts) so the
 * parse → clamp → normalize → shape pipeline is unit-testable without a DB.
 * The service layer turns {@link NormalizedEventQuery} into a Prisma `where`
 * and maps rows through {@link toEventSummary}.
 */

/** Normalized lifecycle status surfaced to discovery UIs. */
export type EventStatus = 'upcoming' | 'live' | 'completed';

/** Status filter accepted from the client (`all` = no lifecycle constraint). */
export type EventStatusFilter = EventStatus | 'all';

const STATUS_FILTERS: readonly EventStatusFilter[] = [
  'upcoming',
  'live',
  'completed',
  'all',
];

export const EVENTS_PAGE_DEFAULT = 50;
export const EVENTS_PAGE_MAX = 100;

/** Score is considered stale if not updated within this window (2 min). */
export const SCORE_STALE_MS = 120_000;

export interface RawEventQuery {
  sport?: string;
  group?: string;
  league?: string;
  status?: string;
  q?: string;
  startFrom?: string;
  startTo?: string;
  bookmaker?: string;
  market?: string;
  limit?: string | number;
  offset?: string | number;
}

export interface NormalizedEventQuery {
  sport?: string;
  group?: string;
  league?: string;
  status: EventStatusFilter;
  q?: string;
  startFrom?: Date;
  startTo?: Date;
  /** On-demand detail filters (applied to a single event's odds, not the list). */
  bookmaker?: string;
  market?: string;
  limit: number;
  offset: number;
}

/** Minimal persisted event shape the discovery mapper needs (Prisma-free). */
export interface EventRowLike {
  id: string;
  sport: string;
  league: string | null;
  home: string;
  away: string;
  startTime: Date;
  status: string;
  liveHomeScore: number | null;
  liveAwayScore: number | null;
}

/** Normalized event row returned to discovery UIs. */
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

function trimmed(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function clampInt(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function parseDate(v: string | undefined): Date | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}

/** Parse + clamp + validate a raw discovery query into a safe, typed shape. */
export function normalizeEventQuery(raw: RawEventQuery = {}): NormalizedEventQuery {
  const status = STATUS_FILTERS.includes(raw.status as EventStatusFilter)
    ? (raw.status as EventStatusFilter)
    : 'upcoming';
  return {
    sport: trimmed(raw.sport),
    group: trimmed(raw.group),
    league: trimmed(raw.league),
    status,
    q: trimmed(raw.q),
    startFrom: parseDate(raw.startFrom),
    startTo: parseDate(raw.startTo),
    bookmaker: trimmed(raw.bookmaker)?.toLowerCase(),
    market: trimmed(raw.market),
    limit: clampInt(raw.limit, EVENTS_PAGE_DEFAULT, 1, EVENTS_PAGE_MAX),
    offset: clampInt(raw.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

/** Derive the normalized lifecycle status from a persisted row + clock. */
export function deriveEventStatus(row: EventRowLike, now: number): EventStatus {
  if (row.status === 'finished') return 'completed';
  return row.startTime.getTime() <= now ? 'live' : 'upcoming';
}

/**
 * Resolve a provider sport *group* (e.g. "Soccer") to its concrete sport keys
 * using the provider catalog, so a group filter becomes an indexed
 * `sport IN (...)` predicate. Case-insensitive; unknown group → empty list.
 */
export function resolveSportKeysForGroup(
  group: string,
  catalog: readonly { key: string; group: string }[],
): string[] {
  const g = group.trim().toLowerCase();
  return catalog.filter((s) => s.group.trim().toLowerCase() === g).map((s) => s.key);
}

/** Build a sportKey → group lookup from the provider catalog. */
export function sportGroupIndex(
  catalog: readonly { key: string; group: string }[],
): Map<string, string> {
  return new Map(catalog.map((s) => [s.key, s.group]));
}

/** Map a persisted event row to the normalized discovery summary. */
export function toEventSummary(
  row: EventRowLike,
  now: number,
  groups?: Map<string, string>,
): EventSummary {
  const hasScore = row.liveHomeScore !== null && row.liveAwayScore !== null;
  return {
    id: row.id,
    sport: row.sport,
    sportGroup: groups?.get(row.sport) ?? null,
    league: row.league,
    home: row.home,
    away: row.away,
    startTime: row.startTime.toISOString(),
    status: deriveEventStatus(row, now),
    score: hasScore
      ? { home: row.liveHomeScore as number, away: row.liveAwayScore as number }
      : null,
  };
}

/** Whether a score timestamp is older than the staleness window. */
export function isScoreStale(
  updatedAt: string | Date | null | undefined,
  now: number,
  windowMs: number = SCORE_STALE_MS,
): boolean {
  if (!updatedAt) return true;
  const ms = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return true;
  return now - ms > windowMs;
}
