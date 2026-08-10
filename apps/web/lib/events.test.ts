import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventsQuery, sportGroups, type ProviderSport } from './events.ts';

test('buildEventsQuery: omits empty values', () => {
  assert.equal(buildEventsQuery({}), '');
  assert.equal(buildEventsQuery({ sport: '', q: '   ' }), '');
});

test('buildEventsQuery: serializes set filters', () => {
  const qs = buildEventsQuery({ group: 'Soccer', status: 'live', q: 'arsenal' });
  const p = new URLSearchParams(qs);
  assert.equal(p.get('group'), 'Soccer');
  assert.equal(p.get('status'), 'live');
  assert.equal(p.get('q'), 'arsenal');
});

test('buildEventsQuery: includes limit but omits zero offset', () => {
  const p = new URLSearchParams(buildEventsQuery({ limit: 25, offset: 0 }));
  assert.equal(p.get('limit'), '25');
  assert.equal(p.get('offset'), null);
  const p2 = new URLSearchParams(buildEventsQuery({ limit: 25, offset: 50 }));
  assert.equal(p2.get('offset'), '50');
});

test('buildEventsQuery: trims values', () => {
  const p = new URLSearchParams(buildEventsQuery({ sport: '  soccer_epl  ' }));
  assert.equal(p.get('sport'), 'soccer_epl');
});

test('sportGroups: distinct active groups, sorted', () => {
  const catalog: ProviderSport[] = [
    { key: 'soccer_epl', group: 'Soccer', title: 'EPL', active: true, hasOutrights: false },
    { key: 'soccer_mls', group: 'Soccer', title: 'MLS', active: true, hasOutrights: false },
    { key: 'basketball_nba', group: 'Basketball', title: 'NBA', active: true, hasOutrights: false },
    { key: 'tennis_atp', group: 'Tennis', title: 'ATP', active: false, hasOutrights: false },
  ];
  assert.deepEqual(sportGroups(catalog), ['Basketball', 'Soccer']);
});
