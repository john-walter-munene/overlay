import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_MS,
  DEFAULT_WRITE_THROTTLE_LIMIT,
  authThrottle,
  globalThrottleRule,
  parsePositiveInt,
  throttleTtlMs,
  writeThrottle,
} from './throttling.ts';

test('parsePositiveInt: falls back for missing/invalid/non-positive values', () => {
  assert.equal(parsePositiveInt(undefined, 10), 10);
  assert.equal(parsePositiveInt('', 10), 10);
  assert.equal(parsePositiveInt('abc', 10), 10);
  assert.equal(parsePositiveInt('0', 10), 10);
  assert.equal(parsePositiveInt('-5', 10), 10);
});

test('parsePositiveInt: parses and floors positive values', () => {
  assert.equal(parsePositiveInt('42', 10), 42);
  assert.equal(parsePositiveInt('7.9', 10), 7);
});

test('globalThrottleRule: safe defaults with empty env', () => {
  assert.deepEqual(globalThrottleRule({}), {
    ttl: DEFAULT_THROTTLE_TTL_MS,
    limit: DEFAULT_THROTTLE_LIMIT,
  });
});

test('globalThrottleRule: honours env overrides', () => {
  const rule = globalThrottleRule({
    THROTTLE_TTL_MS: '30000',
    THROTTLE_LIMIT: '200',
  });
  assert.deepEqual(rule, { ttl: 30000, limit: 200 });
});

test('throttleTtlMs: shared window is reused by every bucket', () => {
  const env = { THROTTLE_TTL_MS: '15000' };
  assert.equal(throttleTtlMs(env), 15000);
  assert.equal(globalThrottleRule(env).ttl, 15000);
  assert.equal(authThrottle(env).default.ttl, 15000);
  assert.equal(writeThrottle(env).default.ttl, 15000);
});

test('authThrottle: stricter default, env-configurable', () => {
  assert.deepEqual(authThrottle({}), {
    default: { ttl: DEFAULT_THROTTLE_TTL_MS, limit: DEFAULT_AUTH_THROTTLE_LIMIT },
  });
  assert.equal(authThrottle({ THROTTLE_AUTH_LIMIT: '5' }).default.limit, 5);
});

test('writeThrottle: stricter default, env-configurable', () => {
  assert.deepEqual(writeThrottle({}), {
    default: { ttl: DEFAULT_THROTTLE_TTL_MS, limit: DEFAULT_WRITE_THROTTLE_LIMIT },
  });
  assert.equal(writeThrottle({ THROTTLE_WRITE_LIMIT: '3' }).default.limit, 3);
});

test('sensitive routes are stricter than the global ceiling by default', () => {
  assert.ok(DEFAULT_AUTH_THROTTLE_LIMIT < DEFAULT_THROTTLE_LIMIT);
  assert.ok(DEFAULT_WRITE_THROTTLE_LIMIT < DEFAULT_THROTTLE_LIMIT);
});
