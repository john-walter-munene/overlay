import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  buildUserExport,
  tipsterErasureData,
  userErasureData,
  type UserExport,
} from './privacy';

/**
 * Data-subject-request flows for GDPR compliance (OB-085): self-service export
 * (right of access / portability) and erasure (right to be forgotten).
 *
 * Erasure anonymizes PII in place rather than hard-deleting, so the append-only
 * `picks` store and financial records stay intact (docs/PRIVACY.md).
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
          bio: true,
          sports: true,
          subscriptionPriceCents: true,
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

  /**
   * Erase (anonymize) the requesting user's PII. The append-only `picks` rows —
   * including their hash/nonce/timestamp integrity fields — are intentionally
   * left untouched; only the mutable `User`/`Tipster` PII is scrubbed. The
   * action is recorded in the audit log for accountability.
   */
  async eraseUser(userId: string): Promise<{ erased: true; userId: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: userErasureData(userId),
      });

      const tipster = await tx.tipster.findUnique({ where: { userId } });
      if (tipster) {
        await tx.tipster.update({
          where: { userId },
          data: tipsterErasureData(),
        });
      }

      await tx.auditLog.create({
        data: {
          actor: `user:${userId}`,
          action: 'user.erased',
          entity: 'User',
          entityId: userId,
          payload: { tipster: Boolean(tipster) },
        },
      });
    });

    return { erased: true, userId };
  }
}
