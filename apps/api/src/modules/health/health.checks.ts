/**
 * Pure, decorator-free readiness helpers (OB-092). Kept free of Nest
 * decorators / parameter properties so they run under the
 * `--experimental-strip-types` unit test runner, and so the controller stays a
 * thin adapter over testable logic.
 */

/** Result of a single dependency probe. */
export type CheckState = 'ok' | 'down';

/** The dependencies a readiness probe verifies. */
export interface ReadinessChecks {
  database: CheckState;
  redis: CheckState;
}

export interface ReadinessResult {
  status: 'ok' | 'degraded';
  checks: ReadinessChecks;
}

/** Default per-dependency probe timeout; a slow dependency reads as `down`. */
export const DEFAULT_CHECK_TIMEOUT_MS = 2_000;

/**
 * Collapse the individual dependency states into an overall readiness verdict.
 * Ready only when every dependency is `ok`; otherwise `degraded` so the
 * orchestrator stops routing traffic to this instance.
 */
export function summarizeReadiness(checks: ReadinessChecks): ReadinessResult {
  const ready = checks.database === 'ok' && checks.redis === 'ok';
  return { status: ready ? 'ok' : 'degraded', checks };
}

/**
 * Race a probe against a timeout, mapping success to `ok` and any failure or
 * timeout to `down`. Never throws — a readiness endpoint must always answer.
 */
export async function runCheck(
  probe: () => Promise<unknown>,
  timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
): Promise<CheckState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('check timed out')), timeoutMs);
      timer.unref?.();
    });
    await Promise.race([probe(), timeout]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run the DB + Redis probes concurrently and summarize the result. Both probes
 * are supplied by the caller so this stays I/O-agnostic and unit-testable.
 */
export async function evaluateReadiness(
  probes: {
    database: () => Promise<unknown>;
    redis: () => Promise<unknown>;
  },
  timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
): Promise<ReadinessResult> {
  const [database, redis] = await Promise.all([
    runCheck(probes.database, timeoutMs),
    runCheck(probes.redis, timeoutMs),
  ]);
  return summarizeReadiness({ database, redis });
}
