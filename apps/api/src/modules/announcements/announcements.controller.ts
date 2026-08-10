import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';
import { writeThrottle } from '../../common/throttling';

/**
 * Tip-drop schedule announcements (OB-034). Tipsters create/edit/cancel their
 * own announcements; subscribers read the upcoming drops of tipsters they
 * follow or subscribe to. Announcements convey only *when* tips drop, never
 * gated pick content.
 */
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  // ---- tipster management ----

  @Post()
  @Throttle(writeThrottle())
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: AuthUser) {
    return this.announcements.create(this.tipsterId(user), dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  mine(@CurrentUser() user: AuthUser) {
    return this.announcements.listMine(this.tipsterId(user));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcements.update(this.tipsterId(user), id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.announcements.cancel(this.tipsterId(user), id);
  }

  // ---- subscriber view ----

  /** Upcoming scheduled drops for tipsters the caller follows/subscribes to. */
  @Get('upcoming')
  @UseGuards(JwtAuthGuard)
  upcoming(@CurrentUser() user: AuthUser) {
    return this.announcements.listUpcomingForUser(user.userId);
  }

  private tipsterId(user: AuthUser): string {
    if (!user.tipsterId) {
      throw new ForbiddenException('Not a tipster account');
    }
    return user.tipsterId;
  }
}
