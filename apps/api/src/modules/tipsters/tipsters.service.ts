import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  filterAndRankTipsters,
  normalizeMarketplaceQuery,
  type MarketplacePage,
  type MarketplaceRow,
  type RawMarketplaceQuery,
} from './marketplace';
import {
  computeOnboardingStatus,
  type OnboardingStatus,
} from './onboarding';

/** Fields a tipster may edit on their own profile / during onboarding. */
export interface UpdateTipsterInput {
  displayName?: string;
  country?: string;
  contactMethod?: string;
  contactValue?: string;
  bio?: string;
  sports?: string[];
  subscriptionPriceCents?: number;
  billingInterval?: 'weekly' | 'monthly';
  socialX?: string;
  socialInstagram?: string;
  socialTelegram?: string;
  // Payout destination (OB-06x).
  payoutMethod?: 'stripe' | 'crypto' | 'mobile_money';
  payoutWalletAddress?: string;
  payoutWalletChain?: string;
  payoutMobileNumber?: string;
  payoutMobileNetwork?: string;
}

/** Metadata for a stored identity document plus optional social handles. */
export interface VerificationSubmission {
  docPath: string;
  docName: string;
  socialX?: string;
  socialInstagram?: string;
  socialTelegram?: string;
}

@Injectable()
export class TipstersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Marketplace / discovery listing (OB-010): verified tipsters with their
   * stats, filtered by sport / price / min sample, sorted by yield/CLV/win rate
   * and paginated. Suspended tipsters are excluded. The candidate set is small
   * (verified tipsters only), so narrowing/sorting/paging runs in the shared,
   * unit-tested pure helper.
   */
  async listMarketplace(raw: RawMarketplaceQuery): Promise<MarketplacePage> {
    const query = normalizeMarketplaceQuery(raw);

    const stats = await this.prisma.tipsterStats.findMany({
      where: { tipster: { status: 'active' } },
      include: {
        tipster: {
          select: { bio: true, sports: true, subscriptionPriceCents: true },
        },
      },
    });

    const rows: MarketplaceRow[] = stats.map((s) => ({
      tipsterId: s.tipsterId,
      yield: s.yield,
      clvAvg: s.clvAvg,
      winRate: s.winRate,
      sampleSize: s.sampleSize,
      sports: s.tipster.sports,
      subscriptionPriceCents: s.tipster.subscriptionPriceCents,
      bio: s.tipster.bio,
    }));

    return filterAndRankTipsters(rows, query);
  }

  /** Public tipster profile: bio, verified stats, and recent settled picks. */
  async getProfile(tipsterId: string) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
      include: { stats: true },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    const [recentPicks, articlesPublished, subscriberCount] = await Promise.all([
      this.prisma.pick.findMany({
        where: { tipsterId, status: { not: 'pending' } },
        orderBy: { settledAt: 'desc' },
        take: 20,
      }),
      // Published articles authored by this tipster count toward the public
      // profile — a signal of the analysis/content they contribute.
      this.prisma.article.count({
        where: { authorId: tipsterId, status: 'published' },
      }),
      this.prisma.subscription.count({
        where: { tipsterId, status: 'active' },
      }),
    ]);

    return {
      tipsterId,
      displayName: tipster.displayName,
      country: tipster.country,
      bio: tipster.bio,
      sports: tipster.sports,
      subscriptionPriceCents: tipster.subscriptionPriceCents,
      billingInterval: tipster.billingInterval,
      verified: tipster.identityVerified,
      socials: {
        x: tipster.socialX,
        instagram: tipster.socialInstagram,
        telegram: tipster.socialTelegram,
      },
      stats: tipster.stats,
      subscriberCount,
      articlesPublished,
      recentPicks,
    };
  }

  /** Update the caller's own tipster profile. */
  updateProfile(tipsterId: string, data: UpdateTipsterInput) {
    return this.prisma.tipster.update({
      where: { userId: tipsterId },
      data,
    });
  }

  /**
   * The caller's own editable profile, including private fields (contact
   * details, uploaded document name) the public profile never exposes. Backs
   * prefilling the onboarding wizard so a returning tipster resumes in place.
   */
  async getEditableProfile(tipsterId: string) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');
    return {
      displayName: tipster.displayName,
      country: tipster.country,
      contactMethod: tipster.contactMethod,
      contactValue: tipster.contactValue,
      bio: tipster.bio,
      sports: tipster.sports,
      subscriptionPriceCents: tipster.subscriptionPriceCents,
      billingInterval: tipster.billingInterval,
      socialX: tipster.socialX,
      socialInstagram: tipster.socialInstagram,
      socialTelegram: tipster.socialTelegram,
      identityVerified: tipster.identityVerified,
      identityDocName: tipster.identityDocName,
      payoutMethod: tipster.payoutMethod,
      payoutWalletAddress: tipster.payoutWalletAddress,
      payoutWalletChain: tipster.payoutWalletChain,
      payoutMobileNumber: tipster.payoutMobileNumber,
      payoutMobileNetwork: tipster.payoutMobileNetwork,
    };
  }

  /** Active-subscriber count for the caller's own dashboard (OB-020). */
  async getSubscriberCount(tipsterId: string): Promise<{ count: number }> {
    const count = await this.prisma.subscription.count({
      where: { tipsterId, status: 'active' },
    });
    return { count };
  }

  /**
   * Onboarding wizard status for the caller (OB-020): per-step completion,
   * the next step to complete and whether they may publish picks yet.
   */
  async getOnboarding(tipsterId: string): Promise<OnboardingStatus> {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');
    return computeOnboardingStatus(tipster);
  }

  /**
   * Mark the Stripe Connect onboarding step complete (OB-020). Real Connect
   * onboarding (account link + `details_submitted` webhook) lands in OB-040;
   * until then this records that the tipster has connected payouts so the
   * wizard can progress.
   */
  async completeStripeOnboarding(tipsterId: string): Promise<OnboardingStatus> {
    await this.prisma.tipster.update({
      where: { userId: tipsterId },
      data: { stripeOnboarded: true },
    });
    return this.getOnboarding(tipsterId);
  }

  /**
   * Complete the optional identity-verification step (OB-020) by recording the
   * uploaded official document plus any social ("digital identity") handles and
   * flagging the tipster as verified. Verification is not required to publish,
   * but the verified badge unlocks marketplace trust advantages.
   */
  async submitVerification(
    tipsterId: string,
    submission: VerificationSubmission,
  ): Promise<OnboardingStatus> {
    const socials: UpdateTipsterInput = {};
    if (submission.socialX !== undefined) socials.socialX = submission.socialX;
    if (submission.socialInstagram !== undefined)
      socials.socialInstagram = submission.socialInstagram;
    if (submission.socialTelegram !== undefined)
      socials.socialTelegram = submission.socialTelegram;

    await this.prisma.tipster.update({
      where: { userId: tipsterId },
      data: {
        ...socials,
        identityDocPath: submission.docPath,
        identityDocName: submission.docName,
        identityDocSubmittedAt: new Date(),
        identityVerified: true,
      },
    });
    return this.getOnboarding(tipsterId);
  }
}
