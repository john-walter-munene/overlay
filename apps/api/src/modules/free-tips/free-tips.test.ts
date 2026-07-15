import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFreeTipsForDate, toPublicFreeTip } from './free-tips.ts';

function row(overrides = {}) {
  return {
    id: 'ft1',
    tipDate: new Date('2026-03-04T00:00:00.000Z'),
    sport: 'Football',
    league: 'Premier League',
    match: 'Arsenal vs Chelsea',
    market: '1X2',
    selection: 'Arsenal',
    odds: 1.9,
    analysis: 'Home form is strong.',
    sortOrder: 0,
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
    ...overrides,
  };
}

test('toPublicFreeTip maps tipDate to a UTC ISO date and drops internal fields', () => {
  const pub = toPublicFreeTip(row({ tipDate: new Date('2026-03-04T23:59:00.000Z') }));
  assert.equal(pub.date, '2026-03-04');
  assert.equal(pub.id, 'ft1');
  assert.equal(pub.match, 'Arsenal vs Chelsea');
  assert.equal(pub.odds, 1.9);
  assert.ok(!('createdAt' in pub));
  assert.ok(!('sortOrder' in pub));
});

test('toPublicFreeTip preserves null optional fields', () => {
  const pub = toPublicFreeTip(row({ league: null, odds: null, analysis: null }));
  assert.equal(pub.league, null);
  assert.equal(pub.odds, null);
  assert.equal(pub.analysis, null);
});

test('buildFreeTipsForDate wraps tips with the requested date', () => {
  const payload = buildFreeTipsForDate('2026-03-04', [row(), row({ id: 'ft2' })]);
  assert.equal(payload.date, '2026-03-04');
  assert.equal(payload.tips.length, 2);
  assert.deepEqual(
    payload.tips.map((t) => t.id),
    ['ft1', 'ft2'],
  );
});

test('buildFreeTipsForDate returns an empty list for a day with no tips', () => {
  const payload = buildFreeTipsForDate('2026-03-05', []);
  assert.deepEqual(payload, { date: '2026-03-05', tips: [] });
});
