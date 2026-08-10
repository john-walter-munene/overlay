import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_MARKETS,
  FEATURED_MARKETS,
  classifyProviderMarket,
  isPickableMarket,
  isPickableProviderMarket,
  isSettleableMarket,
  pickableCanonicalMarkets,
  humanizeMarketKey,
} from './markets.ts';
import { SUPPORTED_MARKETS } from './grading.ts';

// ── Drift guards: the registry and the grader must never diverge ────────────

test('pickable canonical markets are exactly SUPPORTED_MARKETS', () => {
  assert.deepEqual(
    [...pickableCanonicalMarkets()].sort(),
    [...SUPPORTED_MARKETS].sort(),
  );
});

test('every SUPPORTED_MARKET has a canonical registry entry', () => {
  for (const m of SUPPORTED_MARKETS) {
    assert.ok(CANONICAL_MARKETS[m], `missing registry entry for ${m}`);
    assert.equal(CANONICAL_MARKETS[m].key, m);
  }
});

test('every canonical market is displayable + pickable + settleable', () => {
  for (const def of Object.values(CANONICAL_MARKETS)) {
    assert.ok(def.capabilities.includes('displayable'));
    assert.ok(def.capabilities.includes('pickable'));
    assert.ok(def.capabilities.includes('settleable'));
  }
});

test('featured markets are exactly h2h-family + spreads + totals', () => {
  assert.deepEqual([...FEATURED_MARKETS].sort(), ['1X2', 'moneyline', 'spreads', 'totals'].sort());
});

// ── Capability helpers ──────────────────────────────────────────────────────

test('isPickableMarket / isSettleableMarket accept canonical markets', () => {
  assert.ok(isPickableMarket('1X2'));
  assert.ok(isPickableMarket('totals'));
  assert.ok(isPickableMarket('btts'));
  assert.ok(isSettleableMarket('correct_score'));
});

test('isPickableMarket rejects non-canonical / prop markets', () => {
  assert.equal(isPickableMarket('player_points'), false);
  assert.equal(isPickableMarket('h2h'), false); // provider key, not canonical
  assert.equal(isPickableMarket('nonsense'), false);
});

// ── Provider market classification ─────────────────────────────────────────

test('classifyProviderMarket: h2h yields 1X2 + moneyline, fully capable', () => {
  const c = classifyProviderMarket('h2h');
  assert.equal(c.group, 'featured');
  assert.deepEqual([...c.canonicalMarkets].sort(), ['1X2', 'moneyline'].sort());
  assert.ok(c.capabilities.includes('pickable'));
  assert.ok(c.capabilities.includes('settleable'));
});

test('classifyProviderMarket: spreads/totals map to their canonical', () => {
  assert.deepEqual(classifyProviderMarket('spreads').canonicalMarkets, ['spreads']);
  assert.deepEqual(classifyProviderMarket('totals').canonicalMarkets, ['totals']);
});

test('classifyProviderMarket: btts is a gradeable derived market', () => {
  const c = classifyProviderMarket('btts');
  assert.equal(c.group, 'derived');
  assert.deepEqual(c.canonicalMarkets, ['btts']);
  assert.ok(c.capabilities.includes('pickable'));
});

test('classifyProviderMarket: player props are display-only', () => {
  for (const key of ['player_points', 'player_pass_tds', 'player_hits']) {
    const c = classifyProviderMarket(key);
    assert.equal(c.group, 'player_prop');
    assert.deepEqual(c.canonicalMarkets, []);
    assert.deepEqual(c.capabilities, ['displayable']);
    assert.equal(isPickableProviderMarket(key), false);
  }
});

test('classifyProviderMarket: period/quarter/half markets are display-only', () => {
  for (const key of ['h2h_q1', 'spreads_h1', 'totals_q4', 'h2h_p1', 'h2h_1st_1_innings']) {
    const c = classifyProviderMarket(key);
    assert.equal(c.group, 'period', `${key} should be period`);
    assert.deepEqual(c.canonicalMarkets, []);
  }
});

test('classifyProviderMarket: alternate lines are display-only', () => {
  for (const key of ['alternate_spreads', 'alternate_totals']) {
    const c = classifyProviderMarket(key);
    assert.equal(c.group, 'alternate');
    assert.deepEqual(c.canonicalMarkets, []);
  }
});

test('classifyProviderMarket: outrights + exchange lay are display-only', () => {
  assert.equal(classifyProviderMarket('outrights').group, 'outright');
  assert.equal(classifyProviderMarket('outrights_lay').group, 'exchange');
  assert.equal(classifyProviderMarket('h2h_lay').group, 'exchange');
  assert.deepEqual(classifyProviderMarket('h2h_lay').canonicalMarkets, []);
});

test('classifyProviderMarket: unknown keys fall back to display-only other', () => {
  const c = classifyProviderMarket('some_new_market');
  assert.equal(c.group, 'other');
  assert.deepEqual(c.capabilities, ['displayable']);
});

test('classifyProviderMarket is case-insensitive and preserves the raw key', () => {
  const c = classifyProviderMarket('H2H');
  assert.equal(c.providerKey, 'H2H');
  assert.deepEqual([...c.canonicalMarkets].sort(), ['1X2', 'moneyline'].sort());
});

test('humanizeMarketKey renders readable labels', () => {
  assert.equal(humanizeMarketKey('player_pass_tds'), 'Player Pass TDS');
  assert.equal(humanizeMarketKey('alternate_totals'), 'Alternate Totals');
});
