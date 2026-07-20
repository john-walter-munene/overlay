import { Injectable, NotFoundException } from '@nestjs/common';
import {
  computeVerifiedMetrics,
  graduationBadge,
  isLivePicksGated,
  normalizeGraduationStatus,
  stripHtml,
  type SettledPick,
} from '@overlay/shared';
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
          select: {
            bio: true,
            sports: true,
            subscriptionPriceCents: true,
            country: true,
            displayName: true,
            user: { select: { username: true, avatarUrl: true } },
          },
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
      country: s.tipster.country,
      name: s.tipster.displayName ?? s.tipster.user?.username ?? null,
      avatarUrl: s.tipster.user?.avatarUrl ?? null,
    }));

    return filterAndRankTipsters(rows, query);
  }

  /**
   * Active tipster ids + last-modified timestamps for sitemap / ISR static
   * generation (OB-131). Mirrors the articles sitemap: the web app pre-renders
   * these public profiles at build time and revalidates them on a schedule.
   * `updatedAt` reflects the tipster's stats refresh (the profile's most
   * frequently changing input), falling back to account creation time.
   */
  async listPublicTipsterIds(): Promise<
    { tipsterId: string; updatedAt: string }[]
  > {
    const tipsters = await this.prisma.tipster.findMany({
      where: { status: 'active' },
      select: {
        userId: true,
        createdAt: true,
        stats: { select: { updatedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tipsters.map((t) => ({
      tipsterId: t.userId,
      updatedAt: (t.stats?.updatedAt ?? t.createdAt).toISOString(),
    }));
  }

  /** Public tipster profile: bio, verified stats, and recent settled picks. */
  async getProfile(tipsterId: string) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
      include: {
        stats: true,
        user: { select: { username: true, avatarUrl: true } },
      },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    const graduationStatus = normalizeGraduationStatus(
      tipster.graduationStatus,
    );
    const liveGated = isLivePicksGated({
      graduationStatus,
      subscriptionGatingEnabled: tipster.subscriptionGatingEnabled,
    });

    const [recentPicks, articlesPublished, subscriberCount, followerCount] =
      await Promise.all([
        this.prisma.pick.findMany({
          where: { tipsterId, status: { not: 'pending' } },
          orderBy: { settledAt: 'desc' },
          take: 20,
          // Public profile: expose only display fields — never the internal
          // integrity fields (hash/nonce). The lock timestamp is the only
          // integrity signal we surface, in plain language.
          select: {
            id: true,
            market: true,
            selection: true,
            oddsAtPick: true,
            pickType: true,
            status: true,
            clv: true,
            note: true,
            settledAt: true,
          },
        }),
        // Published articles authored by this tipster count toward the public
        // profile — a signal of the analysis/content they contribute.
        this.prisma.article.count({
          where: { authorId: tipsterId, status: 'published' },
        }),
        this.prisma.subscription.count({
          where: { tipsterId, status: 'active' },
        }),
        this.prisma.follow.count({ where: { tipsterId } }),
      ]);

    // Additional verified metrics (OB-057): CLV distribution, ROI by sport /
    // market, and 30/90/all-time windows. Computed over the PRE-MATCH book (the
    // CLV-bearing track record) with the shared, unit-tested engine so the
    // numbers are deterministic and never blended with in-play results (OB-039).
    const metricPicks = await this.prisma.pick.findMany({
      where: { tipsterId, status: { not: 'pending' }, pickType: 'pre_match' },
      select: {
        oddsAtPick: true,
        stakeUnits: true,
        status: true,
        pickType: true,
        closingOdds: true,
        settledAt: true,
        market: true,
        event: { select: { sport: true } },
      },
    });
    const metricInput: SettledPick[] = metricPicks.map((p) => ({
      oddsAtPick: p.oddsAtPick,
      stakeUnits: p.stakeUnits,
      status: p.status,
      pickType: p.pickType,
      closingOdds: p.closingOdds,
      settledAt: p.settledAt ? p.settledAt.getTime() : null,
      sport: p.event?.sport ?? null,
      market: p.market,
    }));
    const verifiedMetrics = metricInput.length
      ? computeVerifiedMetrics(metricInput)
      : null;

    // When live picks aren't gated (provisional "rising" tipster, or a verified
    // tipster who hasn't enabled subscription gating), their open (pre-event)
    // picks are free/public — surface them so anyone can see the current tips.
    const openPicks = liveGated
      ? []
      : await this.prisma.pick.findMany({
          where: { tipsterId, status: 'pending' },
          orderBy: { lockedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            market: true,
            selection: true,
            oddsAtPick: true,
            status: true,
            note: true,
            lockedAt: true,
          },
        });

    return {
      tipsterId,
      displayName: tipster.displayName,
      username: tipster.user?.username ?? null,
      avatarUrl: tipster.user?.avatarUrl ?? null,
      country: tipster.country,
      bio: tipster.bio,
      sports: tipster.sports,
      subscriptionPriceCents: tipster.subscriptionPriceCents,
      billingInterval: tipster.billingInterval,
      verified: tipster.identityVerified,
      // Rising-tipster graduation (OB-153): the public badge plus whether live
      // picks are currently gated behind a subscription.
      graduation: graduationBadge(graduationStatus),
      liveGated,
      socials: {
        x: tipster.socialX,
        instagram: tipster.socialInstagram,
        telegram: tipster.socialTelegram,
      },
      stats: tipster.stats,
      // OB-057: CLV distribution, ROI by sport/market, 30/90/all-time windows.
      verifiedMetrics,
      subscriberCount,
      followerCount,
      articlesPublished,
      recentPicks,
      // Free open picks (empty when gated).
      openPicks,
    };
  }

  /** Update the caller's own tipster profile. */
  updateProfile(tipsterId: string, data: UpdateTipsterInput) {
    // Defense-in-depth: the bio is free-form, user-generated content shown on
    // the public profile. Strip any HTML so no markup/script can ever be stored
    // and later rendered (guards against stored XSS regardless of the client).
    const sanitized: UpdateTipsterInput =
      data.bio === undefined ? data : { ...data, bio: stripHtml(data.bio) };
    return this.prisma.tipster.update({
      where: { userId: tipsterId },
      data: sanitized,
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
