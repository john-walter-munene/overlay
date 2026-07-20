import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CLOCK_SKEW_SECONDS,
  DEFAULT_CUTOFF_MINUTES,
  evaluatePickCutoff,
  evaluatePickTiming,
  resolveCutoffConfig,
  type CutoffConfig,
  type PickTimingEvent,
} from './cutoff.ts';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const beforeKickoff: PickTimingEvent = {
  startTime: new Date(NOW + 60 * 60 * 1000), // kicks off in 1h
  status: 'scheduled',
};
const afterKickoff: PickTimingEvent = {
  startTime: new Date(NOW - 60 * 60 * 1000), // started 1h ago
  status: 'scheduled',
};
const finished: PickTimingEvent = {
  startTime: new Date(NOW - 3 * 60 * 60 * 1000),
  status: 'finished',
};

test('pre_match: accepted before kickoff', () => {
  assert.deepEqual(evaluatePickTiming('pre_match', beforeKickoff, NOW), {
    ok: true,
  });
});

test('pre_match: rejected once the event has started (OB-038 cutoff)', () => {
  const res = evaluatePickTiming('pre_match', afterKickoff, NOW);
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /already started/);
});

test('live: accepted after kickoff while the game is in play (OB-039)', () => {
  assert.deepEqual(evaluatePickTiming('live', afterKickoff, NOW), { ok: true });
});

test('live: also accepted before kickoff', () => {
  assert.deepEqual(evaluatePickTiming('live', beforeKickoff, NOW), { ok: true });
});

test('live: rejected once the event has finished', () => {
  const res = evaluatePickTiming('live', finished, NOW);
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /already finished/);
});

test('rejects an event with no valid start time', () => {
  const res = evaluatePickTiming('pre_match', { startTime: null }, NOW);
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /no valid start time/);
});

test('boundary: pick exactly at kickoff is a late pre_match pick', () => {
  const atKickoff: PickTimingEvent = {
    startTime: new Date(NOW),
    status: 'scheduled',
  };
  assert.equal(evaluatePickTiming('pre_match', atKickoff, NOW).ok, false);
  assert.equal(evaluatePickTiming('live', atKickoff, NOW).ok, true);
});

test('live: rejected once the running score has already decided the market (OB-039)', () => {
  const inPlay: PickTimingEvent = {
    startTime: new Date(NOW - 60 * 60 * 1000),
    status: 'scheduled',
    liveHomeScore: 2,
    liveAwayScore: 1,
  };
  // Over 2.5 is a foregone win with 3 goals already in — not a live wager.
  const overRes = evaluatePickTiming('live', inPlay, NOW, {
    market: 'totals',
    selection: 'over 2.5',
  });
  assert.equal(overRes.ok, false);
  assert.match((overRes as { reason: string }).reason, /already decided/);

  // BTTS is settled once both teams have scored.
  const bttsRes = evaluatePickTiming('live', inPlay, NOW, {
    market: 'btts',
    selection: 'yes',
  });
  assert.equal(bttsRes.ok, false);

  // A market that's still open (winner can change) is accepted.
  assert.equal(
    evaluatePickTiming('live', inPlay, NOW, { market: '1X2', selection: 'home' })
      .ok,
    true,
  );
});

test('live: allowed when no in-play score is known yet (OB-039)', () => {
  const noScore: PickTimingEvent = {
    startTime: new Date(NOW - 60 * 60 * 1000),
    status: 'scheduled',
  };
  assert.equal(
    evaluatePickTiming('live', noScore, NOW, {
      market: 'totals',
      selection: 'over 2.5',
    }).ok,
    true,
  );
});

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
