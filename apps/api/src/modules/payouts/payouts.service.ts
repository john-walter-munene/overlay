import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PAYMENT_REGISTRY } from '../../integrations/payments/payments.module';
import type { PaymentProviderRegistry } from '../../integrations/payments/payment-provider.registry';
import { computeNetFromGross, summarizeEarnings, isoWeekKey } from './payouts.math';
import { resolvePayoutTarget, type TipsterPayoutFields } from './payout-destination';

/** Payout rows that still reserve collected revenue (count against balance). */
const RESERVING_STATUSES = ['pending', 'paid', 'awaiting_approval'] as const;

@Injectable()
export class PayoutsService {
  private readonly log = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
    @Inject(PAYMENT_REGISTRY) private readonly registry: PaymentProviderRegistry,
  ) {}

  private get feeRate(): number {
    return Number(process.env.PLATFORM_FEE_RATE ?? 0.2);
  }

  /**
   * Earnings overview for a tipster's own dashboard (OB-024): projected/current
   * earnings from active subscribers, the platform fee, subscriber count and
   * their payout history with statuses.
   */
  async getEarnings(tipsterId: string) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    const activeSubscribers =
      await this.subs.countActiveSubscribers(tipsterId);

    const payouts = await this.prisma.payout.findMany({
      where: { tipsterId },
      orderBy: { createdAt: 'desc' },
    });

    const summary = summarizeEarnings(
      activeSubscribers,
      tipster.subscriptionPriceCents,
      this.feeRate,
      payouts,
    );

    // Net revenue collected but not yet covered by a payout — withdrawable now.
    const availableGross = await this.availableGrossCents(tipsterId);
    const { netCents: availableCents } = computeNetFromGross(
      availableGross,
      this.feeRate,
    );
    const awaitingApproval = payouts.some(
      (p) => p.status === 'awaiting_approval',
    );

    return {
      ...summary,
      availableCents,
      awaitingApproval,
      payouts: payouts.map((p) => ({
        id: p.id,
        period: p.period,
        amountCents: p.amountCents,
        status: p.status,
        kind: p.kind,
        createdAt: p.createdAt,
      })),
    };
  }

  /**
   * Net revenue collected for a tipster that isn't yet reserved by a payout —
   * their withdrawable balance (in gross terms). Collected gross from the funds
   * ledger minus gross already reserved by non-rejected/failed payouts, so the
   * same revenue is never paid out twice.
   */
  async availableGrossCents(tipsterId: string): Promise<number> {
    const [collected, reserved] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { tipsterId },
        _sum: { amountCents: true },
      }),
      this.prisma.payout.aggregate({
        where: { tipsterId, status: { in: [...RESERVING_STATUSES] } },
        _sum: { grossCents: true },
      }),
    ]);
    const collectedGross = collected._sum.amountCents ?? 0;
    const reservedGross = reserved._sum.grossCents ?? 0;
    return Math.max(0, collectedGross - reservedGross);
  }

  /**
   * Regular weekly payout batch — **admin-triggered** (run every Tuesday). Pays
   * each active tipster their available balance and transfers immediately.
   * Balance-based and idempotent per (tipster, week) so re-running the same week
   * never double-pays. `period` defaults to the current ISO week.
   */
  async runScheduled(period?: string): Promise<{ processed: number }> {
    const week = period ?? isoWeekKey(new Date());
    const tipsters = await this.prisma.tipster.findMany({
      where: { status: 'active' },
    });

    let processed = 0;
    for (const tipster of tipsters) {
      const already = await this.prisma.payout.findFirst({
        where: { tipsterId: tipster.userId, period: week, kind: 'scheduled' },
      });
      if (already) continue;

      const grossCents = await this.availableGrossCents(tipster.userId);
      if (grossCents <= 0) continue;
      const { feeCents, netCents } = computeNetFromGross(
        grossCents,
        this.feeRate,
      );
      if (netCents <= 0) continue;

      const payout = await this.prisma.payout.create({
        data: {
          tipsterId: tipster.userId,
          kind: 'scheduled',
          period: week,
          grossCents,
          feeCents,
          amountCents: netCents,
          status: 'pending',
        },
      });
      await this.settleTransfer(
        payout.id,
        tipster,
        netCents,
        `${tipster.userId}:${week}`,
      );
      processed += 1;
    }

    this.log.log(
      `Scheduled payouts for ${week}: processed ${processed} tipster(s)`,
    );
    return { processed };
  }

  /**
   * A tipster requests an **off-schedule (on-demand)** payout of their available
   * balance. This does NOT transfer — it's created `awaiting_approval` and an
   * admin must approve it before funds move.
   */
  async requestOnDemand(tipsterId: string) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    const pending = await this.prisma.payout.findFirst({
      where: { tipsterId, status: 'awaiting_approval' },
    });
    if (pending) {
      throw new BadRequestException(
        'You already have a payout awaiting approval.',
      );
    }

    const grossCents = await this.availableGrossCents(tipsterId);
    const { feeCents, netCents } = computeNetFromGross(grossCents, this.feeRate);
    if (netCents <= 0) {
      throw new BadRequestException('No balance available to withdraw yet.');
    }

    const payout = await this.prisma.payout.create({
      data: {
        tipsterId,
        kind: 'on_demand',
        period: `on_demand:${new Date().toISOString().slice(0, 10)}`,
        grossCents,
        feeCents,
        amountCents: netCents,
        status: 'awaiting_approval',
      },
    });
    return { id: payout.id, amountCents: netCents, status: payout.status };
  }

  /** Admin: list payout requests awaiting approval. */
  async listAwaitingApproval() {
    const payouts = await this.prisma.payout.findMany({
      where: { status: 'awaiting_approval' },
      orderBy: { createdAt: 'asc' },
      include: {
        tipster: {
          select: {
            userId: true,
            displayName: true,
            user: { select: { username: true } },
          },
        },
      },
    });
    return payouts.map((p) => ({
      id: p.id,
      tipsterId: p.tipsterId,
      tipsterName: p.tipster.displayName ?? p.tipster.user?.username ?? null,
      amountCents: p.amountCents,
      grossCents: p.grossCents,
      feeCents: p.feeCents,
      kind: p.kind,
      createdAt: p.createdAt,
    }));
  }

  /** Admin: approve an on-demand request → transfer the funds. */
  async approve(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'awaiting_approval') {
      throw new ForbiddenException('This payout is not awaiting approval.');
    }
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: payout.tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'pending' },
    });
    await this.settleTransfer(
      payoutId,
      tipster,
      payout.amountCents,
      `${payout.tipsterId}:${payoutId}`,
    );
    const updated = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    return { id: payoutId, status: updated?.status };
  }

  /** Admin: reject an on-demand request (releases the reserved balance). */
  async reject(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'awaiting_approval') {
      throw new ForbiddenException('This payout is not awaiting approval.');
    }
    await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'rejected' },
    });
    return { id: payoutId, status: 'rejected' as const };
  }

  /**
   * Route a payout to the tipster's chosen rail and record the result. No
   * complete destination → leaves it pending to claim once one is added.
   */
  private async settleTransfer(
    payoutId: string,
    tipster: TipsterPayoutFields & { userId: string },
    amountCents: number,
    idempotencyKey: string,
  ) {
    const target = resolvePayoutTarget(tipster);
    if (!target) return; // no destination yet → stays pending
    try {
      const transfer = await this.registry
        .get(target.provider)
        .transferToTipster({
          destination: target.destination,
          amountCents,
          idempotencyKey,
        });
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { status: 'paid', stripeTransferId: transfer.reference },
      });
    } catch (err) {
      this.log.error(
        `Payout transfer failed for ${tipster.userId}`,
        err as Error,
      );
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { status: 'failed' },
      });
    }
  }
}
