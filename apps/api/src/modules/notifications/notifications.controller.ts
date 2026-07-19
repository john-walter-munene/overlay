import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import type { DigestFrequency } from './preferences';

class UpdatePreferencesDto {
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsIn(['instant', 'daily']) frequency?: DigestFrequency;
}

class PushSubscriptionKeysDto {
  @IsString() @IsNotEmpty() p256dh!: string;
  @IsString() @IsNotEmpty() auth!: string;
}

class PushSubscribeDto {
  @IsString() @IsNotEmpty() endpoint!: string;
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

class PushUnsubscribeDto {
  @IsString() @IsNotEmpty() endpoint!: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  /** Read the current user's notification preferences. */
  @Get('preferences')
  @UseGuards(JwtAuthGuard)
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user.userId);
  }

  /** Update the current user's notification preferences. */
  @Put('preferences')
  @UseGuards(JwtAuthGuard)
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.notifications.updatePreferences(user.userId, dto);
  }

  /**
   * Public VAPID key the browser needs to create a push subscription (OB-031).
   * Returns `{ publicKey: null }` when web push isn't configured so clients can
   * hide the opt-in cleanly.
   */
  @Get('push/public-key')
  getPushPublicKey() {
    return { publicKey: this.push.publicKey() };
  }

  /** Register (or refresh) the caller's browser push subscription. */
  @Post('push/subscribe')
  @UseGuards(JwtAuthGuard)
  subscribePush(@CurrentUser() user: AuthUser, @Body() dto: PushSubscribeDto) {
    return this.push.saveSubscription(user.userId, dto);
  }

  /** Remove the caller's browser push subscription (opt-out from a device). */
  @Delete('push/subscribe')
  @UseGuards(JwtAuthGuard)
  unsubscribePush(
    @CurrentUser() user: AuthUser,
    @Body() dto: PushUnsubscribeDto,
  ) {
    return this.push.removeSubscription(user.userId, dto.endpoint);
  }

  // CAN-SPAM one-click unsubscribe. Public (the token authenticates the
  // request); exposed over both GET (email clients open the link) and POST
  // (RFC 8058 List-Unsubscribe-Post).
  @Get('unsubscribe')
  unsubscribeGet(@Query('token') token = '') {
    return this.notifications.unsubscribe(token);
  }

  @Post('unsubscribe')
  unsubscribePost(
    @Query('token') queryToken = '',
    @Body() body: { token?: string } = {},
  ) {
    return this.notifications.unsubscribe(body.token ?? queryToken);
  }
}
