import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

/**
 * Free "follow" feature: a user tracks a tipster's public performance without
 * subscribing. Following never unlocks gated (live/pre-event) picks — it only
 * surfaces already-public stats and settled history, plus a Following list and
 * a subscribe CTA. Kept entirely separate from paid Subscription logic.
 */
@Injectable()
export class FollowService {
  constructor(private readonly prisma: PrismaService) {}

  /** Follow a tipster (idempotent). Returns the current follower count. */
  async follow(userId: string, tipsterId: string) {
    if (userId === tipsterId) {
      throw new ForbiddenException('You cannot follow yourself.');
    }
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
      select: { userId: true },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    await this.prisma.follow.upsert({
      where: { userId_tipsterId: { userId, tipsterId } },
      create: { userId, tipsterId },
      update: {},
    });
    const followerCount = await this.prisma.follow.count({
      where: { tipsterId },
    });
    return { following: true, followerCount };
  }

  /** Unfollow a tipster (idempotent). Returns the current follower count. */
  async unfollow(userId: string, tipsterId: string) {
    await this.prisma.follow.deleteMany({ where: { userId, tipsterId } });
    const followerCount = await this.prisma.follow.count({
      where: { tipsterId },
    });
    return { following: false, followerCount };
  }

  /** The set of tipster ids the user follows — powers the follow buttons. */
  async listMyIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { userId },
      select: { tipsterId: true },
    });
    return rows.map((r) => r.tipsterId);
  }

  /**
   * The user's followed tipsters with public performance stats, for the
   * "Following" list on the dashboard. Newest follows first.
   */
  async listMine(userId: string) {
    const follows = await this.prisma.follow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        tipster: {
          select: {
            userId: true,
            displayName: true,
            country: true,
            subscriptionPriceCents: true,
            billingInterval: true,
            user: { select: { username: true, avatarUrl: true } },
            stats: true,
          },
        },
      },
    });

    // Which of these the user already pays for — so the UI can show "Subscribed"
    // instead of a subscribe CTA.
    const subs = await this.prisma.subscription.findMany({
      where: { userId, status: 'active' },
      select: { tipsterId: true },
    });
    const subscribed = new Set(subs.map((s) => s.tipsterId));

    return follows.map((f) => ({
      tipsterId: f.tipster.userId,
      name: f.tipster.displayName ?? f.tipster.user?.username ?? null,
      avatarUrl: f.tipster.user?.avatarUrl ?? null,
      country: f.tipster.country,
      subscriptionPriceCents: f.tipster.subscriptionPriceCents,
      billingInterval: f.tipster.billingInterval,
      isSubscribed: subscribed.has(f.tipster.userId),
      followedAt: f.createdAt,
      stats: f.tipster.stats
        ? {
            yield: f.tipster.stats.yield,
            clvAvg: f.tipster.stats.clvAvg,
            winRate: f.tipster.stats.winRate,
            sampleSize: f.tipster.stats.sampleSize,
          }
        : null,
    }));
  }
}
