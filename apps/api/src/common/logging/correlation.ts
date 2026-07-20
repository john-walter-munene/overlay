/**
 * Request/job correlation context (OB-091).
 *
 * A single `AsyncLocalStorage` carries the active correlation id across the
 * asynchronous call chain so every log line — whether emitted from a controller,
 * a service, or a background worker cycle — can be tied back to the request or
 * job that triggered it, without threading the id through every function call.
 *
 * Intentionally decorator-free and dependency-free (only Node built-ins) so it
 * runs under the `--experimental-strip-types` unit test runner, mirroring the
 * module-boundary conventions used by `metrics.ts` and `throttling.ts`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/** What kind of unit of work a correlation id identifies. */
export type CorrelationKind = 'request' | 'job';

/** The context stored for the duration of a request or job. */
export interface CorrelationContext {
  /** Stable id shared by every log line emitted while this context is active. */
  correlationId: string;
  /** Whether the id names an HTTP request or a background job/cycle. */
  kind: CorrelationKind;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/** HTTP header used to accept/propagate a caller-supplied correlation id. */
export const CORRELATION_HEADER = 'x-request-id';

/**
 * Run `fn` with the given correlation context active. Everything awaited inside
 * `fn` (and its transitive async continuations) can read the id back via
 * {@link getCorrelationId} / {@link getCorrelationContext}.
 */
export function runWithCorrelation<T>(
  context: CorrelationContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/** The full context for the active request/job, or `undefined` outside one. */
export function getCorrelationContext(): CorrelationContext | undefined {
  return storage.getStore();
}

/** The active correlation id, or `undefined` when none is in scope. */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Normalise a caller-supplied id (e.g. from the `x-request-id` header) into a
 * usable correlation id, generating a fresh UUID when absent, blank, or
 * untrusted. Header values may arrive as `string | string[] | undefined`; a
 * supplied value is only reused when it is a single, reasonably-sized token of
 * safe characters (letters, digits, `-`, `_`, `.`). This bounds the id length
 * and rejects control characters / CR-LF so the value is safe to echo into a
 * response header and into structured logs; anything else yields a new UUID.
 */
export function resolveCorrelationId(
  supplied: string | string[] | undefined,
): string {
  const value = Array.isArray(supplied) ? supplied[0] : supplied;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return isSafeCorrelationId(trimmed) ? trimmed : randomUUID();
}

/** Max accepted length for a caller-supplied correlation id. */
export const MAX_CORRELATION_ID_LENGTH = 128;

/** Safe token charset for a correlation id: letters, digits, `-`, `_`, `.`. */
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]+$/;

/** True when a supplied id is a non-empty, bounded, safe-charset token. */
export function isSafeCorrelationId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_CORRELATION_ID_LENGTH &&
    SAFE_CORRELATION_ID.test(value)
  );
}

/** Mint a fresh correlation id (used for background jobs with no inbound id). */
export function newCorrelationId(): string {
  return randomUUID();
}
