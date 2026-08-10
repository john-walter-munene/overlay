/**
 * Pure GDPR / data-subject-request logic (OB-085).
 *
 * Kept free of Nest/Prisma (mirrors onboarding.ts / marketplace.ts) so the
 * export shaping rules can be unit-tested in isolation. The service reads the
 * persisted rows and delegates the "what do we hand back" decisions here.
 */

/** Minimal shapes of the rows we assemble into a data-subject export. */
export interface ExportableUser {
  id: string;
  email: string;
  role: string;
  createdAt: Date | string;
}

export interface ExportableTipster {
  displayName?: string | null;
  country?: string | null;
  contactMethod?: string | null;
  contactValue?: string | null;
  bio: string | null;
  sports: string[];
  subscriptionPriceCents: number;
  billingInterval?: string;
  socialX?: string | null;
  socialInstagram?: string | null;
  socialTelegram?: string | null;
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
