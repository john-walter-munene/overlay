import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeFixture,
  isFinished,
  mapFixtures,
  toEventResult,
  type ApiFootballFixture,
} from './api-football.mapper.ts';

const fixture = (
  h: number | null,
  a: number | null,
  status = 'FT',
): ApiFootballFixture => ({
  fixture: { id: 42, date: '2030-01-01T12:00:00Z', status: { short: status } },
  league: { name: 'Test League' },
  teams: { home: { name: 'H' }, away: { name: 'A' } },
  goals: { home: h, away: a },
});

test('isFinished recognizes terminal statuses', () => {
  assert.equal(isFinished('FT'), true);
  assert.equal(isFinished('AET'), true);
  assert.equal(isFinished('NS'), false);
});

test('mapFixtures normalizes vendor fields', () => {
  const [e] = mapFixtures([fixture(1, 0)]);
  assert.equal(e.vendorEventId, '42');
  assert.equal(e.home, 'H');
  assert.equal(e.league, 'Test League');
});

test('gradeFixture: home win / away lose', () => {
  assert.equal(gradeFixture(fixture(2, 0), '1X2', 'home'), 'won');
  assert.equal(gradeFixture(fixture(2, 0), '1X2', 'away'), 'lost');
});

test('gradeFixture: draw', () => {
  assert.equal(gradeFixture(fixture(1, 1), '1X2', 'draw'), 'won');
});

test('gradeFixture: moneyline draw voids', () => {
  assert.equal(gradeFixture(fixture(1, 1), 'moneyline', 'home'), 'void');
});

test('gradeFixture: unfinished or missing goals → void', () => {
  assert.equal(gradeFixture(fixture(1, 0, 'NS'), '1X2', 'home'), 'void');
  assert.equal(gradeFixture(fixture(null, null), '1X2', 'home'), 'void');
});

test('toEventResult wires grade closure', () => {
  const r = toEventResult(fixture(3, 1));
  assert.equal(r.vendorEventId, '42');
  assert.equal(r.grade('1X2', 'home'), 'won');
});
