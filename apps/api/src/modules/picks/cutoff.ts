/**
 * Pure helpers for late-pick & cutoff hardening (OB-038).
 *
 * Kept free of Nest/Prisma so the config parsing and cutoff evaluation can be
 * unit-tested in isolation. The server clock is authoritative: a pick must land
 * a configurable number of minutes *before* kickoff (not merely before the
 * start-time), with a small clock-skew tolerance, and picks on events with a
 * missing or invalid start time are always rejected.
 */

/** Default lead time (minutes before kickoff) a pick must beat. */
export const DEFAULT_CUTOFF_MINUTES = 10;
/** Default clock-skew tolerance (seconds) granted in the tipster's favour. */
export const DEFAULT_CLOCK_SKEW_SECONDS = 60;

export interface CutoffConfig {
  /** Required lead time before kickoff, in milliseconds. */
  cutoffMs: number;
  /** Clock-skew grace applied in the tipster's favour, in milliseconds. */
  clockSkewMs: number;
}

export type PickTimingResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Parse a non-negative number from an env string, falling back to `fallback`
 * when the value is missing, blank, non-numeric or negative.
 */
function parseNonNegative(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/**
 * Build the cutoff configuration from the environment. `PICK_CUTOFF_MINUTES`
 * sets how long before kickoff picks close (default 10); `PICK_CLOCK_SKEW_SECONDS`
 * sets the tolerance that absorbs small clock differences (default 60).
 */
export function resolveCutoffConfig(
  env: NodeJS.ProcessEnv = process.env,
): CutoffConfig {
  const cutoffMinutes = parseNonNegative(
    env.PICK_CUTOFF_MINUTES,
    DEFAULT_CUTOFF_MINUTES,
  );
  const clockSkewSeconds = parseNonNegative(
    env.PICK_CLOCK_SKEW_SECONDS,
    DEFAULT_CLOCK_SKEW_SECONDS,
  );
  return {
    cutoffMs: cutoffMinutes * 60_000,
    clockSkewMs: clockSkewSeconds * 1_000,
  };
}

/**
 * Decide whether a pick may be locked given the event's kickoff time and the
 * authoritative server clock (`now`, epoch ms). Rejects events with a
 * missing/invalid start time, and rejects picks that arrive at or after the
 * cutoff (kickoff − cutoff), with the clock-skew tolerance extending the
 * deadline slightly in the tipster's favour.
 */
export function evaluatePickCutoff(
  startTime: Date | null | undefined,
  now: number,
  config: CutoffConfig,
): PickTimingResult {
  if (
    !(startTime instanceof Date) ||
    Number.isNaN(startTime.getTime())
  ) {
    return {
      ok: false,
      reason: 'Event has no valid start time; pick rejected',
    };
  }

  const kickoff = startTime.getTime();
  const cutoffAt = kickoff - config.cutoffMs;
  const deadline = cutoffAt + config.clockSkewMs;

  if (now >= deadline) {
    if (now >= kickoff) {
      return {
        ok: false,
        reason: 'Event has already started; pick rejected',
      };
    }
    return {
      ok: false,
      reason: 'Pick cutoff has passed; pick rejected',
    };
  }

  return { ok: true };
}
