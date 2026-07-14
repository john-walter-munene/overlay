import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import type { PaymentMethodId } from '../../integrations/payments/payment-provider.interface';
import { writeThrottle } from '../../common/throttling';

const PAYMENT_METHODS: PaymentMethodId[] = [
  'card',
  'apple_pay',
  'google_pay',
  'usdc',
  'usdt',
  'mpesa',
  'mtn_momo',
  'airtel_money',
];

class CheckoutDto {
  @IsString() tipsterId!: string;
  /** Optional payment method; routes to the provider that settles it. */
  @IsOptional() @IsIn(PAYMENT_METHODS) method?: PaymentMethodId;
  /** Optional ISO country of the subscriber, for local-currency conversion. */
  @IsOptional() @IsString() @MaxLength(2) country?: string;
  /** Optional explicit charge currency (ISO 4217) — overrides country. */
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  /** Payment methods the checkout picker can offer. */
  @Get('methods')
  methods() {
    return this.subs.listPaymentMethods();
  }

  /** Local-currency price estimate for a tipster + subscriber country/currency. */
  @Get('quote')
  quote(
    @Query('tipsterId') tipsterId: string,
    @Query('country') country?: string,
    @Query('currency') currency?: string,
  ) {
    return this.subs.quote(tipsterId, { country, currency });
  }

  @Post('checkout')
  @Throttle(writeThrottle())
  @UseGuards(JwtAuthGuard)
  checkout(@Body() dto: CheckoutDto, @CurrentUser() user: AuthUser) {
    return this.subs.createCheckout(
      user.userId,
      dto.tipsterId,
      dto.method,
      dto.country,
      dto.currency,
    );
  }

  // Public endpoint; authenticity is verified via the provider signature over
  // the raw request bytes (populated by `rawBody: true` in main.ts). The
  // legacy path routes to the default provider; `/webhook/:provider` targets a
  // specific one so multiple providers can post concurrently.
  @Post('webhook')
  @SkipThrottle()
  webhook(
    @Req() req: { rawBody?: Buffer; body?: unknown },
    @Headers() headers: Record<string, string>,
  ) {
    const raw = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body ?? {});
    return this.subs.applyWebhook(undefined, raw, headers);
  }

  @Post('webhook/:provider')
  @SkipThrottle()
  webhookForProvider(
    @Param('provider') provider: string,
    @Req() req: { rawBody?: Buffer; body?: unknown },
    @Headers() headers: Record<string, string>,
  ) {
    const raw = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body ?? {});
    return this.subs.applyWebhook(provider, raw, headers);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthUser) {
    return this.subs.listForUser(user.userId);
  }

  // Returns a billing-portal URL where the subscriber cancels/resumes their
  // subscriptions (Stripe billing portal); the web UI then redirects to it.
  @Post('portal')
  @UseGuards(JwtAuthGuard)
  portal(@CurrentUser() user: AuthUser) {
    const returnUrl = `${process.env.WEB_APP_URL ?? 'http://localhost:3000'}/account/subscriptions`;
    return this.subs.createBillingPortal(user.userId, returnUrl);
  }
}
