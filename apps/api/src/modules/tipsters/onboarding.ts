/**
 * Pure tipster onboarding logic for the guided setup wizard (OB-020).
 *
 * Kept free of Nest/Prisma (mirrors marketplace.ts / payouts.math.ts) so the
 * step-completion and publish-gate behaviour can be unit-tested in isolation.
 * The service reads the tipster's persisted fields and delegates the
 * "which steps are done / can they publish?" decision here.
 *
 * Progress is persisted implicitly: each step maps to a stored Tipster field
 * (bio, sports, subscriptionPriceCents, stripeOnboarded, identityVerified), so
 * a tipster can leave and resume the wizard without losing progress.
 */

export type OnboardingStepKey =
  | 'bio'
  | 'sports'
  | 'pricing'
  | 'stripe'
  | 'verification';

/** Ordered, required steps of the onboarding wizard. */
export const ONBOARDING_STEPS: readonly OnboardingStepKey[] = [
  'bio',
  'sports',
  'pricing',
  'stripe',
  'verification',
];

const STEP_LABELS: Record<OnboardingStepKey, string> = {
  bio: 'Add your bio',
  sports: 'Choose your sports',
  pricing: 'Set your subscription price',
  stripe: 'Connect Stripe payouts',
  verification: 'Verify your identity',
};

/** The persisted tipster fields the wizard reads to compute progress. */
export interface TipsterOnboardingState {
  bio: string | null;
  sports: string[];
  subscriptionPriceCents: number;
  stripeOnboarded: boolean;
  identityVerified: boolean;
}

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  complete: boolean;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  completedSteps: number;
  totalSteps: number;
  /** True once every required step is complete. */
  complete: boolean;
  /** Publishing picks is gated on this (currently identical to `complete`). */
  canPublish: boolean;
  /** First incomplete step to guide the user to, or null when finished. */
  nextStep: OnboardingStepKey | null;
}

function isStepComplete(
  key: OnboardingStepKey,
  state: TipsterOnboardingState,
): boolean {
  switch (key) {
    case 'bio':
      return typeof state.bio === 'string' && state.bio.trim().length > 0;
    case 'sports':
      return (
        Array.isArray(state.sports) &&
        state.sports.some((s) => s.trim().length > 0)
      );
    case 'pricing':
      return (
        Number.isFinite(state.subscriptionPriceCents) &&
        state.subscriptionPriceCents > 0
      );
    case 'stripe':
      return state.stripeOnboarded === true;
    case 'verification':
      return state.identityVerified === true;
    default:
      return false;
  }
}

/**
 * Compute the wizard's step-by-step completion state and whether the tipster
 * has satisfied every requirement needed to publish picks.
 */
export function computeOnboardingStatus(
  state: TipsterOnboardingState,
): OnboardingStatus {
  const steps: OnboardingStep[] = ONBOARDING_STEPS.map((key) => ({
    key,
    label: STEP_LABELS[key],
    complete: isStepComplete(key, state),
  }));

  const completedSteps = steps.filter((s) => s.complete).length;
  const complete = completedSteps === steps.length;
  const nextStep = steps.find((s) => !s.complete)?.key ?? null;

  return {
    steps,
    completedSteps,
    totalSteps: steps.length,
    complete,
    canPublish: complete,
    nextStep,
  };
}

/** Convenience gate used by the picks service to block premature publishing. */
export function canPublishPicks(state: TipsterOnboardingState): boolean {
  return computeOnboardingStatus(state).canPublish;
}
