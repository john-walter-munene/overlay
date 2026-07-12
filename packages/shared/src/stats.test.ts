import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTipsterStats,
  computeCurrentStreak,
  pickProfitUnits,
  pickClv,
} from './stats.ts';
import type { SettledPick } from './types.ts';

const p = (o: Partial<SettledPick>): SettledPick => ({
  oddsAtPick: 2.0,
  stakeUnits: 1,
  status: 'won',
  closingOdds: null,
  settledAt: null,
  ...o,
});

test('pickProfitUnits: won pays stake * (odds - 1)', () => {
  assert.equal(pickProfitUnits(p({ status: 'won', oddsAtPick: 2.5, stakeUnits: 2 })), 3);
});

test('pickProfitUnits: lost loses the stake', () => {
  assert.equal(pickProfitUnits(p({ status: 'lost', stakeUnits: 2 })), -2);
});

test('pickProfitUnits: void is break-even', () => {
  assert.equal(pickProfitUnits(p({ status: 'void', stakeUnits: 2 })), 0);
});

test('pickClv: positive when pick odds beat the close', () => {
  const clv = pickClv(p({ oddsAtPick: 2.2, closingOdds: 2.0 }));
  assert.ok(clv !== null && Math.abs(clv - 0.1) < 1e-9);
});

test('pickClv: null when closing odds missing', () => {
  assert.equal(pickClv(p({ closingOdds: null })), null);
});

test('computeTipsterStats: ROI and yield over a mixed book', () => {
  // 2 wins @2.0 (+1 each), 2 losses (-1 each) → profit 0 over turnover 4 → ROI 0
  const stats = computeTipsterStats([
    p({ status: 'won', settledAt: 1 }),
    p({ status: 'won', settledAt: 2 }),
    p({ status: 'lost', settledAt: 3 }),
    p({ status: 'lost', settledAt: 4 }),
  ]);
  assert.equal(stats.roi, 0);
  assert.equal(stats.yield, 0);
  assert.equal(stats.winRate, 0.5);
  assert.equal(stats.sampleSize, 4);
});

test('computeTipsterStats: positive ROI', () => {
  // 3 wins @2.0 (+3), 1 loss (-1) → profit 2 / turnover 4 = 0.5
  const stats = computeTipsterStats([
    p({ status: 'won' }),
    p({ status: 'won' }),
    p({ status: 'won' }),
    p({ status: 'lost' }),
  ]);
  assert.ok(Math.abs(stats.roi - 0.5) < 1e-9);
  assert.ok(Math.abs(stats.yield - 50) < 1e-9);
});

test('computeTipsterStats: void counts to sample size, not turnover', () => {
  const stats = computeTipsterStats([
    p({ status: 'won' }),
    p({ status: 'void' }),
  ]);
  assert.equal(stats.sampleSize, 2);
  assert.equal(stats.winRate, 1); // 1 win of 1 decisive
  assert.equal(stats.roi, 1); // profit 1 / turnover 1
});

test('computeTipsterStats: pending picks are ignored', () => {
  const stats = computeTipsterStats([
    p({ status: 'won' }),
    p({ status: 'pending' }),
  ]);
  assert.equal(stats.sampleSize, 1);
});

test('computeTipsterStats: max drawdown tracks peak-to-trough', () => {
  // equity path: +1, +2, +1, 0, -1 → peak 2, trough -1 → drawdown 3
  const stats = computeTipsterStats([
    p({ status: 'won', settledAt: 1 }),
    p({ status: 'won', settledAt: 2 }),
    p({ status: 'lost', settledAt: 3 }),
    p({ status: 'lost', settledAt: 4 }),
    p({ status: 'lost', settledAt: 5 }),
  ]);
  assert.equal(stats.maxDrawdown, 3);
});

test('computeTipsterStats: clvAvg only over picks with closing odds', () => {
  const stats = computeTipsterStats([
    p({ status: 'won', oddsAtPick: 2.2, closingOdds: 2.0 }), // +0.1
    p({ status: 'lost', oddsAtPick: 1.5, closingOdds: 1.5 }), // 0
    p({ status: 'lost', closingOdds: null }), // ignored
  ]);
  assert.ok(Math.abs(stats.clvAvg - 0.05) < 1e-9);
});

test('computeCurrentStreak: positive win streak from the end', () => {
  const streak = computeCurrentStreak([
    p({ status: 'lost', settledAt: 1 }),
    p({ status: 'won', settledAt: 2 }),
    p({ status: 'won', settledAt: 3 }),
  ]);
  assert.equal(streak, 2);
});

test('computeCurrentStreak: negative losing streak, skipping void', () => {
  const streak = computeCurrentStreak([
    p({ status: 'won', settledAt: 1 }),
    p({ status: 'lost', settledAt: 2 }),
    p({ status: 'void', settledAt: 3 }),
    p({ status: 'lost', settledAt: 4 }),
  ]);
  assert.equal(streak, -2);
});
