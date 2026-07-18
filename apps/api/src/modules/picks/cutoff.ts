/**
 * Pure, framework-free timing gate for pick submission (OB-038 / OB-039).
 *
 * Kept decorator- and Prisma-free so it can be exercised directly by the
 * unit-test runner (`node --experimental-strip-types`). The Nest service calls
 * {@link evaluatePickTiming} with the event's start time / status and the
 * requested pick type, then throws the matching HTTP error.
 *
 * The rule (see docs/LIVE-PICKS.md §3):
 *   - `pre_match` picks are rejected once the event has started (the OB-038
 *     kickoff cutoff) — this is the integrity moat for the pre-match book.
 *   - `live` (in-play) picks bypass the kickoff cutoff but are still rejected
 *     once the event has finished — you can't place an in-play wager on a game
 *     that's already over.
 */

import type { PickType } from '@overlay/shared';

/** Minimal event shape the timing gate needs. */
export interface PickTimingEvent {
  /** Kickoff time. `null`/invalid means the start time is unknown. */
  startTime: Date | null;
  /** Event lifecycle status, e.g. `scheduled` | `finished`. */
  status?: string;
}

export type PickTimingResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Decide whether a pick may be locked right now. Pure and deterministic — the
 * caller supplies `now` (defaults to the trusted server clock) so it can be
 * pinned in tests.
 */
export function evaluatePickTiming(
  pickType: PickType,
  event: PickTimingEvent,
  now: number = Date.now(),
): PickTimingResult {
  const start = event.startTime?.getTime();
  if (start === undefined || Number.isNaN(start)) {
    return { ok: false, reason: 'Event has no valid start time; pick rejected' };
  }

  const started = start <= now;
  const finished = event.status === 'finished';

  if (pickType === 'live') {
    // In-play picks bypass the kickoff cutoff, but the game must still be live.
    if (finished) {
      return {
        ok: false,
        reason: 'Event has already finished; live pick rejected',
      };
    }
    return { ok: true };
  }

  // Pre-match picks honour the OB-038 cutoff.
  if (started) {
    return {
      ok: false,
      reason: 'Event has already started; pick rejected',
    };
  }
  return { ok: true };
}
