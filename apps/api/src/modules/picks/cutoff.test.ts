import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePickTiming, type PickTimingEvent } from './cutoff.ts';

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
