import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GRADUATION_THRESHOLD,
  evaluateGraduation,
  graduationBadge,
  isLivePicksGated,
  isProvisional,
  nextGraduationStatus,
  normalizeGraduationStatus,
  type GraduationStatus,
} from './graduation.ts';

test('default threshold is 60% win rate and 20 settled bets', () => {
  assert.equal(DEFAULT_GRADUATION_THRESHOLD.minWinRate, 0.6);
  assert.equal(DEFAULT_GRADUATION_THRESHOLD.minSettledBets, 20);
});

test('evaluateGraduation: eligible only when BOTH floors are met', () => {
  const ev = evaluateGraduation({ winRate: 0.7, settledBets: 25 });
  assert.equal(ev.meetsWinRate, true);
  assert.equal(ev.meetsSampleSize, true);
  assert.equal(ev.eligible, true);
});

test('evaluateGraduation: win rate met but sample too small is ineligible', () => {
  const ev = evaluateGraduation({ winRate: 0.9, settledBets: 19 });
  assert.equal(ev.meetsWinRate, true);
  assert.equal(ev.meetsSampleSize, false);
  assert.equal(ev.eligible, false);
});

test('evaluateGraduation: enough bets but win rate below floor is ineligible', () => {
  const ev = evaluateGraduation({ winRate: 0.59, settledBets: 40 });
  assert.equal(ev.meetsWinRate, false);
  assert.equal(ev.eligible, false);
});

// Boundary cases: exactly at the (default) floors.
test('evaluateGraduation: exactly 60% win rate is inclusive', () => {
  assert.equal(
    evaluateGraduation({ winRate: 0.6, settledBets: 25 }).meetsWinRate,
    true,
  );
});

test('evaluateGraduation: exactly the sample floor is inclusive', () => {
  // 20 bets is exactly the default floor → eligible; 19 is not.
  assert.equal(
    evaluateGraduation({ winRate: 0.6, settledBets: 20 }).eligible,
    true,
  );
  assert.equal(
    evaluateGraduation({ winRate: 0.6, settledBets: 19 }).eligible,
    false,
  );
});

test('evaluateGraduation: one above the sample floor is eligible', () => {
  assert.equal(
    evaluateGraduation({ winRate: 0.6, settledBets: 21 }).eligible,
    true,
  );
});

// The original issue's boundaries (exactly 15 / 16) with a configured 15 floor.
test('evaluateGraduation: honours a custom "> 15" threshold at 16 bets', () => {
  const threshold = { minWinRate: 0.6, minSettledBets: 16 };
  assert.equal(
    evaluateGraduation({ winRate: 0.6, settledBets: 15 }, threshold).eligible,
    false,
  );
  assert.equal(
    evaluateGraduation({ winRate: 0.6, settledBets: 16 }, threshold).eligible,
    true,
  );
});

test('nextGraduationStatus: rising crossing the threshold flips to pending_review', () => {
  const ev = evaluateGraduation({ winRate: 0.65, settledBets: 30 });
  assert.equal(nextGraduationStatus('rising', ev), 'pending_review');
});

test('nextGraduationStatus: rising below the threshold stays rising', () => {
  const ev = evaluateGraduation({ winRate: 0.5, settledBets: 30 });
  assert.equal(nextGraduationStatus('rising', ev), 'rising');
});

test('nextGraduationStatus: promotion is monotonic (no auto-demotion)', () => {
  const below = evaluateGraduation({ winRate: 0.4, settledBets: 5 });
  // A regression below the threshold never auto-demotes verified/pending state.
  assert.equal(nextGraduationStatus('verified', below), 'verified');
  assert.equal(nextGraduationStatus('pending_review', below), 'pending_review');
});

test('isProvisional: everything but verified is provisional', () => {
  assert.equal(isProvisional('rising'), true);
  assert.equal(isProvisional('pending_review'), true);
  assert.equal(isProvisional('verified'), false);
});

test('graduationBadge: rising shows "Rising tipster", verified shows "Verified tipster"', () => {
  assert.deepEqual(graduationBadge('rising'), {
    status: 'rising',
    label: 'Rising tipster',
    provisional: true,
  });
  assert.deepEqual(graduationBadge('pending_review'), {
    status: 'pending_review',
    label: 'Rising tipster',
    provisional: true,
  });
  assert.deepEqual(graduationBadge('verified'), {
    status: 'verified',
    label: 'Verified tipster',
    provisional: false,
  });
});

test('normalizeGraduationStatus: defaults unknown/missing to rising', () => {
  assert.equal(normalizeGraduationStatus(null), 'rising');
  assert.equal(normalizeGraduationStatus(undefined), 'rising');
  assert.equal(normalizeGraduationStatus('nonsense'), 'rising');
  assert.equal(normalizeGraduationStatus('verified'), 'verified');
  assert.equal(normalizeGraduationStatus('pending_review'), 'pending_review');
});

test('isLivePicksGated: only verified AND gating-enabled gates live picks', () => {
  const gate = (
    graduationStatus: GraduationStatus,
    subscriptionGatingEnabled: boolean,
  ) => isLivePicksGated({ graduationStatus, subscriptionGatingEnabled });

  // Provisional tipsters are always free/public, even if gating is flipped on.
  assert.equal(gate('rising', true), false);
  assert.equal(gate('pending_review', true), false);
  // Verified but gating not enabled → still free (no auto-billing).
  assert.equal(gate('verified', false), false);
  // Verified AND gating enabled → gated.
  assert.equal(gate('verified', true), true);
});
