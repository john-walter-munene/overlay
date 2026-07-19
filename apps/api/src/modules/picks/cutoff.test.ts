import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CLOCK_SKEW_SECONDS,
  DEFAULT_CUTOFF_MINUTES,
  evaluatePickCutoff,
  resolveCutoffConfig,
  type CutoffConfig,
} from './cutoff.ts';

const config: CutoffConfig = { cutoffMs: 10 * 60_000, clockSkewMs: 60_000 };
const kickoff = new Date('2030-01-01T12:00:00Z');
const kickoffMs = kickoff.getTime();

test('resolveCutoffConfig: defaults when env is unset', () => {
  const c = resolveCutoffConfig({});
  assert.equal(c.cutoffMs, DEFAULT_CUTOFF_MINUTES * 60_000);
  assert.equal(c.clockSkewMs, DEFAULT_CLOCK_SKEW_SECONDS * 1_000);
});

test('resolveCutoffConfig: reads configured values', () => {
  const c = resolveCutoffConfig({
    PICK_CUTOFF_MINUTES: '15',
    PICK_CLOCK_SKEW_SECONDS: '30',
  });
  assert.equal(c.cutoffMs, 15 * 60_000);
  assert.equal(c.clockSkewMs, 30 * 1_000);
});

test('resolveCutoffConfig: falls back on blank/invalid/negative', () => {
  assert.equal(
    resolveCutoffConfig({ PICK_CUTOFF_MINUTES: '  ' }).cutoffMs,
    DEFAULT_CUTOFF_MINUTES * 60_000,
  );
  assert.equal(
    resolveCutoffConfig({ PICK_CUTOFF_MINUTES: 'abc' }).cutoffMs,
    DEFAULT_CUTOFF_MINUTES * 60_000,
  );
  assert.equal(
    resolveCutoffConfig({ PICK_CLOCK_SKEW_SECONDS: '-5' }).clockSkewMs,
    DEFAULT_CLOCK_SKEW_SECONDS * 1_000,
  );
});

test('resolveCutoffConfig: allows a zero cutoff / skew', () => {
  const c = resolveCutoffConfig({
    PICK_CUTOFF_MINUTES: '0',
    PICK_CLOCK_SKEW_SECONDS: '0',
  });
  assert.equal(c.cutoffMs, 0);
  assert.equal(c.clockSkewMs, 0);
});

test('evaluatePickCutoff: accepts a pick comfortably before cutoff', () => {
  const now = kickoffMs - 20 * 60_000;
  assert.deepEqual(evaluatePickCutoff(kickoff, now, config), { ok: true });
});

test('evaluatePickCutoff: rejects at the cutoff boundary', () => {
  // Deadline = kickoff - cutoff + skew. now exactly at the deadline is rejected.
  const deadline = kickoffMs - config.cutoffMs + config.clockSkewMs;
  const res = evaluatePickCutoff(kickoff, deadline, config);
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /cutoff/i);
});

test('evaluatePickCutoff: accepts one ms before the deadline', () => {
  const deadline = kickoffMs - config.cutoffMs + config.clockSkewMs;
  assert.deepEqual(evaluatePickCutoff(kickoff, deadline - 1, config), {
    ok: true,
  });
});

test('evaluatePickCutoff: clock-skew tolerance extends the deadline', () => {
  // Just past the raw cutoff but within the skew grace → still accepted.
  const justPastCutoff = kickoffMs - config.cutoffMs + 30_000;
  assert.deepEqual(evaluatePickCutoff(kickoff, justPastCutoff, config), {
    ok: true,
  });
});

test('evaluatePickCutoff: reports already-started once past kickoff', () => {
  const res = evaluatePickCutoff(kickoff, kickoffMs + 1, config);
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /already started/i);
});

test('evaluatePickCutoff: rejects a missing start time', () => {
  const res = evaluatePickCutoff(null, kickoffMs - 60 * 60_000, config);
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /start time/i);
});

test('evaluatePickCutoff: rejects an invalid start time', () => {
  const res = evaluatePickCutoff(
    new Date('not-a-date'),
    kickoffMs - 60 * 60_000,
    config,
  );
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /start time/i);
});
