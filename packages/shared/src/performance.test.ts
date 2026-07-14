import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPerformanceSeries,
  buildPerformanceDashboard,
  pickBreakdown,
} from './performance.ts';
import type { SettledPick } from './types.ts';

const p = (o: Partial<SettledPick>): SettledPick => ({
  oddsAtPick: 2.0,
  stakeUnits: 1,
  status: 'won',
  closingOdds: null,
  settledAt: null,
  ...o,
});

test('buildPerformanceSeries: empty input yields an empty series', () => {
  assert.deepEqual(buildPerformanceSeries([]), []);
});

test('buildPerformanceSeries: pending picks are excluded from the series', () => {
  const series = buildPerformanceSeries([
    p({ status: 'won', settledAt: 1 }),
    p({ status: 'pending' }),
  ]);
  assert.equal(series.length, 1);
  assert.equal(series[0].index, 1);
});

test('buildPerformanceSeries: cumulative units and drawdown track the equity path', () => {
  // equity path: +1, +2, +1, 0, -1 → peak 2 → final drawdown 3
  const series = buildPerformanceSeries([
    p({ status: 'won', settledAt: 1 }),
    p({ status: 'won', settledAt: 2 }),
    p({ status: 'lost', settledAt: 3 }),
    p({ status: 'lost', settledAt: 4 }),
    p({ status: 'lost', settledAt: 5 }),
  ]);
  assert.deepEqual(
    series.map((s) => s.cumulativeUnits),
    [1, 2, 1, 0, -1],
  );
  assert.deepEqual(
    series.map((s) => s.drawdown),
    [0, 0, 1, 2, 3],
  );
});

test('buildPerformanceSeries: orders by settlement time regardless of input order', () => {
  const series = buildPerformanceSeries([
    p({ status: 'lost', settledAt: 3 }),
    p({ status: 'won', settledAt: 1 }),
    p({ status: 'won', settledAt: 2 }),
  ]);
  assert.deepEqual(
    series.map((s) => s.settledAt),
    [1, 2, 3],
  );
});

test('buildPerformanceSeries: last point matches computeTipsterStats aggregates', () => {
  const picks = [
    p({ status: 'won', oddsAtPick: 2.2, closingOdds: 2.0, settledAt: 1 }),
    p({ status: 'lost', settledAt: 2 }),
    p({ status: 'won', settledAt: 3 }),
  ];
  const series = buildPerformanceSeries(picks);
  const last = series[series.length - 1];
  const { stats } = buildPerformanceDashboard(picks);
  assert.ok(Math.abs(last.roi - stats.roi) < 1e-9);
  assert.ok(Math.abs(last.yield - stats.yield) < 1e-9);
  assert.ok(Math.abs(last.clvAvg - stats.clvAvg) < 1e-9);
  assert.ok(Math.abs(last.winRate - stats.winRate) < 1e-9);
  const maxDrawdown = Math.max(...series.map((s) => s.drawdown));
  assert.ok(Math.abs(maxDrawdown - stats.maxDrawdown) < 1e-9);
});

test('pickBreakdown: empty input is all zeroes', () => {
  assert.deepEqual(pickBreakdown([]), {
    pending: 0,
    won: 0,
    lost: 0,
    void: 0,
    settled: 0,
    total: 0,
  });
});

test('pickBreakdown: splits pending vs settled and counts each status', () => {
  const breakdown = pickBreakdown([
    p({ status: 'won' }),
    p({ status: 'won' }),
    p({ status: 'lost' }),
    p({ status: 'void' }),
    p({ status: 'pending' }),
  ]);
  assert.deepEqual(breakdown, {
    pending: 1,
    won: 2,
    lost: 1,
    void: 1,
    settled: 4,
    total: 5,
  });
});

test('buildPerformanceDashboard: seeded history returns series, breakdown and stats', () => {
  const dash = buildPerformanceDashboard([
    p({ status: 'won', settledAt: 1 }),
    p({ status: 'lost', settledAt: 2 }),
    p({ status: 'pending' }),
  ]);
  assert.equal(dash.series.length, 2);
  assert.equal(dash.breakdown.pending, 1);
  assert.equal(dash.breakdown.settled, 2);
  assert.equal(dash.stats.sampleSize, 2);
});

test('buildPerformanceDashboard: empty history is handled gracefully', () => {
  const dash = buildPerformanceDashboard([]);
  assert.deepEqual(dash.series, []);
  assert.equal(dash.breakdown.total, 0);
  assert.equal(dash.stats.sampleSize, 0);
});
