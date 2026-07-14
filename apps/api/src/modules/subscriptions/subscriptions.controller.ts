import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { IsString } from 'class-validator';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import { writeThrottle } from '../../common/throttling';

class CheckoutDto {
  @IsString() tipsterId!: string;
}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Post('checkout')
  @Throttle(writeThrottle())
  @UseGuards(JwtAuthGuard)
  checkout(@Body() dto: CheckoutDto, @CurrentUser() user: AuthUser) {
    return this.subs.createCheckout(user.userId, dto.tipsterId);
  }

  // Public endpoint; authenticity is verified via the provider signature over
  // the raw request bytes (populated by `rawBody: true` in main.ts).
  @Post('webhook')
  @SkipThrottle()
  webhook(
    @Req() req: { rawBody?: Buffer; body?: unknown },
    @Headers('stripe-signature') signature = '',
  ) {
    const raw = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body ?? {});
    return this.subs.applyWebhook(raw, signature);
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
