import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS_PAGE_DEFAULT,
  EVENTS_PAGE_MAX,
  deriveEventStatus,
  isScoreStale,
  normalizeEventQuery,
  resolveSportKeysForGroup,
  sportGroupIndex,
  toEventSummary,
  type EventRowLike,
} from './events.query.ts';

const NOW = Date.parse('2026-07-27T12:00:00Z');

const row = (over: Partial<EventRowLike> = {}): EventRowLike => ({
  id: 'e1',
  sport: 'soccer_epl',
  league: 'EPL',
  home: 'Home',
  away: 'Away',
  startTime: new Date('2026-07-27T15:00:00Z'),
  status: 'scheduled',
  liveHomeScore: null,
  liveAwayScore: null,
  ...over,
});

// ── normalizeEventQuery ─────────────────────────────────────────────────────

test('normalizeEventQuery: defaults to upcoming + default page', () => {
  const q = normalizeEventQuery();
  assert.equal(q.status, 'upcoming');
  assert.equal(q.limit, EVENTS_PAGE_DEFAULT);
  assert.equal(q.offset, 0);
});

test('normalizeEventQuery: clamps limit to the max and offset to >= 0', () => {
  assert.equal(normalizeEventQuery({ limit: 9999 }).limit, EVENTS_PAGE_MAX);
  assert.equal(normalizeEventQuery({ limit: 0 }).limit, 1);
  assert.equal(normalizeEventQuery({ offset: -5 }).offset, 0);
});

test('normalizeEventQuery: invalid status falls back to upcoming', () => {
  assert.equal(normalizeEventQuery({ status: 'garbage' }).status, 'upcoming');
  assert.equal(normalizeEventQuery({ status: 'live' }).status, 'live');
  assert.equal(normalizeEventQuery({ status: 'all' }).status, 'all');
});

test('normalizeEventQuery: trims strings and lowercases bookmaker', () => {
  const q = normalizeEventQuery({ sport: '  soccer_epl ', bookmaker: ' DraftKings ', q: '  ' });
  assert.equal(q.sport, 'soccer_epl');
  assert.equal(q.bookmaker, 'draftkings');
  assert.equal(q.q, undefined);
});

test('normalizeEventQuery: parses valid dates and ignores invalid', () => {
  const q = normalizeEventQuery({ startFrom: '2026-07-27T00:00:00Z', startTo: 'nonsense' });
  assert.ok(q.startFrom instanceof Date);
  assert.equal(q.startTo, undefined);
});

// ── deriveEventStatus ───────────────────────────────────────────────────────

test('deriveEventStatus: finished → completed', () => {
  assert.equal(deriveEventStatus(row({ status: 'finished' }), NOW), 'completed');
});

test('deriveEventStatus: kicked off but not finished → live', () => {
  assert.equal(
    deriveEventStatus(row({ startTime: new Date('2026-07-27T11:00:00Z') }), NOW),
    'live',
  );
});

test('deriveEventStatus: future start → upcoming', () => {
  assert.equal(deriveEventStatus(row(), NOW), 'upcoming');
});

// ── group resolution ────────────────────────────────────────────────────────

const catalog = [
  { key: 'soccer_epl', group: 'Soccer' },
  { key: 'soccer_mls', group: 'Soccer' },
  { key: 'basketball_nba', group: 'Basketball' },
];

test('resolveSportKeysForGroup: case-insensitive group → keys', () => {
  assert.deepEqual(resolveSportKeysForGroup('soccer', catalog).sort(), ['soccer_epl', 'soccer_mls']);
  assert.deepEqual(resolveSportKeysForGroup('Basketball', catalog), ['basketball_nba']);
});

test('resolveSportKeysForGroup: unknown group → empty', () => {
  assert.deepEqual(resolveSportKeysForGroup('cricket', catalog), []);
});

test('sportGroupIndex maps each key to its group', () => {
  const idx = sportGroupIndex(catalog);
  assert.equal(idx.get('soccer_epl'), 'Soccer');
  assert.equal(idx.get('basketball_nba'), 'Basketball');
});

// ── toEventSummary ──────────────────────────────────────────────────────────

test('toEventSummary: annotates group + normalizes status + omits missing score', () => {
  const s = toEventSummary(row(), NOW, sportGroupIndex(catalog));
  assert.equal(s.sportGroup, 'Soccer');
  assert.equal(s.status, 'upcoming');
  assert.equal(s.score, null);
  assert.equal(s.startTime, '2026-07-27T15:00:00.000Z');
});

test('toEventSummary: includes a live score when present', () => {
  const s = toEventSummary(
    row({ startTime: new Date('2026-07-27T11:00:00Z'), liveHomeScore: 2, liveAwayScore: 1 }),
    NOW,
    sportGroupIndex(catalog),
  );
  assert.equal(s.status, 'live');
  assert.deepEqual(s.score, { home: 2, away: 1 });
});

test('toEventSummary: null group when sport not in catalog', () => {
  const s = toEventSummary(row({ sport: 'unknown_sport' }), NOW, sportGroupIndex(catalog));
  assert.equal(s.sportGroup, null);
});

// ── isScoreStale ────────────────────────────────────────────────────────────

test('isScoreStale: null/invalid timestamps are stale', () => {
  assert.equal(isScoreStale(null, NOW), true);
  assert.equal(isScoreStale('nonsense', NOW), true);
});

test('isScoreStale: recent updates are fresh, old ones stale', () => {
  assert.equal(isScoreStale(new Date(NOW - 30_000), NOW), false);
  assert.equal(isScoreStale(new Date(NOW - 300_000), NOW), true);
});
