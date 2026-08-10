import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { buildUserExport, type UserExport } from './privacy';

/**
 * Data-subject-request flow for GDPR compliance (OB-085): self-service export
 * (right of access / portability).
 */
@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Assemble the requesting user's personal-data export bundle. */
  async exportUser(userId: string): Promise<UserExport> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const [tipster, subscriptions, articles] = await Promise.all([
      this.prisma.tipster.findUnique({
        where: { userId },
        select: {
          displayName: true,
          country: true,
          contactMethod: true,
          contactValue: true,
          bio: true,
          sports: true,
          subscriptionPriceCents: true,
          billingInterval: true,
          socialX: true,
          socialInstagram: true,
          socialTelegram: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.subscription.findMany({
        where: { userId },
        select: {
          id: true,
          tipsterId: true,
          status: true,
          currentPeriodEnd: true,
        },
      }),
      this.prisma.article.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const picks = tipster
      ? await this.prisma.pick.findMany({
          where: { tipsterId: userId },
          orderBy: { lockedAt: 'asc' },
          select: {
            id: true,
            eventId: true,
            market: true,
            selection: true,
            oddsAtPick: true,
            stakeUnits: true,
            status: true,
            lockedAt: true,
            settledAt: true,
          },
        })
      : [];

    return buildUserExport({ user, tipster, picks, subscriptions, articles });
  }
}
