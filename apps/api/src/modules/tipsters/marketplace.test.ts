import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MIN_SAMPLE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  filterAndRankTipsters,
  normalizeMarketplaceQuery,
  type MarketplaceRow,
} from './marketplace.ts';

function row(over: Partial<MarketplaceRow>): MarketplaceRow {
  return {
    tipsterId: 't',
    yield: 0,
    clvAvg: 0,
    winRate: 0,
    sampleSize: 100,
    sports: ['soccer'],
    subscriptionPriceCents: 1000,
    bio: null,
    ...over,
  };
}

test('normalizeMarketplaceQuery: sane defaults for empty input', () => {
  const q = normalizeMarketplaceQuery();
  assert.deepEqual(q, {
    sport: null,
    maxPriceCents: null,
    minSample: DEFAULT_MIN_SAMPLE,
    sort: 'yield',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
});

test('normalizeMarketplaceQuery: parses and clamps untrusted values', () => {
  const q = normalizeMarketplaceQuery({
    sport: ' NBA ',
    maxPrice: '2500',
    minSample: '50',
    sort: 'clv',
    page: '3',
    pageSize: '999',
  });
  assert.equal(q.sport, 'NBA');
  assert.equal(q.maxPriceCents, 2500);
  assert.equal(q.minSample, 50);
  assert.equal(q.sort, 'clv');
  assert.equal(q.page, 3);
  assert.equal(q.pageSize, MAX_PAGE_SIZE);
});

test('normalizeMarketplaceQuery: falls back on invalid values', () => {
  const q = normalizeMarketplaceQuery({
    sport: '   ',
    maxPrice: 'free',
    minSample: '-5',
    sort: 'sharpe',
    page: '0',
    pageSize: 'lots',
  });
  assert.equal(q.sport, null);
  assert.equal(q.maxPriceCents, null);
  assert.equal(q.minSample, DEFAULT_MIN_SAMPLE);
  assert.equal(q.sort, 'yield');
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, DEFAULT_PAGE_SIZE);
});

test('filterAndRankTipsters: sport filter narrows results', () => {
  const rows = [
    row({ tipsterId: 'a', sports: ['soccer'] }),
    row({ tipsterId: 'b', sports: ['tennis'] }),
    row({ tipsterId: 'c', sports: ['soccer', 'nba'] }),
  ];
  const res = filterAndRankTipsters(
    rows,
    normalizeMarketplaceQuery({ sport: 'SOCCER' }),
  );
  assert.equal(res.total, 2);
  assert.deepEqual(
    res.items.map((r) => r.tipsterId).sort(),
    ['a', 'c'],
  );
});

test('filterAndRankTipsters: price and min-sample filters narrow results', () => {
  const rows = [
    row({ tipsterId: 'cheap', subscriptionPriceCents: 500, sampleSize: 100 }),
    row({ tipsterId: 'pricey', subscriptionPriceCents: 5000, sampleSize: 100 }),
    row({ tipsterId: 'small', subscriptionPriceCents: 500, sampleSize: 5 }),
  ];
  const res = filterAndRankTipsters(
    rows,
    normalizeMarketplaceQuery({ maxPrice: '1000', minSample: '10' }),
  );
  assert.equal(res.total, 1);
  assert.equal(res.items[0].tipsterId, 'cheap');
});

test('filterAndRankTipsters: sort reorders by chosen metric', () => {
  const rows = [
    row({ tipsterId: 'a', yield: 5, clvAvg: 0.01, winRate: 0.4 }),
    row({ tipsterId: 'b', yield: 10, clvAvg: 0.03, winRate: 0.55 }),
    row({ tipsterId: 'c', yield: 8, clvAvg: 0.02, winRate: 0.6 }),
  ];
  const byYield = filterAndRankTipsters(
    rows,
    normalizeMarketplaceQuery({ sort: 'yield' }),
  );
  assert.deepEqual(byYield.items.map((r) => r.tipsterId), ['b', 'c', 'a']);

  const byWinRate = filterAndRankTipsters(
    rows,
    normalizeMarketplaceQuery({ sort: 'winRate' }),
  );
  assert.deepEqual(byWinRate.items.map((r) => r.tipsterId), ['c', 'b', 'a']);

  const byClv = filterAndRankTipsters(
    rows,
    normalizeMarketplaceQuery({ sort: 'clv' }),
  );
  assert.deepEqual(byClv.items.map((r) => r.tipsterId), ['b', 'c', 'a']);
});

test('filterAndRankTipsters: ties break deterministically by clv then id', () => {
  const rows = [
    row({ tipsterId: 'z', yield: 5, clvAvg: 0.02 }),
    row({ tipsterId: 'a', yield: 5, clvAvg: 0.02 }),
    row({ tipsterId: 'm', yield: 5, clvAvg: 0.05 }),
  ];
  const res = filterAndRankTipsters(
    rows,
    normalizeMarketplaceQuery({ sort: 'yield' }),
  );
  assert.deepEqual(res.items.map((r) => r.tipsterId), ['m', 'a', 'z']);
});

test('filterAndRankTipsters: paginates and reports totals', () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    row({ tipsterId: `t${i}`, yield: i }),
  );
  const page1 = filterAndRankTipsters(
    rows,
    normalizeMarketplaceQuery({ pageSize: '2', page: '1' }),
  );
  assert.equal(page1.total, 5);
  assert.equal(page1.totalPages, 3);
  assert.deepEqual(page1.items.map((r) => r.tipsterId), ['t4', 't3']);

  const page2 = filterAndRankTipsters(
    rows,
    normalizeMarketplaceQuery({ pageSize: '2', page: '2' }),
  );
  assert.deepEqual(page2.items.map((r) => r.tipsterId), ['t2', 't1']);

  // Out-of-range page clamps to the last page rather than returning empty.
  const page9 = filterAndRankTipsters(
    rows,
    normalizeMarketplaceQuery({ pageSize: '2', page: '9' }),
  );
  assert.equal(page9.page, 3);
  assert.deepEqual(page9.items.map((r) => r.tipsterId), ['t0']);
});

test('filterAndRankTipsters: empty result set reports one page', () => {
  const res = filterAndRankTipsters([], normalizeMarketplaceQuery());
  assert.deepEqual(res, {
    items: [],
    total: 0,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalPages: 1,
  });
});
