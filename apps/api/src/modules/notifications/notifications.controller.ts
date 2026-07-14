import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import type { DigestFrequency } from './preferences';

class UpdatePreferencesDto {
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsIn(['instant', 'daily']) frequency?: DigestFrequency;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

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
