import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  generateNonce,
  hashPick,
  type PickPayload,
} from '@overlay/shared';
import { PrismaService } from '../../prisma.service';
import { CreatePickDto } from './dto/create-pick.dto';

@Injectable()
export class PicksService {
  constructor(private readonly prisma: PrismaService) {}

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

    // TODO: publish "new_pick" to Redis and enqueue dispatch-notifications.
    return pick;
  }

  /** List a tipster's picks (settlement fields are public once graded). */
  listByTipster(tipsterId: string) {
    return this.prisma.pick.findMany({
      where: { tipsterId },
      orderBy: { lockedAt: 'desc' },
    });
  }
}
