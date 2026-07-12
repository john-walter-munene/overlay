// Shared domain types. Kept dependency-free so the stats engine and
// integrity helpers can run in the API, workers, and tests alike.

export type PickStatus = 'pending' | 'won' | 'lost' | 'void';

/** Minimal shape needed to compute a tipster's stats. */
export interface SettledPick {
  oddsAtPick: number;
  stakeUnits: number;
  status: PickStatus;
  /** Closing decimal odds for the same market, when captured. */
  closingOdds?: number | null;
  /** Ordering key for drawdown/streak (ms epoch). */
  settledAt?: number | null;
}

export interface TipsterStats {
  /** Profit divided by turnover, as a fraction (e.g. 0.08 = +8%). */
  roi: number;
  /** Same as roi expressed as a percentage (e.g. 8.0). */
  yield: number;
  /** Mean closing-line value across picks with closing odds (fraction). */
  clvAvg: number;
  /** won / (won + lost), fraction. */
  winRate: number;
  /** Total settled picks (won + lost + void). */
  sampleSize: number;
  /** Largest peak-to-trough drop in cumulative units. */
  maxDrawdown: number;
  /** Signed run of latest decisive results: +N won streak, -N lost streak. */
  currentStreak: number;
}
