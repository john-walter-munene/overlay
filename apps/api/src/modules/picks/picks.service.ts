import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  generateNonce,
  hashPick,
  buildPerformanceDashboard,
  type PickPayload,
  type SettledPick,
} from '@overlay/shared';
import { PrismaService } from '../../prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { canPublishPicks } from '../tipsters/onboarding';
import { CreatePickDto } from './dto/create-pick.dto';
import { buildSubscriberFeed, entitledTipsterIds, toPickRow, type FeedPick } from './feed';

@Injectable()
export class PicksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
    private readonly notifications: NotificationsService,
  ) {}

  private get pepper(): string {
    return process.env.PICK_HASH_PEPPER ?? 'dev-pepper';
  }

  /**
   * Submit and LOCK a pick. Rejects picks on events that have already started,
   * stamps a tamper-evident hash + server timestamp, and writes an audit entry.
   * The pick is append-only afterwards (see docs/ARCHITECTURE.md §4).
   */
  async createLockedPick(tipsterId: string, dto: CreatePickDto) {
    // Gate publishing on completed onboarding (OB-020): a tipster can't lock
    // picks until bio, sports, pricing, Stripe payouts and verification are done.
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');
    if (!canPublishPicks(tipster)) {
      throw new ForbiddenException(
        'Complete onboarding before publishing picks',
      );
    }

    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.startTime.getTime() <= Date.now()) {
      throw new BadRequestException('Event has already started; pick rejected');
    }

    const payload: PickPayload = {
      tipsterId,
      eventId: dto.eventId,
      market: dto.market,
      selection: dto.selection,
      oddsAtPick: dto.oddsAtPick,
      stakeUnits: dto.stakeUnits,
    };
    const nonce = generateNonce();
    const hash = hashPick(payload, nonce, this.pepper);

    const pick = await this.prisma.$transaction(async (tx) => {
      const created = await tx.pick.create({
        data: {
          tipsterId,
          eventId: dto.eventId,
          market: dto.market,
          selection: dto.selection,
          oddsAtPick: dto.oddsAtPick,
          stakeUnits: dto.stakeUnits,
          note: dto.note?.trim() || null,
          hash,
          nonce,
          status: 'pending',
        },
      });
      await tx.auditLog.create({
        data: {
          actor: `tipster:${tipsterId}`,
          action: 'pick.locked',
          entity: 'Pick',
          entityId: created.id,
          payload: { hash, market: dto.market, selection: dto.selection },
        },
      });
      return created;
    });

    // Fan out to subscribers (enqueue in production; awaited here in v1).
    await this.notifications.notifyNewPick({
      tipsterId,
      market: pick.market,
      selection: pick.selection,
      oddsAtPick: pick.oddsAtPick,
    });

    return pick;
  }

  /** Public track record: only SETTLED picks, newest first, with event context. */
  async listByTipster(tipsterId: string): Promise<FeedPick[]> {
    const picks = await this.prisma.pick.findMany({
      where: { tipsterId, status: { not: 'pending' } },
      orderBy: { lockedAt: 'desc' },
      take: 100,
      include: {
        event: {
          select: { sport: true, home: true, away: true, startTime: true },
        },
      },
    });
    return picks.map((p) => toPickRow(p));
  }

  /**
   * A tipster's own picks ("My tips"), filterable by open (pending) vs settled.
   * No subscription gate — the caller owns them.
   */
  async listMine(
    tipsterId: string,
    status?: 'open' | 'settled' | 'all',
  ): Promise<FeedPick[]> {
    const where: { tipsterId: string; status?: unknown } = { tipsterId };
    if (status === 'open') where.status = 'pending';
    else if (status === 'settled') where.status = { not: 'pending' };
    const picks = await this.prisma.pick.findMany({
      where: where as never,
      orderBy: { lockedAt: 'desc' },
      take: 200,
      include: {
        event: {
          select: { sport: true, home: true, away: true, startTime: true },
        },
      },
    });
    return picks.map((p) => toPickRow(p));
  }

  /**
   * Live picks for a subscriber — includes still-pending (pre-event) picks and
   * settled ones, with event context. Gated: requires an active subscription.
   */
  async listLiveForSubscriber(
    userId: string,
    tipsterId: string,
  ): Promise<FeedPick[]> {
    const entitled = await this.subs.isEntitled(userId, tipsterId);
    if (!entitled) {
      throw new ForbiddenException('Active subscription required');
    }
    const picks = await this.prisma.pick.findMany({
      where: { tipsterId },
      orderBy: { lockedAt: 'desc' },
      take: 100,
      include: {
        event: {
          select: { sport: true, home: true, away: true, startTime: true },
        },
      },
    });
    return picks.map((p) => toPickRow(p));
  }

  /**
   * Aggregated subscriber "My feed" (OB-012): live/pending + settled picks from
   * every tipster the user is *actively* subscribed to, newest first. Entitlement
   * is enforced by only querying tipsters with an active subscription, so a lapsed
   * or never-subscribed tipster's picks can never appear. Clients poll this to pick
   * up settlement status updates.
   */
  async feedForSubscriber(userId: string): Promise<FeedPick[]> {
    const subscriptions = await this.subs.listForUser(userId);
    const tipsterIds = entitledTipsterIds(subscriptions);
    if (tipsterIds.length === 0) return [];

    const picks = await this.prisma.pick.findMany({
      where: { tipsterId: { in: tipsterIds } },
      orderBy: { lockedAt: 'desc' },
      take: 100,
      include: {
        event: {
          select: { sport: true, home: true, away: true, startTime: true },
        },
      },
    });

    const rows: FeedPick[] = picks.map((p) => ({
      id: p.id,
      tipsterId: p.tipsterId,
      market: p.market,
      selection: p.selection,
      oddsAtPick: p.oddsAtPick,
      stakeUnits: p.stakeUnits,
      note: p.note,
      status: p.status,
      clv: p.clv,
      result: p.result,
      lockedAt: p.lockedAt.getTime(),
      settledAt: p.settledAt ? p.settledAt.getTime() : null,
      event: p.event
        ? {
            sport: p.event.sport,
            home: p.event.home,
            away: p.event.away,
            startTime: p.event.startTime.getTime(),
          }
        : null,
    }));

    // Defense-in-depth: re-apply the entitlement gate and deterministic ordering.
    return buildSubscriberFeed(rows, subscriptions);
  }

  /**
   * Performance dashboard for a tipster's own account (OB-023): cumulative
   * ROI/yield/CLV/win-rate time-series, drawdown, streak and a pending-vs-settled
   * breakdown. Built over ALL of the tipster's picks (pending included) with the
   * shared, unit-tested performance engine.
   */
  async performanceForTipster(tipsterId: string) {
    const picks = await this.prisma.pick.findMany({
      where: { tipsterId },
    });

    const input: SettledPick[] = picks.map((p) => ({
      oddsAtPick: p.oddsAtPick,
      stakeUnits: p.stakeUnits,
      status: p.status,
      closingOdds: p.closingOdds,
      settledAt: p.settledAt ? p.settledAt.getTime() : null,
    }));

    return buildPerformanceDashboard(input);
  }
}
