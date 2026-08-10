import type { PickStatus, SettledPick, TipsterStats } from './types.ts';

/**
 * Profit (in stake units) for a single settled pick using decimal odds.
 *   won        → stake * (odds - 1)
 *   half_won   → 0.5 * stake * (odds - 1)   (Asian quarter-line half-win)
 *   lost       → -stake
 *   half_lost  → -0.5 * stake               (Asian quarter-line half-loss)
 *   void       → 0 (stake returned)
 */
export function pickProfitUnits(pick: SettledPick): number {
  switch (pick.status) {
    case 'won':
      return pick.stakeUnits * (pick.oddsAtPick - 1);
    case 'half_won':
      return 0.5 * pick.stakeUnits * (pick.oddsAtPick - 1);
    case 'lost':
      return -pick.stakeUnits;
    case 'half_lost':
      return -0.5 * pick.stakeUnits;
    default:
      return 0;
  }
}

/**
 * Is this an in-play (live) pick? Live picks are placed after kickoff, carry no
 * pre-match closing line, and are excluded from CLV (OB-039). A missing
 * `pickType` means the legacy default, `pre_match`.
 */
export function isLive(pick: SettledPick): boolean {
  return pick.pickType === 'live';
}

/**
 * Closing Line Value for one pick, as a fraction.
 * Positive means the pick's odds beat the closing line (a genuine overlay).
 *   clv = oddsAtPick / closingOdds - 1
 * Returns null when closing odds are unavailable/invalid, or for live/in-play
 * picks — an in-play selection has no pre-match closing line, so CLV is
 * undefined and live picks never contribute to CLV (OB-039).
 */
export function pickClv(pick: SettledPick): number | null {
  if (isLive(pick)) return null;
  if (!pick.closingOdds || pick.closingOdds <= 0) return null;
  return pick.oddsAtPick / pick.closingOdds - 1;
}

/** Does this status count toward turnover / win rate? (Full or half result.) */
export function isDecisive(status: PickStatus): boolean {
  return (
    status === 'won' ||
    status === 'lost' ||
    status === 'half_won' ||
    status === 'half_lost'
  );
}

/** Does this status count as a win for win-rate / streak? (Full or half win.) */
export function isWin(status: PickStatus): boolean {
  return status === 'won' || status === 'half_won';
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
    if (isDecisive(p.status)) {
      turnover += p.stakeUnits;
      decisive += 1;
      if (isWin(p.status)) won += 1;
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
 * Split a book into its pre-match and live/in-play sub-books and compute each
 * independently, so live and pre-match yield are never blended into one
 * misleading number (OB-039). The `preMatch` segment is the canonical,
 * CLV-bearing track record; the `live` segment has no CLV. Picks with no
 * `pickType` count as `pre_match` (the legacy default).
 */
export interface SegmentedStats {
  preMatch: TipsterStats;
  live: TipsterStats;
}

export function computeSegmentedStats(picks: SettledPick[]): SegmentedStats {
  return {
    preMatch: computeTipsterStats(picks.filter((p) => !isLive(p))),
    live: computeTipsterStats(picks.filter((p) => isLive(p))),
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
    const thisSign = isWin(s) ? 1 : -1;
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
