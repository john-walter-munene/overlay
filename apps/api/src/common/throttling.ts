/**
 * Rate limiting / abuse protection config (OB-080).
 *
 * A single global throttler (the unnamed `default` bucket) caps every request
 * per client IP. Sensitive routes — auth and state-changing writes such as pick
 * submission — additionally override that bucket with a much stricter budget so
 * credential stuffing and pick-spam bots hit a wall well before the generous
 * global ceiling. Every limit is env-configurable; the window (ttl) is shared.
 *
 * This module is intentionally decorator-free so it can be unit-tested under the
 * `--experimental-strip-types` runner (see throttling.test.ts).
 */

/** A single throttler bucket: `limit` requests allowed per `ttl` milliseconds. */
export interface ThrottleRule {
  ttl: number;
  limit: number;
}

/** Override shape consumed by @nestjs/throttler's `@Throttle` for the default bucket. */
export type ThrottleOverride = { default: ThrottleRule };

/** Shared window all buckets are measured over (1 minute). */
export const DEFAULT_THROTTLE_TTL_MS = 60_000;
/** Global ceiling for ordinary browsing. */
export const DEFAULT_THROTTLE_LIMIT = 120;
/** Auth routes (profile resolution / any future credential route). */
export const DEFAULT_AUTH_THROTTLE_LIMIT = 20;
/** State-changing writes: pick submission, checkout, payout runs, etc. */
export const DEFAULT_WRITE_THROTTLE_LIMIT = 30;

type Env = Record<string, string | undefined>;

/**
 * Parse a positive-integer env var, falling back when it is absent, non-numeric,
 * zero, or negative. Fractional values are floored.
 */
export function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Shared window (ttl, ms) applied to every bucket. */
export function throttleTtlMs(env: Env = process.env): number {
  return parsePositiveInt(env.THROTTLE_TTL_MS, DEFAULT_THROTTLE_TTL_MS);
}

/** Global throttler rule passed to `ThrottlerModule.forRoot`. */
export function globalThrottleRule(env: Env = process.env): ThrottleRule {
  return {
    ttl: throttleTtlMs(env),
    limit: parsePositiveInt(env.THROTTLE_LIMIT, DEFAULT_THROTTLE_LIMIT),
  };
}

/** Stricter per-route override for auth endpoints. */
export function authThrottle(env: Env = process.env): ThrottleOverride {
  return {
    default: {
      ttl: throttleTtlMs(env),
      limit: parsePositiveInt(
        env.THROTTLE_AUTH_LIMIT,
        DEFAULT_AUTH_THROTTLE_LIMIT,
      ),
    },
  };
}

/** Stricter per-route override for state-changing writes. */
export function writeThrottle(env: Env = process.env): ThrottleOverride {
  return {
    default: {
      ttl: throttleTtlMs(env),
      limit: parsePositiveInt(
        env.THROTTLE_WRITE_LIMIT,
        DEFAULT_WRITE_THROTTLE_LIMIT,
      ),
    },
  };
}
