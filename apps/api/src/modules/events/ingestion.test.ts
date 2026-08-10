import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIngestAll,
  isValidProviderEvent,
  parseIngestSports,
  resolveIngestSports,
} from './ingestion.ts';
import type { ProviderEvent } from '../../integrations/sports/sports-provider.interface.ts';

function event(over: Partial<ProviderEvent> = {}): ProviderEvent {
  return {
    vendorEventId: 'soccer_epl:evt1',
    sport: 'soccer_epl',
    league: 'EPL',
    home: 'Arsenal',
    away: 'Chelsea',
    startTime: new Date('2030-01-01T12:00:00Z'),
    ...over,
  };
}

test('parseIngestSports: splits, trims, dedupes, drops empties', () => {
  assert.deepEqual(
    parseIngestSports('soccer_epl, basketball_nba , soccer_epl,,'),
    ['soccer_epl', 'basketball_nba'],
  );
  assert.deepEqual(parseIngestSports(''), []);
  assert.deepEqual(parseIngestSports(undefined), []);
  assert.deepEqual(parseIngestSports('   '), []);
});

test('isIngestAll: true for all/* (any case), false otherwise', () => {
  assert.equal(isIngestAll('all'), true);
  assert.equal(isIngestAll(' ALL '), true);
  assert.equal(isIngestAll('*'), true);
  assert.equal(isIngestAll('soccer_epl'), false);
  assert.equal(isIngestAll(''), false);
  assert.equal(isIngestAll(undefined), false);
});

const catalog = [
  { key: 'soccer_epl', active: true, hasOutrights: false },
  { key: 'basketball_nba', active: true, hasOutrights: false },
  { key: 'soccer_out_of_season', active: false, hasOutrights: false },
  { key: 'golf_masters_winner', active: true, hasOutrights: true },
];

test('resolveIngestSports: explicit list ignores the catalog', () => {
  assert.deepEqual(
    resolveIngestSports('soccer_epl,basketball_nba', catalog),
    ['soccer_epl', 'basketball_nba'],
  );
});

test('resolveIngestSports: all → active, non-outright catalog keys', () => {
  assert.deepEqual(resolveIngestSports('all', catalog), ['soccer_epl', 'basketball_nba']);
});

test('resolveIngestSports: all + includeOutrights keeps futures', () => {
  assert.deepEqual(
    resolveIngestSports('*', catalog, { includeOutrights: true }).sort(),
    ['basketball_nba', 'golf_masters_winner', 'soccer_epl'],
  );
});

test('resolveIngestSports: all with empty catalog → empty', () => {
  assert.deepEqual(resolveIngestSports('all', []), []);
});

test('isValidProviderEvent: accepts a well-formed event', () => {
  assert.equal(isValidProviderEvent(event()), true);
});

test('isValidProviderEvent: rejects missing ids / blank teams', () => {
  assert.equal(isValidProviderEvent(event({ vendorEventId: '' })), false);
  assert.equal(isValidProviderEvent(event({ home: '  ' })), false);
  assert.equal(isValidProviderEvent(event({ away: '' })), false);
  assert.equal(isValidProviderEvent(event({ sport: '' })), false);
});

test('isValidProviderEvent: rejects an invalid start time', () => {
  assert.equal(
    isValidProviderEvent(event({ startTime: new Date('not-a-date') })),
    false,
  );
});
