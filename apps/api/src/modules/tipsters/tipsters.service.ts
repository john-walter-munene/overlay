import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class TipstersService {
  constructor(private readonly prisma: PrismaService) {}

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
