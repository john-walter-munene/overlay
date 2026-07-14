/**
 * Pure GDPR / data-subject-request logic (OB-085).
 *
 * Kept free of Nest/Prisma (mirrors onboarding.ts / marketplace.ts) so the
 * export shaping and PII-erasure rules can be unit-tested in isolation. The
 * service reads the persisted rows and delegates the "what do we hand back /
 * what do we scrub" decisions here.
 *
 * Erasure model: we ANONYMIZE rather than hard-delete. The `picks` table is
 * append-only and is the platform's integrity moat (docs/ARCHITECTURE.md §4),
 * and financial rows (subscriptions/payouts) carry legal retention duties. So
 * an erasure strips direct PII from the `User`/`Tipster` rows while leaving the
 * append-only pick records — including their hash/nonce/timestamp integrity
 * fields — completely untouched. See docs/PRIVACY.md.
 */

/** Domain used for anonymized placeholder emails; never a deliverable inbox. */
export const ANONYMIZED_EMAIL_DOMAIN = 'deleted.overlay';

/**
 * Models/fields whose PII is scrubbed on erasure, for the retention audit and
 * to document (and test) that `Pick` is deliberately excluded.
 */
export const PII_ERASURE_FIELDS = {
  User: ['email', 'passwordHash', 'supabaseUserId'],
  Tipster: ['bio', 'stripeAccountId'],
} as const;

/**
 * Deterministic, unique placeholder email for an erased user. Derived from the
 * (non-PII) user id so it satisfies the `email` unique constraint without
 * retaining the real address.
 */
export function anonymizedEmail(userId: string): string {
  return `deleted-${userId}@${ANONYMIZED_EMAIL_DOMAIN}`;
}

/**
 * Prisma update payload that strips a user's direct PII while KEEPING the row,
 * preserving foreign-key integrity for append-only picks and financial rows.
 */
export function userErasureData(userId: string) {
  return {
    email: anonymizedEmail(userId),
    passwordHash: null,
    supabaseUserId: null,
  };
}

/**
 * Prisma update payload that strips a tipster profile's PII and hides the now
 * anonymized profile from public discovery surfaces.
 */
export function tipsterErasureData() {
  return {
    bio: null,
    stripeAccountId: null,
    status: 'suspended' as const,
  };
}

/** Minimal shapes of the rows we assemble into a data-subject export. */
export interface ExportableUser {
  id: string;
  email: string;
  role: string;
  createdAt: Date | string;
}

export interface ExportableTipster {
  bio: string | null;
  sports: string[];
  subscriptionPriceCents: number;
  status: string;
  createdAt: Date | string;
}

export interface ExportablePick {
  id: string;
  eventId: string;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
  status: string;
  lockedAt: Date | string;
  settledAt: Date | string | null;
}

export interface ExportableSubscription {
  id: string;
  tipsterId: string;
  status: string;
  currentPeriodEnd: Date | string | null;
}

export interface ExportableArticle {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: Date | string;
}

export interface UserExportInput {
  user: ExportableUser;
  tipster?: ExportableTipster | null;
  picks?: ExportablePick[];
  subscriptions?: ExportableSubscription[];
  articles?: ExportableArticle[];
}

export interface UserExport {
  generatedAt: string;
  account: ExportableUser;
  tipsterProfile: ExportableTipster | null;
  picks: ExportablePick[];
  subscriptions: ExportableSubscription[];
  articles: ExportableArticle[];
}

/**
 * Assemble the machine-readable portability bundle handed to a user exercising
 * their GDPR right of access / portability. Only data tied to the requesting
 * user is included.
 */
export function buildUserExport(
  input: UserExportInput,
  now: Date = new Date(),
): UserExport {
  return {
    generatedAt: now.toISOString(),
    account: input.user,
    tipsterProfile: input.tipster ?? null,
    picks: input.picks ?? [],
    subscriptions: input.subscriptions ?? [],
    articles: input.articles ?? [],
  };
}
