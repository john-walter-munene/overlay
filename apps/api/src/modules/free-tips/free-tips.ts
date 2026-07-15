// Pure serialization helpers for the free "Daily Tips" hub (OB-150).
//
// Kept free of Nest decorators / DB access so it can be unit-tested with
// Node's native type-stripping test runner (see daily-tips date helpers in
// @overlay/shared for the calendar math).

import { toIsoDate, type IsoDate } from '@overlay/shared';

/** A free tip row as persisted (the fields we surface publicly). */
export interface FreeTipRecord {
  id: string;
  tipDate: Date;
  sport: string;
  league: string | null;
  match: string;
  market: string;
  selection: string;
  odds: number | null;
  analysis: string | null;
  sortOrder: number;
  createdAt: Date;
}

/** The public shape of a free tip returned to clients. */
export interface PublicFreeTip {
  id: string;
  date: IsoDate;
  sport: string;
  league: string | null;
  match: string;
  market: string;
  selection: string;
  odds: number | null;
  analysis: string | null;
}

/** Map a persisted free tip to its public JSON shape (date-only tipDate). */
export function toPublicFreeTip(row: FreeTipRecord): PublicFreeTip {
  return {
    id: row.id,
    date: toIsoDate(row.tipDate),
    sport: row.sport,
    league: row.league,
    match: row.match,
    market: row.market,
    selection: row.selection,
    odds: row.odds,
    analysis: row.analysis,
  };
}

/** The public per-date listing payload. */
export interface FreeTipsForDate {
  date: IsoDate;
  tips: PublicFreeTip[];
}

/** Build the `{ date, tips }` payload for a single calendar day. */
export function buildFreeTipsForDate(
  date: IsoDate,
  rows: FreeTipRecord[],
): FreeTipsForDate {
  return { date, tips: rows.map(toPublicFreeTip) };
}
