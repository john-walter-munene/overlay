/**
 * Pure date helpers for the free "Daily Tips" hub (OB-150).
 *
 * The tips hub is browsed one calendar day at a time via a date strip
 * (Yesterday · Today · Tomorrow + a calendar picker) and deep-linked per date
 * (`/tips?date=YYYY-MM-DD`). All date math is date-only (no time-of-day) and
 * anchored to UTC so a given `YYYY-MM-DD` means the same day on the server
 * (SSR) and in the client, independent of the viewer's timezone.
 *
 * Kept free of Nest/React so it can be unit-tested with Node's native
 * type-stripping test runner and shared by both the API and the web app.
 */

/** A calendar day in `YYYY-MM-DD` form. */
export type IsoDate = string;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Format a `Date` as a UTC `YYYY-MM-DD` string. */
export function toIsoDate(date: Date): IsoDate {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Validate and normalise a `YYYY-MM-DD` string. Returns the canonical ISO date
 * when the input is a real calendar day (rejecting values like `2026-02-31`),
 * otherwise `null`.
 */
export function parseIsoDate(value: string | null | undefined): IsoDate | null {
  if (!value) return null;
  const match = ISO_DATE_RE.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return toIsoDate(date);
}

/** The UTC "today" as an ISO date (defaults to the current time). */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

/** Convert an ISO date to a UTC-midnight `Date`. */
export function isoDateToUtc(value: IsoDate): Date {
  const iso = parseIsoDate(value);
  if (!iso) throw new RangeError(`Invalid ISO date: ${value}`);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Add (or subtract, for negative `days`) whole calendar days to an ISO date. */
export function addDays(value: IsoDate, days: number): IsoDate {
  const base = isoDateToUtc(value);
  base.setUTCDate(base.getUTCDate() + days);
  return toIsoDate(base);
}

/** Whole-day difference `a - b` (positive when `a` is later). */
export function diffInDays(a: IsoDate, b: IsoDate): number {
  const ms = isoDateToUtc(a).getTime() - isoDateToUtc(b).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * A short relative label for a date near "today": Yesterday / Today / Tomorrow,
 * falling back to the weekday name within the same week and otherwise a compact
 * `Mon D` style label.
 */
export function relativeDayLabel(
  value: IsoDate,
  today: IsoDate = todayIsoDate(),
): string {
  const delta = diffInDays(value, today);
  if (delta === 0) return 'Today';
  if (delta === -1) return 'Yesterday';
  if (delta === 1) return 'Tomorrow';
  if (delta > 1 && delta < 7) return WEEKDAY_LABELS[isoDateToUtc(value).getUTCDay()];
  return formatShortDate(value);
}

/** Compact human date, e.g. `Mar 4, 2026`. */
export function formatShortDate(value: IsoDate): string {
  const date = isoDateToUtc(value);
  const month = date.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** Full human date, e.g. `Wednesday, March 4, 2026`. */
export function formatLongDate(value: IsoDate): string {
  const date = isoDateToUtc(value);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** One entry in the date-navigation strip. */
export interface DateStripDay {
  date: IsoDate;
  label: string;
  isToday: boolean;
  isSelected: boolean;
}

/**
 * Build the date strip centred on `selected`: a symmetric window of days
 * (default ±1 → Yesterday · Today · Tomorrow style) with relative labels and
 * flags the UI uses to highlight today and the current selection.
 */
export function buildDateStrip(
  selected: IsoDate,
  today: IsoDate = todayIsoDate(),
  radius = 1,
): DateStripDay[] {
  const canonical = parseIsoDate(selected) ?? today;
  const span = Math.max(0, Math.floor(radius));
  const days: DateStripDay[] = [];
  for (let offset = -span; offset <= span; offset++) {
    const date = addDays(canonical, offset);
    days.push({
      date,
      label: relativeDayLabel(date, today),
      isToday: date === today,
      isSelected: date === canonical,
    });
  }
  return days;
}
