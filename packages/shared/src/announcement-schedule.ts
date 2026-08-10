// Pure recurrence + timezone resolution for tip-drop schedule announcements
// (OB-034). Given a schedule (one-off or recurring at a wall-clock time in an
// explicit IANA timezone) this resolves the correct *next drop instant* in UTC,
// handling DST transitions via Intl offset probing.
//
// Kept free of Nest decorators / DB access so it can be unit-tested with Node's
// native `--experimental-strip-types` runner (see schedule.test.ts).

import { parseIsoDate, toIsoDate, type IsoDate } from './daily-tips.ts';

/** How often an announcement fires. */
export type AnnouncementRecurrence = 'one_off' | 'daily' | 'weekly';

/** Lifecycle state of an announcement. */
export type AnnouncementStatus = 'active' | 'canceled';

/** The schedule inputs needed to resolve the next drop instant. */
export interface ScheduleSpec {
  recurrence: AnnouncementRecurrence;
  /** IANA timezone, e.g. "Africa/Nairobi". */
  timezone: string;
  /** Wall-clock time of day in `timezone`, as "HH:MM" (24h). */
  timeOfDay: string;
  /** For `one_off`: the calendar day of the drop (in `timezone`). */
  date?: IsoDate | null;
  /** For `weekly`: day of week, 0 = Sunday … 6 = Saturday. */
  weekday?: number | null;
}

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validate a "HH:MM" 24-hour string, returning its parts or `null`. */
export function parseTimeOfDay(
  value: string | null | undefined,
): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = TIME_OF_DAY_RE.exec(value.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** True when `value` is an IANA timezone the runtime understands. */
export function isValidTimezone(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Offset (ms) between `timeZone`'s wall clock and UTC at a given instant, i.e.
 * `localWallTime - utc`. Positive east of UTC. Uses Intl so it tracks DST.
 */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const f: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') f[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(f.year),
    Number(f.month) - 1,
    Number(f.day),
    Number(f.hour),
    Number(f.minute),
    Number(f.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Convert a wall-clock date/time in `timeZone` to the UTC instant it names.
 * Probes the offset twice so DST boundaries resolve correctly.
 */
function wallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = zoneOffsetMs(timeZone, new Date(guess));
  let ts = guess - offset1;
  const offset2 = zoneOffsetMs(timeZone, new Date(ts));
  if (offset2 !== offset1) ts = guess - offset2;
  return new Date(ts);
}

/** The calendar day (year/month/day) `timeZone` is currently on at `instant`. */
function zonedYmd(
  timeZone: string,
  instant: Date,
): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const f: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') f[p.type] = p.value;
  }
  return { year: Number(f.year), month: Number(f.month), day: Number(f.day) };
}

/**
 * Resolve the next drop instant (UTC) for a schedule at or after `now`, or
 * `null` when there is no future occurrence (an invalid spec, or a one-off that
 * has already passed).
 */
export function resolveNextDropAt(
  spec: ScheduleSpec,
  now: Date = new Date(),
): Date | null {
  const t = parseTimeOfDay(spec.timeOfDay);
  if (!t || !isValidTimezone(spec.timezone)) return null;

  if (spec.recurrence === 'one_off') {
    const iso = parseIsoDate(spec.date ?? undefined);
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const at = wallTimeToUtc(y, m, d, t.hour, t.minute, spec.timezone);
    return at.getTime() >= now.getTime() ? at : null;
  }

  if (spec.recurrence === 'weekly') {
    const weekday = spec.weekday;
    if (weekday == null || weekday < 0 || weekday > 6) return null;
  }

  // Recurring: walk forward from "today in the timezone". Eight days covers a
  // full week plus a same-weekday roll-over when today's time has already passed.
  const today = zonedYmd(spec.timezone, now);
  for (let i = 0; i < 8; i++) {
    const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day));
    cursor.setUTCDate(cursor.getUTCDate() + i);
    if (spec.recurrence === 'weekly' && cursor.getUTCDay() !== spec.weekday) {
      continue;
    }
    const at = wallTimeToUtc(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
      t.hour,
      t.minute,
      spec.timezone,
    );
    if (at.getTime() >= now.getTime()) return at;
  }
  return null;
}

/** A persisted announcement row (the fields we surface / serialize). */
export interface AnnouncementRecord {
  id: string;
  tipsterId: string;
  title: string;
  message: string | null;
  timezone: string;
  recurrence: AnnouncementRecurrence;
  timeOfDay: string;
  dropDate: Date | null;
  weekday: number | null;
  reminderMinutes: number | null;
  nextDropAt: Date | null;
  status: AnnouncementStatus;
}

/**
 * The subscriber-facing shape of an announcement. Deliberately excludes every
 * gated pick field — an announcement only ever conveys *when* tips will drop,
 * never *what* the pick is.
 */
export interface PublicAnnouncement {
  id: string;
  tipsterId: string;
  title: string;
  message: string | null;
  timezone: string;
  recurrence: AnnouncementRecurrence;
  timeOfDay: string;
  date: IsoDate | null;
  weekday: number | null;
  reminderMinutes: number | null;
  nextDropAt: string | null;
  status: AnnouncementStatus;
}

/** Map a persisted announcement to its public JSON shape. */
export function toPublicAnnouncement(
  row: AnnouncementRecord,
): PublicAnnouncement {
  return {
    id: row.id,
    tipsterId: row.tipsterId,
    title: row.title,
    message: row.message,
    timezone: row.timezone,
    recurrence: row.recurrence,
    timeOfDay: row.timeOfDay,
    date: row.dropDate ? toIsoDate(row.dropDate) : null,
    weekday: row.weekday,
    reminderMinutes: row.reminderMinutes,
    nextDropAt: row.nextDropAt ? row.nextDropAt.toISOString() : null,
    status: row.status,
  };
}
