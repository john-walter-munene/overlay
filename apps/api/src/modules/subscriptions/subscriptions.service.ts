import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PAYMENT_REGISTRY } from '../../integrations/payments/payments.module';
import {
  isSubscriptionEntitled,
  subscriptionStatusFromEvent,
} from '@overlay/shared';
import { currencyForCountry, formatMinorUnits } from '@overlay/shared';
import { webhookEventsTotal } from '../../common/metrics';
import { CurrencyService } from '../../integrations/fx/currency.service';
import type { PaymentProviderRegistry } from '../../integrations/payments/payment-provider.registry';
import type {
  PaymentMethodId,
  SubscriptionEvent,
} from '../../integrations/payments/payment-provider.interface';
import {
  periodOf,
  recordPayment,
  grossCollectedForPeriod,
} from './ledger';

// Re-exported for backwards compatibility with existing importers.
export { periodOf };

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_REGISTRY) private readonly registry: PaymentProviderRegistry,
    private readonly currency: CurrencyService,
  ) {}

  /** Payment methods enabled across all wired providers (for the UI picker). */
  listPaymentMethods(): { methods: PaymentMethodId[] } {
    return { methods: this.registry.methods() };
  }

  /**
   * Auto-suggested local-currency price for a tipster (OB-06x). Resolves the
   * target currency from an explicit `currency` override, else the subscriber's
   * `country`. Used by the checkout UI to show "≈ KES 2,578.71".
   */
  async quote(
    tipsterId: string,
    opts: { country?: string; currency?: string } = {},
  ) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
      select: { subscriptionPriceCents: true },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');
    const targetCurrency =
      opts.currency?.toUpperCase() ??
      currencyForCountry(opts.country) ??
      undefined;
    const q = await this.currency.quote(
      tipster.subscriptionPriceCents,
      targetCurrency,
    );
    return {
      usdCents: tipster.subscriptionPriceCents,
      currency: q.currency,
      amountMinor: q.amountMinor,
      converted: q.converted,
      display: formatMinorUnits(q.amountMinor, q.currency),
    };
  }

  /**
   * Begin a subscription checkout for a user subscribing to a tipster. When a
   * `method` is given it's routed to the provider that settles it; otherwise
   * the default provider is used. The charge currency comes from an explicit
   * `currency` override, else the subscriber's `country`, and is passed to
   * providers that charge locally (e.g. mobile money).
   */
  async createCheckout(
    userId: string,
    tipsterId: string,
    method?: PaymentMethodId,
    country?: string,
    currency?: string,
  ) {
    // A tipster can't subscribe to their own account.
    if (userId === tipsterId) {
      throw new BadRequestException(
        'You cannot subscribe to your own tipster account.',
      );
    }

    // Only bettor (user) accounts can subscribe. A tipster (or admin) account
    // must use a separate user account to subscribe to other tipsters.
    const subscriber = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    if (subscriber?.role === 'tipster') {
      throw new ForbiddenException(
        'Tipster accounts cannot subscribe to tipsters. Sign up for a bettor (user) account to subscribe.',
      );
    }

    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');
    if (tipster.subscriptionPriceCents <= 0) {
      throw new ForbiddenException('Tipster is not accepting subscriptions');
    }

    const provider = method
      ? this.registry.forMethod(method)
      : this.registry.default;
    if (!provider) {
      throw new BadRequestException(`Unsupported payment method: ${method}`);
    }

    // Quote the price in the subscriber's chosen/local currency when known.
    const targetCurrency =
      currency?.toUpperCase() ?? currencyForCountry(country) ?? undefined;
    const quote = await this.currency.quote(
      tipster.subscriptionPriceCents,
      targetCurrency,
    );

    const session = await provider.createSubscriptionCheckout({
      userId,
      tipsterId,
      priceCents: tipster.subscriptionPriceCents,
      method,
      customerEmail: subscriber?.email,
      chargeCurrency: quote.converted ? quote.currency : undefined,
      chargeAmountMinor: quote.converted ? quote.amountMinor : undefined,
    });
    return { ...session, provider: provider.name };
  }

  /**
   * Apply a verified provider webhook to subscription state. `providerName`
   * comes from the route (`/webhook/:provider`); when omitted/unknown we fall
   * back to the default provider so the legacy `/webhook` route keeps working.
   * `headers` are forwarded so each provider can verify its own signature.
   */
  async applyWebhook(
    providerName: string | undefined,
    rawBody: string,
    headers: Record<string, string>,
  ) {
    const provider =
      providerName && this.registry.has(providerName)
        ? this.registry.get(providerName)
        : this.registry.default;

    // OB-093: a null event means the signature/payload failed verification —
    // the webhook-failure SLI. Successful applies are counted as "handled".
    const evt = provider.parseWebhook(rawBody, headers);
    if (!evt) {
      webhookEventsTotal.inc({ result: 'failed' });
      return { handled: false };
    }
    await this.upsertFromEvent(evt);
    webhookEventsTotal.inc({ result: 'handled' });
    return { handled: true };
  }

  private async upsertFromEvent(evt: SubscriptionEvent) {
    // 'refunded' has no distinct subscription status — it revokes access.
    const statusType = evt.type === 'refunded' ? 'canceled' : evt.type;
    const status = subscriptionStatusFromEvent(statusType);
    await this.prisma.subscription.upsert({
      where: { userId_tipsterId: { userId: evt.userId, tipsterId: evt.tipsterId } },
      create: {
        userId: evt.userId,
        tipsterId: evt.tipsterId,
        provider: evt.provider,
        stripeSubscriptionId: evt.providerSubscriptionId,
        status,
        currentPeriodEnd: evt.currentPeriodEnd,
      },
      update: { provider: evt.provider, status, currentPeriodEnd: evt.currentPeriodEnd },
    });

    // Money-moving events are mirrored into the funds ledger so payouts are
    // computed from actually-collected revenue (never the subscriber count).
    if (evt.type === 'activated') {
      await recordPayment(this.prisma, evt, 1);
    } else if (evt.type === 'refunded') {
      await recordPayment(this.prisma, evt, -1);
    }
  }

  /**
   * Idempotently record a collected payment (or refund reversal) in the funds
   * ledger. `sign` is +1 for a payment, -1 for a refund. Delegates to the pure
   * ledger module (unit/integration-tested against a real DB).
   */
  private recordPayment(evt: SubscriptionEvent, sign: 1 | -1) {
    return recordPayment(this.prisma, evt, sign);
  }

  /**
   * Dev-only self-confirmation for local/staging where no real processor posts
   * a webhook (mock / unconfigured provider). It confirms ONLY the calling
   * user's own subscription and is hard-disabled in production, so it can never
   * be used to grant a paid entitlement without real money.
   */
  async confirmDev(userId: string, tipsterId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev confirmation is disabled in production');
    }
    const provider = this.registry.default;
    if (provider.name !== 'mock') {
      // A real default provider must confirm via its verified webhook.
      throw new ForbiddenException(
        'Dev confirmation requires the mock payment provider',
      );
    }
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
      select: { subscriptionPriceCents: true },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    await this.upsertFromEvent({
      type: 'activated',
      userId,
      tipsterId,
      provider: provider.name,
      providerSubscriptionId: `mock_sub_${userId}_${tipsterId}`,
      amountCents: tipster.subscriptionPriceCents,
      reference: `mock:${userId}:${tipsterId}:${periodOf(new Date())}`,
    });
    return { activated: true };
  }

  /** Does this user currently have entitlement to this tipster's live picks? */
  async isEntitled(userId: string, tipsterId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId_tipsterId: { userId, tipsterId } },
    });
    if (!sub) return false;
    return isSubscriptionEntitled(sub.status, sub.currentPeriodEnd);
  }

  listForUser(userId: string) {
    return this.prisma.subscription.findMany({ where: { userId } });
  }

  /**
   * Subscriptions for the account page, with the tipster's public display name
   * resolved (displayName → username) so the UI never shows a raw id.
   */
  async listForUserView(userId: string) {
    const subs = await this.prisma.subscription.findMany({
      where: { userId },
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

    // Which of these the user also follows for free — so the UI can offer a
    // follow toggle alongside the paid relationship.
    const follows = await this.prisma.follow.findMany({
      where: { userId },
      select: { tipsterId: true },
    });
    const following = new Set(follows.map((f) => f.tipsterId));

    return subs.map((s) => ({
      id: s.id,
      tipsterId: s.tipsterId,
      tipsterName: s.tipster?.displayName ?? s.tipster?.user?.username ?? null,
      avatarUrl: s.tipster?.user?.avatarUrl ?? null,
      country: s.tipster?.country ?? null,
      subscriptionPriceCents: s.tipster?.subscriptionPriceCents ?? 0,
      billingInterval: s.tipster?.billingInterval ?? 'monthly',
      status: s.status,
      currentPeriodEnd: s.currentPeriodEnd,
      isFollowing: following.has(s.tipsterId),
      stats: s.tipster?.stats
        ? {
            yield: s.tipster.stats.yield,
            clvAvg: s.tipster.stats.clvAvg,
            winRate: s.tipster.stats.winRate,
            sampleSize: s.tipster.stats.sampleSize,
          }
        : null,
    }));
  }

  /**
   * Create a billing-portal link where the subscriber can cancel/resume their
   * subscriptions. `returnUrl` is where the provider sends them back afterwards.
   */
  createBillingPortal(userId: string, returnUrl: string) {
    return this.registry.default.createBillingPortalSession({
      userId,
      returnUrl,
    });
  }

  /** Active subscriber count per tipster — used by payouts. */
  countActiveSubscribers(tipsterId: string) {
    return this.prisma.subscription.count({
      where: { tipsterId, status: 'active' },
    });
  }

  /**
   * Gross revenue actually collected for a tipster in a period (USD cents),
   * summed from the funds ledger (payments minus refunds). Payouts are computed
   * from this — the platform can only pay out money it truly received.
   */
  async grossCollectedForPeriod(
    tipsterId: string,
    period: string,
  ): Promise<number> {
    return grossCollectedForPeriod(this.prisma, tipsterId, period);
  }
}
