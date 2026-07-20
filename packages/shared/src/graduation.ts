// Pure "rising tipster" graduation logic (OB-153).
//
// New tipsters start out as a *provisional* "Rising tipster": their tips are
// free/public and their live (pre-event) picks are NOT gated behind a paid
// subscription. Only once a tipster graduates — meeting a configurable win-rate
// and settled-sample threshold — do they become eligible to gate live picks.
//
// The requested rule is win rate >= 60% AND a settled sample above the small-
// sample floor. Because a handful of settled bets is not statistically robust
// (the leaderboard elsewhere uses a much larger floor), the threshold is
// configurable; the default requires a larger settled sample than the original
// 15-bet suggestion.
//
// Graduation never auto-enables billing: crossing the threshold only flags the
// tipster for admin review (`pending_review`). An admin assigns the verified
// tag, and gating stays off until a tipster/admin explicitly enables it.
//
// Kept dependency-free (no Nest / Prisma / process.env) so it can be exercised
// directly by the native type-stripping test runner and reused by the web app.

/**
 * A tipster's position on the Rising → Verified path.
 * - `rising`         — provisional; tips are free/public, live picks ungated.
 * - `pending_review` — met the graduation threshold; awaiting admin review.
 * - `verified`       — admin-approved; eligible to gate live picks.
 */
export type GraduationStatus = 'rising' | 'pending_review' | 'verified';

/** The full set of valid graduation states (single source of truth). */
export const GRADUATION_STATUSES: readonly GraduationStatus[] = [
  'rising',
  'pending_review',
  'verified',
];

/** Configurable graduation threshold. */
export interface GraduationThreshold {
  /** Minimum win rate as a fraction (e.g. 0.6 = 60%), inclusive. */
  minWinRate: number;
  /** Minimum settled sample size (settled picks), inclusive. */
  minSettledBets: number;
}

/**
 * Default graduation threshold: win rate >= 60% AND at least 20 settled bets.
 * The 20-bet floor raises the original 15-bet suggestion toward a more robust
 * sample; override via configuration for a stricter (or looser) policy.
 */
export const DEFAULT_GRADUATION_THRESHOLD: GraduationThreshold = {
  minWinRate: 0.6,
  minSettledBets: 20,
};

/** The verified-only stats a graduation decision is derived from. */
export interface GraduationStatsInput {
  /** won / (won + lost), as a fraction. */
  winRate: number;
  /** Total settled picks (the verified sample size). */
  settledBets: number;
}

/** The outcome of evaluating a tipster's stats against a threshold. */
export interface GraduationEvaluation {
  /** True only when BOTH the win-rate and sample-size floors are met. */
  eligible: boolean;
  meetsWinRate: boolean;
  meetsSampleSize: boolean;
  /** The threshold the evaluation was made against (for display/audit). */
  threshold: GraduationThreshold;
}

/** Coerce a possibly-missing status to a valid one, defaulting to `rising`. */
export function normalizeGraduationStatus(
  status: string | null | undefined,
): GraduationStatus {
  return status === 'pending_review' || status === 'verified'
    ? status
    : 'rising';
}

/**
 * Decide whether a tipster is eligible to graduate. Eligibility is derived only
 * from verified settled picks (win rate + settled sample size) and requires the
 * BOTH floors to be met.
 */
export function evaluateGraduation(
  stats: GraduationStatsInput,
  threshold: GraduationThreshold = DEFAULT_GRADUATION_THRESHOLD,
): GraduationEvaluation {
  const meetsWinRate = stats.winRate >= threshold.minWinRate;
  const meetsSampleSize = stats.settledBets >= threshold.minSettledBets;
  return {
    eligible: meetsWinRate && meetsSampleSize,
    meetsWinRate,
    meetsSampleSize,
    threshold,
  };
}

/**
 * The next graduation status after a stats recompute. Promotion is monotonic:
 * a `rising` tipster that crosses the threshold advances to `pending_review`
 * (surfacing them for admin review); `pending_review` and `verified` are never
 * auto-demoted if stats later regress below the threshold (regression is
 * handled by admin policy, not automatically). Returns the current status when
 * no transition applies.
 */
export function nextGraduationStatus(
  current: GraduationStatus,
  evaluation: GraduationEvaluation,
): GraduationStatus {
  if (current === 'rising' && evaluation.eligible) return 'pending_review';
  return current;
}

/** A tipster is provisional until an admin verifies them. */
export function isProvisional(status: GraduationStatus): boolean {
  return status !== 'verified';
}

/** Public-facing badge for a tipster's graduation status. */
export interface GraduationBadge {
  status: GraduationStatus;
  /** Human-readable label shown on the profile/marketplace. */
  label: string;
  /** True while the tipster is provisional ("Rising tipster"). */
  provisional: boolean;
}

/**
 * The badge to show for a graduation status: "Rising tipster" while provisional,
 * "Verified tipster" once graduated.
 */
export function graduationBadge(status: GraduationStatus): GraduationBadge {
  const provisional = isProvisional(status);
  return {
    status,
    label: provisional ? 'Rising tipster' : 'Verified tipster',
    provisional,
  };
}

/** The gating-relevant flags on a tipster. */
export interface LiveGatingState {
  graduationStatus: GraduationStatus;
  subscriptionGatingEnabled: boolean;
}

/**
 * Whether a tipster's live (pre-event) picks are gated behind a paid
 * subscription. Gating applies ONLY once the tipster is verified AND has
 * explicitly enabled subscription gating — otherwise their tips are free/public.
 */
export function isLivePicksGated(t: LiveGatingState): boolean {
  return t.graduationStatus === 'verified' && t.subscriptionGatingEnabled === true;
}
