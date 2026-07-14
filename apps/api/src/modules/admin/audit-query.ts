/**
 * Pure query logic for the admin audit-log viewer (OB-027).
 *
 * Kept free of Nest/Prisma (mirrors {@link ./users-query.ts}) so the
 * parse → clamp → paginate → filter behaviour can be unit-tested in isolation.
 * The service normalizes the untrusted query string here, builds a safe `where`
 * via {@link buildAuditLogWhere}, counts matching rows, then asks
 * {@link paginateAuditLog} for the DB skip/take window.
 */

export const DEFAULT_AUDIT_PAGE_SIZE = 25;
export const MAX_AUDIT_PAGE_SIZE = 100;

/** Normalized, validated query — safe to hand straight to the DB layer. */
export interface AuditLogQuery {
  entity: string | null;
  actor: string | null;
  action: string | null;
  /** Inclusive lower bound (start of day, UTC), or null. */
  from: Date | null;
  /** Inclusive upper bound (end of day, UTC), or null. */
  to: Date | null;
  page: number;
  pageSize: number;
}

/** Raw string params as received from the query string. */
export type RawAuditLogQuery = Partial<
  Record<'entity' | 'actor' | 'action' | 'from' | 'to' | 'page' | 'pageSize', string>
>;

/** Skip/take window plus paging metadata for a known total. */
export interface AuditPageWindow {
  page: number;
  pageSize: number;
  totalPages: number;
  skip: number;
  take: number;
}

/** Prisma-shaped `where` for AuditLog — plain object, testable without Prisma. */
export interface AuditLogWhere {
  entity?: string;
  actor?: { contains: string; mode: 'insensitive' };
  action?: { contains: string; mode: 'insensitive' };
  createdAt?: { gte?: Date; lte?: Date };
}

function toInt(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function trimOrNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * Parse a `YYYY-MM-DD` calendar date into a UTC {@link Date} at the given end
 * of day. Returns null for blank or malformed input (invalid values are
 * ignored rather than throwing so the page always renders).
 */
function parseDate(value: string | undefined, edge: 'start' | 'end'): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
  const d = new Date(`${raw}T${time}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse/clamp untrusted query-string params into a safe {@link AuditLogQuery}.
 * Invalid values fall back to defaults rather than throwing so the page always
 * renders. Blank filters collapse to `null` (no filter).
 */
export function normalizeAuditLogQuery(raw: RawAuditLogQuery = {}): AuditLogQuery {
  const pageRaw = toInt(raw.page);
  const page = pageRaw != null && pageRaw >= 1 ? pageRaw : 1;

  const pageSizeRaw = toInt(raw.pageSize);
  const pageSize =
    pageSizeRaw != null && pageSizeRaw >= 1
      ? Math.min(pageSizeRaw, MAX_AUDIT_PAGE_SIZE)
      : DEFAULT_AUDIT_PAGE_SIZE;

  return {
    entity: trimOrNull(raw.entity),
    actor: trimOrNull(raw.actor),
    action: trimOrNull(raw.action),
    from: parseDate(raw.from, 'start'),
    to: parseDate(raw.to, 'end'),
    page,
    pageSize,
  };
}

/**
 * Build a Prisma `where` from a normalized query. Entity matches exactly
 * (backed by the `@@index([entity, entityId])`); actor and action use
 * case-insensitive substring matches; from/to bound `createdAt`.
 */
export function buildAuditLogWhere(query: AuditLogQuery): AuditLogWhere {
  const where: AuditLogWhere = {};
  if (query.entity) where.entity = query.entity;
  if (query.actor) where.actor = { contains: query.actor, mode: 'insensitive' };
  if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = query.from;
    if (query.to) where.createdAt.lte = query.to;
  }
  return where;
}

/**
 * Resolve the DB skip/take window for a known total. An out-of-range page
 * clamps to the last page (rather than returning an empty window) so the UI
 * never lands on a blank table.
 */
export function paginateAuditLog(
  total: number,
  query: Pick<AuditLogQuery, 'page' | 'pageSize'>,
): AuditPageWindow {
  const pageSize = query.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  return {
    page,
    pageSize,
    totalPages,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}
