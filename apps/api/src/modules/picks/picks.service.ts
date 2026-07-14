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
import { CreatePickDto } from './dto/create-pick.dto';

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

  /** Public track record: only SETTLED picks. Live/pending picks are gated. */
  listByTipster(tipsterId: string) {
    return this.prisma.pick.findMany({
      where: { tipsterId, status: { not: 'pending' } },
      orderBy: { lockedAt: 'desc' },
    });
  }

  /**
   * Live picks for a subscriber — includes still-pending (pre-event) picks.
   * Gated: requires an active subscription to the tipster.
   */
  async listLiveForSubscriber(userId: string, tipsterId: string) {
    const entitled = await this.subs.isEntitled(userId, tipsterId);
    if (!entitled) {
      throw new ForbiddenException('Active subscription required');
    }
    return this.prisma.pick.findMany({
      where: { tipsterId },
      orderBy: { lockedAt: 'desc' },
      take: 100,
    });
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
