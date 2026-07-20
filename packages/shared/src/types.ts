// Shared domain types. Kept dependency-free so the stats engine and
// integrity helpers can run in the API, workers, and tests alike.

export type PickStatus =
  | 'pending'
  | 'won'
  | 'lost'
  | 'void'
  | 'half_won'
  | 'half_lost';

/**
 * Whether a pick was placed before kickoff (`pre_match`, the default and the
 * only CLV-bearing type) or during the game (`live`, in-play). Live picks are
 * excluded from CLV and aggregated separately from pre-match yield (OB-039).
 */
export type PickType = 'pre_match' | 'live';

/** Minimal shape needed to compute a tipster's stats. */
export interface SettledPick {
  oddsAtPick: number;
  stakeUnits: number;
  status: PickStatus;
  /** Pre-match (default) vs live/in-play. Live picks carry no CLV. */
  pickType?: PickType;
  /** Closing decimal odds for the same market, when captured. */
  closingOdds?: number | null;
  /** Ordering key for drawdown/streak (ms epoch). */
  settledAt?: number | null;
  /** Sport the pick belongs to, for ROI-by-sport breakdowns (OB-057). */
  sport?: string | null;
  /** Market the pick belongs to, for ROI-by-market breakdowns (OB-057). */
  market?: string | null;
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
