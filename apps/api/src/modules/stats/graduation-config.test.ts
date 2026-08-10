import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateGraduation,
  nextGraduationStatus,
  type GraduationStatus,
} from '@overlay/shared';
import { resolveGraduationThreshold } from './graduation-config.ts';

test('resolveGraduationThreshold: defaults to 60% and 20 settled bets', () => {
  const t = resolveGraduationThreshold({});
  assert.equal(t.minWinRate, 0.6);
  assert.equal(t.minSettledBets, 20);
});

test('resolveGraduationThreshold: reads env overrides (percent → fraction)', () => {
  const t = resolveGraduationThreshold({
    TIPSTER_GRADUATION_MIN_WIN_RATE_PCT: '55',
    TIPSTER_GRADUATION_MIN_SETTLED_BETS: '50',
  });
  assert.ok(Math.abs(t.minWinRate - 0.55) < 1e-9);
  assert.equal(t.minSettledBets, 50);
});

test('resolveGraduationThreshold: ignores blank / non-numeric / non-positive', () => {
  const t = resolveGraduationThreshold({
    TIPSTER_GRADUATION_MIN_WIN_RATE_PCT: '  ',
    TIPSTER_GRADUATION_MIN_SETTLED_BETS: 'abc',
  });
  assert.equal(t.minWinRate, 0.6);
  assert.equal(t.minSettledBets, 20);

  const t2 = resolveGraduationThreshold({
    TIPSTER_GRADUATION_MIN_SETTLED_BETS: '0',
  });
  assert.equal(t2.minSettledBets, 20);
});

test('resolveGraduationThreshold: clamps a win-rate percent above 100', () => {
  const t = resolveGraduationThreshold({
    TIPSTER_GRADUATION_MIN_WIN_RATE_PCT: '150',
  });
  assert.equal(t.minWinRate, 1);
});

// Integration of the API-side promotion path: env threshold → eligibility →
// next status. Mirrors StatsService.recomputeForTipster's decision.
function promote(
  current: GraduationStatus,
  stats: { winRate: number; settledBets: number },
  env: NodeJS.ProcessEnv = {},
): GraduationStatus {
  const evaluation = evaluateGraduation(stats, resolveGraduationThreshold(env));
  return nextGraduationStatus(current, evaluation);
}

test('crossing the threshold flips a rising tipster to pending_review', () => {
  // Just below → stays rising; crossing → pending_review.
  assert.equal(promote('rising', { winRate: 0.6, settledBets: 19 }), 'rising');
  assert.equal(
    promote('rising', { winRate: 0.6, settledBets: 20 }),
    'pending_review',
  );
});

test('regression below the threshold keeps a reviewed tipster verified', () => {
  // Once verified, a later dip in performance does NOT auto-demote.
  assert.equal(
    promote('verified', { winRate: 0.2, settledBets: 3 }),
    'verified',
  );
  assert.equal(
    promote('pending_review', { winRate: 0.2, settledBets: 3 }),
    'pending_review',
  );
});

test('a custom env threshold changes when a tipster graduates', () => {
  const env = { TIPSTER_GRADUATION_MIN_SETTLED_BETS: '50' };
  // 20 bets no longer qualifies under a 50-bet floor.
  assert.equal(promote('rising', { winRate: 0.7, settledBets: 20 }, env), 'rising');
  assert.equal(
    promote('rising', { winRate: 0.7, settledBets: 50 }, env),
    'pending_review',
  );
});
