import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PAYMENT_REGISTRY } from '../../integrations/payments/payments.module';
import { subscriptionStatusFromEvent } from '@overlay/shared';
import { currencyForCountry, formatMinorUnits } from '@overlay/shared';
import { webhookEventsTotal } from '../../common/metrics';
import { CurrencyService } from '../../integrations/fx/currency.service';
import type { PaymentProviderRegistry } from '../../integrations/payments/payment-provider.registry';
import type {
  PaymentMethodId,
  SubscriptionEvent,
} from '../../integrations/payments/payment-provider.interface';

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

    // Some providers (e.g. Flutterwave) require the subscriber's email.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

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
      customerEmail: user?.email,
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

  private upsertFromEvent(evt: SubscriptionEvent) {
    const status = subscriptionStatusFromEvent(evt.type);
    return this.prisma.subscription.upsert({
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
}
