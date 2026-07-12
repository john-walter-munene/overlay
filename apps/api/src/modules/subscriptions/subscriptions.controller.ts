import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';

class CheckoutDto {
  @IsString() tipsterId!: string;
}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@Body() dto: CheckoutDto, @CurrentUser() user: AuthUser) {
    return this.subs.createCheckout(user.userId, dto.tipsterId);
  }

  // Public endpoint; authenticity is verified via the provider signature.
  @Post('webhook')
  webhook(
    @Req() req: { rawBody?: string; body?: unknown },
    @Headers('stripe-signature') signature = '',
  ) {
    const raw = req.rawBody ?? JSON.stringify(req.body ?? {});
    return this.subs.applyWebhook(raw, signature);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthUser) {
    return this.subs.listForUser(user.userId);
  }
}
