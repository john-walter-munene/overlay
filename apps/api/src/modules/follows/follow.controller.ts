import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FollowService } from './follow.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import { writeThrottle } from '../../common/throttling';

/**
 * Follow / unfollow tipsters and read the caller's own follows. Every route is
 * self-scoped to the authenticated user; there is no way to act on behalf of
 * another account.
 */
@Controller('follows')
@UseGuards(JwtAuthGuard)
export class FollowController {
  constructor(private readonly follows: FollowService) {}

  /** Tipster ids the caller follows — powers follow buttons across the app. */
  @Get('me/ids')
  myIds(@CurrentUser() user: AuthUser) {
    return this.follows.listMyIds(user.userId);
  }

  /** The caller's followed tipsters with public stats, for the Following list. */
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.follows.listMine(user.userId);
  }

  @Post(':tipsterId')
  @Throttle(writeThrottle())
  follow(@Param('tipsterId') tipsterId: string, @CurrentUser() user: AuthUser) {
    return this.follows.follow(user.userId, tipsterId);
  }

  @Delete(':tipsterId')
  @Throttle(writeThrottle())
  unfollow(
    @Param('tipsterId') tipsterId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.follows.unfollow(user.userId, tipsterId);
  }
}
