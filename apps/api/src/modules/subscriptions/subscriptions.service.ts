import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PAYMENT_PROVIDER } from '../../integrations/payments/payments.module';
import type {
  PaymentProvider,
  SubscriptionEvent,
} from '../../integrations/payments/payment-provider.interface';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  /** Begin a subscription checkout for a user subscribing to a tipster. */
  async createCheckout(userId: string, tipsterId: string) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');
    if (tipster.subscriptionPriceCents <= 0) {
      throw new ForbiddenException('Tipster is not accepting subscriptions');
    }
    return this.payments.createSubscriptionCheckout({
      userId,
      tipsterId,
      priceCents: tipster.subscriptionPriceCents,
    });
  }

  /** Apply a verified provider webhook to subscription state. */
  async applyWebhook(rawBody: string, signature: string) {
    const evt = this.payments.parseWebhook(rawBody, signature);
    if (!evt) return { handled: false };
    await this.upsertFromEvent(evt);
    return { handled: true };
  }

  private upsertFromEvent(evt: SubscriptionEvent) {
    const status =
      evt.type === 'activated'
        ? 'active'
        : evt.type === 'past_due'
          ? 'past_due'
          : 'canceled';
    return this.prisma.subscription.upsert({
      where: { userId_tipsterId: { userId: evt.userId, tipsterId: evt.tipsterId } },
      create: {
        userId: evt.userId,
        tipsterId: evt.tipsterId,
        stripeSubscriptionId: evt.providerSubscriptionId,
        status,
        currentPeriodEnd: evt.currentPeriodEnd,
      },
      update: { status, currentPeriodEnd: evt.currentPeriodEnd },
    });
  }

  /** Does this user have an active subscription to this tipster? */
  async isEntitled(userId: string, tipsterId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId_tipsterId: { userId, tipsterId } },
    });
    return sub?.status === 'active';
  }

  listForUser(userId: string) {
    return this.prisma.subscription.findMany({ where: { userId } });
  }

  /** Active subscriber count per tipster — used by payouts. */
  countActiveSubscribers(tipsterId: string) {
    return this.prisma.subscription.count({
      where: { tipsterId, status: 'active' },
    });
  }
}
