import type { SettledPick, TipsterStats } from './types.ts';
import { computeTipsterStats, pickClv, pickProfitUnits } from './stats.ts';

/**
 * One step in a tipster's performance time-series. Each point is the running,
 * cumulative state of the book after the pick settled at `settledAt` — so a
 * chart can plot ROI/yield/CLV/win-rate/equity/drawdown over time.
 */
export interface PerformancePoint {
  /** 1-based position of this settled pick in chronological order. */
  index: number;
  /** Settlement time (ms epoch) of the pick at this step, if known. */
  settledAt: number | null;
  /** Cumulative profit in stake units up to and including this pick. */
  cumulativeUnits: number;
  /** Cumulative ROI (profit / turnover) as a fraction. */
  roi: number;
  /** Cumulative yield (roi * 100). */
  yield: number;
  /** Cumulative mean CLV over picks with closing odds (fraction). */
  clvAvg: number;
  /** Cumulative win rate over decisive picks (fraction). */
  winRate: number;
  /** Running drawdown from peak equity, in stake units (>= 0). */
  drawdown: number;
}

/** Counts of a tipster's picks split by status (pending vs settled). */
export interface PickBreakdown {
  pending: number;
  won: number;
  lost: number;
  void: number;
  /** won + lost + void. */
  settled: number;
  /** settled + pending. */
  total: number;
}

/** Everything the performance dashboard needs: series, breakdown and summary. */
export interface PerformanceDashboard {
  series: PerformancePoint[];
  breakdown: PickBreakdown;
  stats: TipsterStats;
}

/**
 * Build the cumulative performance time-series from a tipster's picks.
 * Pending picks are ignored; settled picks are ordered by settlement time so
 * each point reflects the running state of the book at that moment. Pure and
 * deterministic — it mirrors `computeTipsterStats` step by step.
 */
export function buildPerformanceSeries(picks: SettledPick[]): PerformancePoint[] {
  const ordered = [...picks]
    .filter((p) => p.status !== 'pending')
    .sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0));

  let turnover = 0;
  let profit = 0;
  let won = 0;
  let decisive = 0;

  let clvSum = 0;
  let clvCount = 0;

  let equity = 0;
  let peak = 0;

  return ordered.map((p, i) => {
    if (p.status === 'won' || p.status === 'lost') {
      turnover += p.stakeUnits;
      decisive += 1;
      if (p.status === 'won') won += 1;
    }

    const gain = pickProfitUnits(p);
    profit += gain;
    equity += gain;
    if (equity > peak) peak = equity;

    const clv = pickClv(p);
    if (clv !== null) {
      clvSum += clv;
      clvCount += 1;
    }

    const roi = turnover > 0 ? profit / turnover : 0;

    return {
      index: i + 1,
      settledAt: p.settledAt ?? null,
      cumulativeUnits: equity,
      roi,
      yield: roi * 100,
      clvAvg: clvCount > 0 ? clvSum / clvCount : 0,
      winRate: decisive > 0 ? won / decisive : 0,
      drawdown: peak - equity,
    };
  });
}

/** Count a tipster's picks by status for the pending-vs-settled breakdown. */
export function pickBreakdown(picks: SettledPick[]): PickBreakdown {
  let pending = 0;
  let won = 0;
  let lost = 0;
  let voided = 0;

  for (const p of picks) {
    switch (p.status) {
      case 'pending':
        pending += 1;
        break;
      case 'won':
        won += 1;
        break;
      case 'lost':
        lost += 1;
        break;
      case 'void':
        voided += 1;
        break;
    }
  }

  const settled = won + lost + voided;
  return { pending, won, lost, void: voided, settled, total: settled + pending };
}

/**
 * Assemble the full performance dashboard payload — time-series, status
 * breakdown and aggregate stats — from a tipster's pick history.
 */
export function buildPerformanceDashboard(
  picks: SettledPick[],
): PerformanceDashboard {
  return {
    series: buildPerformanceSeries(picks),
    breakdown: pickBreakdown(picks),
    stats: computeTipsterStats(picks),
  };
}
