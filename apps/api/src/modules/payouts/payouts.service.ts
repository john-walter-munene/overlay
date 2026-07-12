import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PAYMENT_PROVIDER } from '../../integrations/payments/payments.module';
import type { PaymentProvider } from '../../integrations/payments/payment-provider.interface';
import { computePayout } from './payouts.math';

@Injectable()
export class PayoutsService {
  private readonly log = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  private get feeRate(): number {
    return Number(process.env.PLATFORM_FEE_RATE ?? 0.25);
  }

  /**
   * Run payouts for a period (e.g. '2026-07'). Idempotent per (tipster, period):
   * skips any tipster already paid for that period. Called by the monthly
   * run-payouts worker or an admin endpoint.
   */
  async runForPeriod(period: string): Promise<{ processed: number }> {
    const tipsters = await this.prisma.tipster.findMany({
      where: { status: 'active' },
    });

    let processed = 0;
    for (const tipster of tipsters) {
      const already = await this.prisma.payout.findFirst({
        where: { tipsterId: tipster.userId, period },
      });
      if (already) continue;

      const activeSubs = await this.subs.countActiveSubscribers(
        tipster.userId,
      );
      const { netCents } = computePayout(
        activeSubs,
        tipster.subscriptionPriceCents,
        this.feeRate,
      );
      if (netCents <= 0) continue;

      const payout = await this.prisma.payout.create({
        data: {
          tipsterId: tipster.userId,
          amountCents: netCents,
          period,
          status: 'pending',
        },
      });

      if (tipster.stripeAccountId) {
        try {
          const transfer = await this.payments.transferToTipster({
            tipsterAccountId: tipster.stripeAccountId,
            amountCents: netCents,
            idempotencyKey: `${tipster.userId}:${period}`,
          });
          await this.prisma.payout.update({
            where: { id: payout.id },
            data: { status: 'paid', stripeTransferId: transfer.reference },
          });
        } catch (err) {
          this.log.error(`Payout transfer failed for ${tipster.userId}`, err as Error);
          await this.prisma.payout.update({
            where: { id: payout.id },
            data: { status: 'failed' },
          });
        }
      }
      processed += 1;
    }

    this.log.log(`Payouts for ${period}: processed ${processed} tipster(s)`);
    return { processed };
  }
}
