import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  filterAndRankTipsters,
  normalizeMarketplaceQuery,
  type MarketplacePage,
  type MarketplaceRow,
  type RawMarketplaceQuery,
} from './marketplace';

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
}
