import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ONBOARDING_STEPS,
  canPublishPicks,
  computeOnboardingStatus,
  type TipsterOnboardingState,
} from './onboarding.ts';

/** A fully-onboarded tipster; override individual fields per test. */
function state(over: Partial<TipsterOnboardingState> = {}): TipsterOnboardingState {
  return {
    bio: 'Data-driven soccer sharp.',
    sports: ['soccer'],
    subscriptionPriceCents: 1999,
    stripeOnboarded: true,
    identityVerified: true,
    ...over,
  };
}

test('computeOnboardingStatus: brand-new tipster has no completed steps', () => {
  const status = computeOnboardingStatus({
    bio: null,
    sports: [],
    subscriptionPriceCents: 0,
    stripeOnboarded: false,
    identityVerified: false,
  });
  assert.equal(status.completedSteps, 0);
  assert.equal(status.totalSteps, ONBOARDING_STEPS.length);
  assert.equal(status.complete, false);
  assert.equal(status.canPublish, false);
  assert.equal(status.nextStep, 'bio');
  assert.ok(status.steps.every((s) => !s.complete));
});

test('computeOnboardingStatus: fully-onboarded tipster can publish', () => {
  const status = computeOnboardingStatus(state());
  assert.equal(status.completedSteps, ONBOARDING_STEPS.length);
  assert.equal(status.complete, true);
  assert.equal(status.canPublish, true);
  assert.equal(status.nextStep, null);
  assert.ok(status.steps.every((s) => s.complete));
});

test('computeOnboardingStatus: nextStep points at the first incomplete step in order', () => {
  assert.equal(computeOnboardingStatus(state({ bio: '  ' })).nextStep, 'bio');
  assert.equal(computeOnboardingStatus(state({ sports: [] })).nextStep, 'sports');
  assert.equal(
    computeOnboardingStatus(state({ subscriptionPriceCents: 0 })).nextStep,
    'pricing',
  );
  assert.equal(
    computeOnboardingStatus(state({ stripeOnboarded: false })).nextStep,
    'stripe',
  );
  assert.equal(
    computeOnboardingStatus(state({ identityVerified: false })).nextStep,
    'verification',
  );
});

test('computeOnboardingStatus: earliest incomplete step wins when several are missing', () => {
  const status = computeOnboardingStatus(
    state({ subscriptionPriceCents: 0, stripeOnboarded: false }),
  );
  assert.equal(status.nextStep, 'pricing');
  assert.equal(status.completedSteps, 3);
});

test('bio step ignores whitespace-only bios', () => {
  assert.equal(canPublishPicks(state({ bio: '   ' })), false);
  assert.equal(canPublishPicks(state({ bio: '' })), false);
  assert.equal(canPublishPicks(state({ bio: 'x' })), true);
});

test('sports step requires at least one non-empty sport', () => {
  assert.equal(canPublishPicks(state({ sports: [] })), false);
  assert.equal(canPublishPicks(state({ sports: ['  '] })), false);
  assert.equal(canPublishPicks(state({ sports: ['tennis'] })), true);
});

test('pricing step requires a positive subscription price', () => {
  assert.equal(canPublishPicks(state({ subscriptionPriceCents: 0 })), false);
  assert.equal(canPublishPicks(state({ subscriptionPriceCents: -5 })), false);
  assert.equal(canPublishPicks(state({ subscriptionPriceCents: 1 })), true);
});

test('canPublishPicks: blocks until Stripe onboarding and verification are done', () => {
  assert.equal(canPublishPicks(state({ stripeOnboarded: false })), false);
  assert.equal(canPublishPicks(state({ identityVerified: false })), false);
  assert.equal(canPublishPicks(state()), true);
});
