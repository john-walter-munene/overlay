import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPORTS_CONFIG,
  parseSportsConfig,
} from './sports-config.ts';

test('parseSportsConfig: empty env → safe defaults', () => {
  assert.deepEqual(parseSportsConfig({}), DEFAULT_SPORTS_CONFIG);
});

test('parseSportsConfig: valid regions are kept and lowercased/deduped', () => {
  const c = parseSportsConfig({ SPORTS_ODDS_REGIONS: 'EU, us , eu' });
  assert.equal(c.regions, 'eu,us');
});

test('parseSportsConfig: unknown regions dropped; all-invalid → default', () => {
  assert.equal(parseSportsConfig({ SPORTS_ODDS_REGIONS: 'mars,eu' }).regions, 'eu');
  assert.equal(parseSportsConfig({ SPORTS_ODDS_REGIONS: 'mars,venus' }).regions, 'eu');
});

test('parseSportsConfig: markets restricted to featured allowlist', () => {
  assert.equal(parseSportsConfig({ SPORTS_FEATURED_MARKETS: 'h2h,player_points' }).markets, 'h2h');
  assert.equal(
    parseSportsConfig({ SPORTS_FEATURED_MARKETS: 'totals,spreads' }).markets,
    'totals,spreads',
  );
  // Props-only config can't inflate background cost — falls back to defaults.
  assert.equal(
    parseSportsConfig({ SPORTS_FEATURED_MARKETS: 'player_points' }).markets,
    DEFAULT_SPORTS_CONFIG.markets,
  );
});

test('parseSportsConfig: eventMarkets off by default, opt-in via allowlist', () => {
  assert.equal(parseSportsConfig({}).eventMarkets, '');
  assert.equal(
    parseSportsConfig({ SPORTS_EVENT_MARKETS: 'btts,draw_no_bet,team_totals' }).eventMarkets,
    'btts,draw_no_bet,team_totals',
  );
  // Unknown/featured keys are stripped; all-invalid → stays off (empty).
  assert.equal(parseSportsConfig({ SPORTS_EVENT_MARKETS: 'btts,h2h' }).eventMarkets, 'btts');
  assert.equal(parseSportsConfig({ SPORTS_EVENT_MARKETS: 'h2h,player_points' }).eventMarkets, '');
});

test('parseSportsConfig: scoresDaysFrom clamped to 1..3', () => {
  assert.equal(parseSportsConfig({ SPORTS_SCORES_DAYS_FROM: '0' }).scoresDaysFrom, 1);
  assert.equal(parseSportsConfig({ SPORTS_SCORES_DAYS_FROM: '9' }).scoresDaysFrom, 3);
  assert.equal(parseSportsConfig({ SPORTS_SCORES_DAYS_FROM: '2' }).scoresDaysFrom, 2);
});

test('parseSportsConfig: scoreStaleMs clamped and defaulted', () => {
  assert.equal(parseSportsConfig({ SPORTS_SCORE_STALE_MS: '500' }).scoreStaleMs, 1_000);
  assert.equal(parseSportsConfig({ SPORTS_SCORE_STALE_MS: 'abc' }).scoreStaleMs, 120_000);
  assert.equal(parseSportsConfig({ SPORTS_SCORE_STALE_MS: '60000' }).scoreStaleMs, 60_000);
});
