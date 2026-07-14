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

    const recentPicks = await this.prisma.pick.findMany({
      where: { tipsterId, status: { not: 'pending' } },
      orderBy: { settledAt: 'desc' },
      take: 20,
    });

    return {
      tipsterId,
      bio: tipster.bio,
      sports: tipster.sports,
      subscriptionPriceCents: tipster.subscriptionPriceCents,
      stats: tipster.stats,
      recentPicks,
    };
  }

  /** Update the caller's own tipster profile. */
  updateProfile(
    tipsterId: string,
    data: { bio?: string; sports?: string[]; subscriptionPriceCents?: number },
  ) {
    return this.prisma.tipster.update({
      where: { userId: tipsterId },
      data,
    });
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

  /** Mark the identity-verification step complete (OB-020). */
  async completeVerification(tipsterId: string): Promise<OnboardingStatus> {
    await this.prisma.tipster.update({
      where: { userId: tipsterId },
      data: { identityVerified: true },
    });
    return this.getOnboarding(tipsterId);
  }
}
