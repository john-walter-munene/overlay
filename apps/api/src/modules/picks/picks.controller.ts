import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PicksService } from './picks.service';
import { CreatePickDto } from './dto/create-pick.dto';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import { writeThrottle } from '../../common/throttling';

type PickStatusFilter = 'open' | 'settled' | 'all';

function normalizeStatusFilter(raw?: string): PickStatusFilter {
  return raw === 'open' || raw === 'settled' ? raw : 'all';
}

@Controller('picks')
export class PicksController {
  constructor(private readonly picks: PicksService) {}

  @Post()
  @Throttle(writeThrottle())
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  create(@Body() dto: CreatePickDto, @CurrentUser() user: AuthUser) {
    if (!user.tipsterId) {
      throw new ForbiddenException('Not a tipster account');
    }
    return this.picks.createLockedPick(user.tipsterId, dto);
  }

  /** A tipster's own tips ("My tips"), filterable by open / settled / all. */
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  myPicks(@Query('status') status: string, @CurrentUser() user: AuthUser) {
    if (!user.tipsterId) {
      throw new ForbiddenException('Not a tipster account');
    }
    return this.picks.listMine(user.tipsterId, normalizeStatusFilter(status));
  }

  @Get('me/performance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  myPerformance(@CurrentUser() user: AuthUser) {
    if (!user.tipsterId) {
      throw new ForbiddenException('Not a tipster account');
    }
    return this.picks.performanceForTipster(user.tipsterId);
  }

  @Get('me/feed')
  @UseGuards(JwtAuthGuard)
  myFeed(@CurrentUser() user: AuthUser) {
    return this.picks.feedForSubscriber(user.userId);
  }

  @Get('tipster/:tipsterId')
  listByTipster(@Param('tipsterId') tipsterId: string) {
    return this.picks.listByTipster(tipsterId);
  }

  @Get('tipster/:tipsterId/live')
  @UseGuards(JwtAuthGuard)
  listLive(
    @Param('tipsterId') tipsterId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.picks.listLiveForSubscriber(user.userId, tipsterId);
  }
}
