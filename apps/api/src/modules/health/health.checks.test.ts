import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateReadiness,
  runCheck,
  summarizeReadiness,
} from './health.checks.ts';

test('summarizeReadiness is ok only when every dependency is ok', () => {
  assert.deepEqual(summarizeReadiness({ database: 'ok', redis: 'ok' }), {
    status: 'ok',
    checks: { database: 'ok', redis: 'ok' },
  });
});

test('summarizeReadiness degrades when the database is down', () => {
  const result = summarizeReadiness({ database: 'down', redis: 'ok' });
  assert.equal(result.status, 'degraded');
  assert.equal(result.checks.database, 'down');
});

test('summarizeReadiness degrades when redis is down', () => {
  const result = summarizeReadiness({ database: 'ok', redis: 'down' });
  assert.equal(result.status, 'degraded');
  assert.equal(result.checks.redis, 'down');
});

test('runCheck reports ok when the probe resolves', async () => {
  assert.equal(await runCheck(async () => 'PONG'), 'ok');
});

test('runCheck reports down when the probe rejects', async () => {
  assert.equal(
    await runCheck(async () => {
      throw new Error('ECONNREFUSED');
    }),
    'down',
  );
});

test('runCheck reports down when the probe exceeds the timeout', async () => {
  const slow = () => new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await runCheck(slow, 5), 'down');
});

test('evaluateReadiness runs both probes and degrades when DB is down', async () => {
  const result = await evaluateReadiness({
    database: async () => {
      throw new Error('db unreachable');
    },
    redis: async () => 'PONG',
  });
  assert.deepEqual(result, {
    status: 'degraded',
    checks: { database: 'down', redis: 'ok' },
  });
});

test('evaluateReadiness is ok when both probes succeed', async () => {
  const result = await evaluateReadiness({
    database: async () => [{ '?column?': 1 }],
    redis: async () => 'PONG',
  });
  assert.equal(result.status, 'ok');
});
