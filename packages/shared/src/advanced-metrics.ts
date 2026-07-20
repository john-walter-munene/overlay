import type { SettledPick, TipsterStats } from './types.ts';
import { computeTipsterStats, pickClv } from './stats.ts';

/**
 * Additional verified metrics for a tipster's profile (OB-057): the CLV
 * distribution, ROI broken down by sport and by market, and time-windowed
 * performance (30-day / 90-day / all-time). Every function here is pure and
 * deterministic — the same picks always yield the same numbers — so it can run
 * in the API, workers and tests alike, and be checked against fixtures.
 */

/** One bar of the CLV histogram: how many graded picks fell in a CLV band. */
export interface ClvDistributionBucket {
  /** Human-readable band label, e.g. "-3% to -1%" or "≥ +5%". */
  label: string;
  /** Inclusive lower bound of the band, in percent (-Infinity for the first). */
  lowerPct: number;
  /** Exclusive upper bound of the band, in percent (+Infinity for the last). */
  upperPct: number;
  /** Number of graded picks whose CLV fell in this band. */
  count: number;
}

/** The full CLV distribution across a tipster's CLV-bearing picks. */
export interface ClvDistribution {
  /** Fixed, ordered histogram bands (worst CLV first, best last). */
  buckets: ClvDistributionBucket[];
  /** Number of settled picks that carried a graded CLV. */
  sampleSize: number;
  /** Mean CLV across graded picks, in percent (0 when none). */
  averagePct: number;
  /** Fraction of graded picks that beat the close (CLV > 0), 0 when none. */
  positiveRate: number;
}

/**
 * Fixed inner edges (in percent) of the CLV histogram. Kept constant so the
 * distribution is comparable across every tipster and stable over time. The
 * edges create the bands: (<-5), [-5,-3), [-3,-1), [-1,1), [1,3), [3,5), (≥5).
 */
const CLV_EDGES_PCT = [-5, -3, -1, 1, 3, 5] as const;

function clvBucketLabel(lowerPct: number, upperPct: number): string {
  const fmt = (v: number) => `${v > 0 ? '+' : ''}${v}%`;
  if (lowerPct === -Infinity) return `< ${fmt(upperPct)}`;
  if (upperPct === Infinity) return `≥ ${fmt(lowerPct)}`;
  return `${fmt(lowerPct)} to ${fmt(upperPct)}`;
}

/**
 * Bucket a tipster's picks into a fixed CLV histogram (OB-057). Only picks with
 * a graded CLV are counted (live/in-play and ungraded picks carry no CLV, so
 * they never appear here). Bands are half-open `[lower, upper)` on the CLV in
 * percent, so a value lands in exactly one band.
 */
export function computeClvDistribution(picks: SettledPick[]): ClvDistribution {
  const bounds: Array<[number, number]> = [];
  let prev = -Infinity;
  for (const edge of CLV_EDGES_PCT) {
    bounds.push([prev, edge]);
    prev = edge;
  }
  bounds.push([prev, Infinity]);

  const buckets: ClvDistributionBucket[] = bounds.map(([lowerPct, upperPct]) => ({
    label: clvBucketLabel(lowerPct, upperPct),
    lowerPct,
    upperPct,
    count: 0,
  }));

  let sum = 0;
  let sampleSize = 0;
  let positive = 0;

  for (const pick of picks) {
    const clv = pickClv(pick);
    if (clv === null) continue;
    const pct = clv * 100;
    sampleSize += 1;
    sum += pct;
    if (clv > 0) positive += 1;
    const bucket = buckets.find((b) => pct >= b.lowerPct && pct < b.upperPct);
    // The bands span the whole real line, so a bucket is always found.
    if (bucket) bucket.count += 1;
  }

  return {
    buckets,
    sampleSize,
    averagePct: sampleSize > 0 ? sum / sampleSize : 0,
    positiveRate: sampleSize > 0 ? positive / sampleSize : 0,
  };
}

/** Aggregate stats for one slice of a tipster's book (a sport or a market). */
export interface DimensionStats {
  /** The sport or market name this slice covers. */
  key: string;
  /** Full stats (ROI/yield/win-rate/CLV/…) for picks in this slice. */
  stats: TipsterStats;
}

/** Label used when a pick has no sport/market recorded. */
export const UNKNOWN_DIMENSION = 'unknown';

/**
 * Group picks by a chosen dimension and compute each group's stats with the
 * shared, unit-tested engine (OB-057). Groups are returned in a deterministic
 * order: by descending sample size, then alphabetically by key, so the output
 * never depends on input ordering. Picks missing the dimension are grouped
 * under `unknown`.
 */
function computeStatsByDimension(
  picks: SettledPick[],
  key: (pick: SettledPick) => string | null | undefined,
): DimensionStats[] {
  const groups = new Map<string, SettledPick[]>();
  for (const pick of picks) {
    const raw = key(pick);
    const bucket = raw && raw.trim() !== '' ? raw : UNKNOWN_DIMENSION;
    const list = groups.get(bucket);
    if (list) list.push(pick);
    else groups.set(bucket, [pick]);
  }

  return [...groups.entries()]
    .map(([groupKey, groupPicks]) => ({
      key: groupKey,
      stats: computeTipsterStats(groupPicks),
    }))
    .sort(
      (a, b) =>
        b.stats.sampleSize - a.stats.sampleSize ||
        a.key.localeCompare(b.key),
    );
}

/** ROI and full stats for each sport the tipster has picks in (OB-057). */
export function computeStatsBySport(picks: SettledPick[]): DimensionStats[] {
  return computeStatsByDimension(picks, (p) => p.sport);
}

/** ROI and full stats for each market the tipster has picks in (OB-057). */
export function computeStatsByMarket(picks: SettledPick[]): DimensionStats[] {
  return computeStatsByDimension(picks, (p) => p.market);
}

/** Length of the rolling windows, in whole days. */
export const WINDOW_DAYS = { last30: 30, last90: 90 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A tipster's performance over rolling windows plus the full record (OB-057).
 * Each field is the same `TipsterStats` shape, so the profile can show 30-day /
 * 90-day / all-time side by side.
 */
export interface WindowedStats {
  /** Stats over picks settled in the last 30 days (relative to `now`). */
  last30: TipsterStats;
  /** Stats over picks settled in the last 90 days (relative to `now`). */
  last90: TipsterStats;
  /** Stats over the tipster's entire settled record. */
  allTime: TipsterStats;
}

/**
 * Compute time-windowed performance (30-day / 90-day / all-time) from a
 * tipster's picks (OB-057). A pick counts toward a window when it settled at or
 * after `now - window`; picks with no settlement time are only ever counted in
 * `allTime` (they can't be placed on the timeline). `now` is an explicit
 * argument so the result is deterministic and fixture-testable.
 */
export function computeWindowedStats(
  picks: SettledPick[],
  now: number = Date.now(),
): WindowedStats {
  const within = (windowDays: number) =>
    picks.filter(
      (p) =>
        typeof p.settledAt === 'number' &&
        p.settledAt >= now - windowDays * DAY_MS,
    );

  return {
    last30: computeTipsterStats(within(WINDOW_DAYS.last30)),
    last90: computeTipsterStats(within(WINDOW_DAYS.last90)),
    allTime: computeTipsterStats(picks),
  };
}

/** The full bundle of OB-057 verified metrics surfaced on a tipster profile. */
export interface VerifiedMetrics {
  clvDistribution: ClvDistribution;
  bySport: DimensionStats[];
  byMarket: DimensionStats[];
  windows: WindowedStats;
}

/**
 * Assemble every additional verified metric (OB-057) for a tipster in one pass
 * so the profile API can surface them together. Pure and deterministic given
 * `now`.
 */
export function computeVerifiedMetrics(
  picks: SettledPick[],
  now: number = Date.now(),
): VerifiedMetrics {
  return {
    clvDistribution: computeClvDistribution(picks),
    bySport: computeStatsBySport(picks),
    byMarket: computeStatsByMarket(picks),
    windows: computeWindowedStats(picks, now),
  };
}
