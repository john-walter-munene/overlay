import type { SettledPick, TipsterStats } from './types.ts';

/**
 * Profit (in stake units) for a single settled pick using decimal odds.
 *   won  → stake * (odds - 1)
 *   lost → -stake
 *   void → 0 (stake returned)
 */
export function pickProfitUnits(pick: SettledPick): number {
  switch (pick.status) {
    case 'won':
      return pick.stakeUnits * (pick.oddsAtPick - 1);
    case 'lost':
      return -pick.stakeUnits;
    default:
      return 0;
  }
}

/**
 * Closing Line Value for one pick, as a fraction.
 * Positive means the pick's odds beat the closing line (a genuine overlay).
 *   clv = oddsAtPick / closingOdds - 1
 * Returns null when closing odds are unavailable/invalid.
 */
export function pickClv(pick: SettledPick): number | null {
  if (!pick.closingOdds || pick.closingOdds <= 0) return null;
  return pick.oddsAtPick / pick.closingOdds - 1;
}

/** Is this pick decisive (counts toward turnover / win rate)? */
function isDecisive(pick: SettledPick): boolean {
  return pick.status === 'won' || pick.status === 'lost';
}

/**
 * Compute a tipster's aggregate stats from their settled picks.
 * Pure and deterministic — this is the correctness-critical core of the product.
 * `pending` picks are ignored; `void` picks count toward sample size only.
 */
export function computeTipsterStats(picks: SettledPick[]): TipsterStats {
  const settled = picks.filter((p) => p.status !== 'pending');

  // Order by settlement time for drawdown/streak; stable for ties.
  const ordered = [...settled].sort(
    (a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0),
  );

  let turnover = 0;
  let profit = 0;
  let won = 0;
  let decisive = 0;

  let clvSum = 0;
  let clvCount = 0;

  // Drawdown tracking over cumulative equity.
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const p of ordered) {
    if (isDecisive(p)) {
      turnover += p.stakeUnits;
      decisive += 1;
      if (p.status === 'won') won += 1;
    }

    profit += pickProfitUnits(p);

    equity += pickProfitUnits(p);
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    const clv = pickClv(p);
    if (clv !== null) {
      clvSum += clv;
      clvCount += 1;
    }
  }

  const roi = turnover > 0 ? profit / turnover : 0;

  return {
    roi,
    yield: roi * 100,
    clvAvg: clvCount > 0 ? clvSum / clvCount : 0,
    winRate: decisive > 0 ? won / decisive : 0,
    sampleSize: settled.length,
    maxDrawdown,
    currentStreak: computeCurrentStreak(ordered),
  };
}

/**
 * Signed streak of the most recent decisive results.
 * +N = last N picks all won; -N = last N picks all lost. Void breaks nothing
 * but is skipped; a mixed transition stops the count.
 */
export function computeCurrentStreak(orderedPicks: SettledPick[]): number {
  let streak = 0;
  let sign = 0;
  for (let i = orderedPicks.length - 1; i >= 0; i--) {
    const s = orderedPicks[i].status;
    if (s === 'void' || s === 'pending') continue;
    const thisSign = s === 'won' ? 1 : -1;
    if (sign === 0) {
      sign = thisSign;
      streak = thisSign;
    } else if (thisSign === sign) {
      streak += thisSign;
    } else {
      break;
    }
  }
  return streak;
}
