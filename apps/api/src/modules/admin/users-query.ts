/**
 * Pure query logic for the admin users table (OB-026).
 *
 * Kept free of Nest/Prisma (mirrors marketplace.ts) so the parse → clamp →
 * paginate behaviour can be unit-tested in isolation. The service normalizes
 * the untrusted query string here, counts matching rows, then asks
 * {@link paginateUsers} for the safe skip/take window.
 */

export const DEFAULT_USERS_PAGE_SIZE = 20;
export const MAX_USERS_PAGE_SIZE = 100;

/** Normalized, validated query — safe to hand straight to the DB layer. */
export interface UsersQuery {
  search: string | null;
  page: number;
  pageSize: number;
}

/** Raw string params as received from the query string. */
export type RawUsersQuery = Partial<Record<'q' | 'page' | 'pageSize', string>>;

/** Skip/take window plus paging metadata for a known total. */
export interface UsersPageWindow {
  page: number;
  pageSize: number;
  totalPages: number;
  skip: number;
  take: number;
}

function toInt(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Parse/clamp untrusted query-string params into a safe {@link UsersQuery}.
 * Invalid values fall back to defaults rather than throwing so the page always
 * renders. An empty/blank search collapses to `null` (no filter).
 */
export function normalizeUsersQuery(raw: RawUsersQuery = {}): UsersQuery {
  const searchRaw = raw.q?.trim();
  const search = searchRaw ? searchRaw : null;

  const pageRaw = toInt(raw.page);
  const page = pageRaw != null && pageRaw >= 1 ? pageRaw : 1;

  const pageSizeRaw = toInt(raw.pageSize);
  const pageSize =
    pageSizeRaw != null && pageSizeRaw >= 1
      ? Math.min(pageSizeRaw, MAX_USERS_PAGE_SIZE)
      : DEFAULT_USERS_PAGE_SIZE;

  return { search, page, pageSize };
}

/**
 * Resolve the DB skip/take window for a known total. An out-of-range page
 * clamps to the last page (rather than returning an empty window) so the UI
 * never lands on a blank table.
 */
export function paginateUsers(
  total: number,
  query: Pick<UsersQuery, 'page' | 'pageSize'>,
): UsersPageWindow {
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
