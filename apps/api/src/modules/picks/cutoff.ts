/**
 * Pure, framework-free timing gate for pick submission (OB-038 / OB-039).
 *
 * Kept decorator- and Prisma-free so it can be exercised directly by the
 * unit-test runner (`node --experimental-strip-types`). The Nest service calls
 * {@link evaluatePickTiming} with the event's start time / status / in-play
 * score and the requested pick type, then throws the matching HTTP error.
 *
 * The rules (see docs/LIVE-PICKS.md §3):
 *   - `pre_match` picks honour the OB-038 kickoff cutoff: they must land a
 *     configurable number of minutes *before* kickoff (server clock is
 *     authoritative), with a small clock-skew tolerance in the tipster's
 *     favour. This is the integrity moat for the pre-match book.
 *   - `live` (in-play) picks bypass the kickoff cutoff, but are rejected once
 *     the event has finished — you can't wager on a game that's already over —
 *     or once the running score has already decided the market (OB-039 review
 *     follow-up: e.g. Over 2.5 with 3 goals in, BTTS once both sides scored).
 */

import type { PickType } from '@overlay/shared';
import { isMarketDecidedInPlay } from '@overlay/shared';

/** Minimal event shape the timing gate needs. */
export interface PickTimingEvent {
  /** Kickoff time. `null`/invalid means the start time is unknown. */
  startTime: Date | null;
  /** Event lifecycle status, e.g. `scheduled` | `finished`. */
  status?: string;
  /** Latest known in-play home score, or `null` if none observed yet. */
  liveHomeScore?: number | null;
  /** Latest known in-play away score, or `null` if none observed yet. */
  liveAwayScore?: number | null;
}

/** The wager a live pick is being placed on (for the in-play "already decided" check). */
export interface PickWager {
  market: string;
  selection: string;
}

/** Default lead time (minutes before kickoff) a pre-match pick must beat. */
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
 * Decide whether a PRE-MATCH pick may be locked given the event's kickoff time
 * and the authoritative server clock (`now`, epoch ms). Rejects events with a
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

/**
 * Decide whether a pick may be locked right now, honouring its `pickType`. Pure
 * and deterministic — the caller supplies `now` (defaults to the trusted server
 * clock) so it can be pinned in tests.
 *
 *   - `pre_match` → delegates to {@link evaluatePickCutoff} (OB-038 cutoff).
 *   - `live`      → bypasses the cutoff, but is rejected once the event has
 *     finished or once `wager` + the event's in-play score show the market is
 *     already decided (OB-039).
 */
export function evaluatePickTiming(
  pickType: PickType,
  event: PickTimingEvent,
  now: number = Date.now(),
  wager?: PickWager,
  config: CutoffConfig = resolveCutoffConfig(),
): PickTimingResult {
  const start = event.startTime?.getTime();
  if (start === undefined || Number.isNaN(start)) {
    return { ok: false, reason: 'Event has no valid start time; pick rejected' };
  }

  if (pickType === 'live') {
    // In-play picks bypass the kickoff cutoff, but the game must still be live.
    if (event.status === 'finished') {
      return {
        ok: false,
        reason: 'Event has already finished; live pick rejected',
      };
    }
    // ...and the market must still be genuinely open: reject a live pick on an
    // outcome the running score has already settled (e.g. Over 2.5 once 3 goals
    // are in, BTTS once both sides have scored).
    if (
      wager &&
      event.liveHomeScore != null &&
      event.liveAwayScore != null &&
      isMarketDecidedInPlay(
        wager.market,
        wager.selection,
        event.liveHomeScore,
        event.liveAwayScore,
      )
    ) {
      return {
        ok: false,
        reason:
          'Market is already decided by the current score; live pick rejected',
      };
    }
    return { ok: true };
  }

  // Pre-match picks honour the OB-038 configurable kickoff cutoff.
  return evaluatePickCutoff(event.startTime, now, config);
}
