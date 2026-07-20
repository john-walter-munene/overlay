/**
 * Environment-driven configuration for rising-tipster graduation (OB-153).
 *
 * The graduation threshold defaults to the requested rule — win rate >= 60% and
 * at least 20 settled bets — but is configurable so the platform can require a
 * larger, more statistically robust sample before enabling paid gating:
 *   - TIPSTER_GRADUATION_MIN_WIN_RATE_PCT  (default 60)
 *   - TIPSTER_GRADUATION_MIN_SETTLED_BETS  (default 20)
 *
 * Kept Nest/Prisma-free so the parsing can be unit-tested in isolation; the
 * eligibility rule itself lives in the shared, unit-tested graduation engine.
 */
import {
  DEFAULT_GRADUATION_THRESHOLD,
  type GraduationThreshold,
} from '@overlay/shared';

/** Parse a positive number from an env string, else fall back. */
function parsePositive(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Resolve the graduation threshold from the environment. The win-rate value is
 * configured as a percentage (e.g. `60`) for human readability and converted to
 * the fraction the shared engine compares against. A percentage above 100 is
 * clamped to 100 (an unreachable-but-valid 100% rule).
 */
export function resolveGraduationThreshold(
  env: NodeJS.ProcessEnv = process.env,
): GraduationThreshold {
  const winRatePct = parsePositive(
    env.TIPSTER_GRADUATION_MIN_WIN_RATE_PCT,
    DEFAULT_GRADUATION_THRESHOLD.minWinRate * 100,
  );
  const minSettledBets = parsePositive(
    env.TIPSTER_GRADUATION_MIN_SETTLED_BETS,
    DEFAULT_GRADUATION_THRESHOLD.minSettledBets,
  );
  return {
    minWinRate: Math.min(winRatePct, 100) / 100,
    minSettledBets,
  };
}
