import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeClvDistribution,
  computeStatsBySport,
  computeStatsByMarket,
  computeWindowedStats,
  computeVerifiedMetrics,
  UNKNOWN_DIMENSION,
} from './advanced-metrics.ts';
import type { SettledPick } from './types.ts';

const p = (o: Partial<SettledPick>): SettledPick => ({
  oddsAtPick: 2.0,
  stakeUnits: 1,
  status: 'won',
  closingOdds: null,
  settledAt: null,
  ...o,
});

// A fixed day in ms epoch so windowed fixtures are deterministic.
const NOW = Date.UTC(2026, 0, 100); // arbitrary stable instant
const DAY = 24 * 60 * 60 * 1000;

test('computeClvDistribution: buckets picks into the fixed CLV bands', () => {
  // clv = oddsAtPick / closingOdds - 1
  const dist = computeClvDistribution([
    p({ oddsAtPick: 2.0, closingOdds: 2.0 }), // 0%  → [-1,1)
    p({ oddsAtPick: 2.1, closingOdds: 2.0 }), // +5% → ≥ +5
    p({ oddsAtPick: 1.92, closingOdds: 2.0 }), // -4% → [-5,-3)
    p({ oddsAtPick: 2.04, closingOdds: 2.0 }), // +2% → [1,3)
    p({ oddsAtPick: 3.0, closingOdds: 1.5 }), // +100% → ≥ +5
  ]);

  assert.equal(dist.sampleSize, 5);
  // 7 bands: (<-5), [-5,-3), [-3,-1), [-1,1), [1,3), [3,5), (≥5)
  assert.equal(dist.buckets.length, 7);
  const counts = dist.buckets.map((b) => b.count);
  assert.deepEqual(counts, [0, 1, 0, 1, 1, 0, 2]);
  // 3 of 5 picks beat the close (+5, +2, +100).
  assert.ok(Math.abs(dist.positiveRate - 3 / 5) < 1e-9);
});

test('computeClvDistribution: ignores live and ungraded picks', () => {
  const dist = computeClvDistribution([
    p({ oddsAtPick: 2.1, closingOdds: 2.0 }), // +5% graded
    p({ closingOdds: null }), // ungraded
    p({ pickType: 'live', oddsAtPick: 2.1, closingOdds: 2.0 }), // live → no CLV
  ]);
  assert.equal(dist.sampleSize, 1);
  assert.equal(dist.buckets.reduce((n, b) => n + b.count, 0), 1);
});

test('computeClvDistribution: empty book is all zeros', () => {
  const dist = computeClvDistribution([]);
  assert.equal(dist.sampleSize, 0);
  assert.equal(dist.averagePct, 0);
  assert.equal(dist.positiveRate, 0);
  assert.ok(dist.buckets.every((b) => b.count === 0));
});

test('computeStatsBySport: ROI computed per sport, ordered by sample size', () => {
  const groups = computeStatsBySport([
    // Football: 3 wins @2.0 (+3), 1 loss (-1) → ROI 0.5
    p({ sport: 'football', status: 'won' }),
    p({ sport: 'football', status: 'won' }),
    p({ sport: 'football', status: 'won' }),
    p({ sport: 'football', status: 'lost' }),
    // Tennis: 1 win, 1 loss → ROI 0
    p({ sport: 'tennis', status: 'won' }),
    p({ sport: 'tennis', status: 'lost' }),
  ]);

  assert.equal(groups.length, 2);
  // Largest group first.
  assert.equal(groups[0].key, 'football');
  assert.ok(Math.abs(groups[0].stats.roi - 0.5) < 1e-9);
  assert.equal(groups[1].key, 'tennis');
  assert.equal(groups[1].stats.roi, 0);
});

test('computeStatsBySport: missing sport is grouped under unknown', () => {
  const groups = computeStatsBySport([
    p({ status: 'won' }),
    p({ sport: '', status: 'lost' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, UNKNOWN_DIMENSION);
  assert.equal(groups[0].stats.sampleSize, 2);
});

test('computeStatsByMarket: ROI computed per market', () => {
  const groups = computeStatsByMarket([
    p({ market: '1X2', status: 'won' }),
    p({ market: '1X2', status: 'won' }),
    p({ market: 'over_under', status: 'lost' }),
  ]);
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g.stats]));
  assert.equal(byKey['1X2'].sampleSize, 2);
  assert.equal(byKey['1X2'].winRate, 1);
  assert.equal(byKey['over_under'].sampleSize, 1);
  assert.equal(byKey['over_under'].winRate, 0);
});

test('computeWindowedStats: 30/90/all-time slice by settlement time', () => {
  const picks = [
    p({ status: 'won', settledAt: NOW - 10 * DAY }), // in 30 & 90
    p({ status: 'lost', settledAt: NOW - 60 * DAY }), // in 90 only
    p({ status: 'won', settledAt: NOW - 200 * DAY }), // all-time only
    p({ status: 'won', settledAt: null }), // all-time only (no timeline)
  ];
  const w = computeWindowedStats(picks, NOW);

  assert.equal(w.last30.sampleSize, 1);
  assert.equal(w.last90.sampleSize, 2);
  assert.equal(w.allTime.sampleSize, 4);
});

test('computeWindowedStats: boundary pick at exactly the window edge is included', () => {
  const w = computeWindowedStats(
    [p({ status: 'won', settledAt: NOW - 30 * DAY })],
    NOW,
  );
  assert.equal(w.last30.sampleSize, 1);
});

test('computeVerifiedMetrics: bundles all metrics deterministically', () => {
  const picks = [
    p({ sport: 'football', market: '1X2', status: 'won', oddsAtPick: 2.1, closingOdds: 2.0, settledAt: NOW - 5 * DAY }),
    p({ sport: 'tennis', market: 'moneyline', status: 'lost', oddsAtPick: 1.9, closingOdds: 2.0, settledAt: NOW - 40 * DAY }),
  ];
  const a = computeVerifiedMetrics(picks, NOW);
  const b = computeVerifiedMetrics(picks, NOW);

  assert.deepEqual(a, b);
  assert.equal(a.clvDistribution.sampleSize, 2);
  assert.equal(a.bySport.length, 2);
  assert.equal(a.byMarket.length, 2);
  assert.equal(a.windows.last30.sampleSize, 1);
  assert.equal(a.windows.allTime.sampleSize, 2);
});
