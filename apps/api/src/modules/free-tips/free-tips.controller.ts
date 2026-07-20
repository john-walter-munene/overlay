import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FreeTipsService } from './free-tips.service';
import { CreateFreeTipDto } from './dto/create-free-tip.dto';
import { UpdateFreeTipDto } from './dto/update-free-tip.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard, Permissions } from '../../common/roles.guard';

/**
 * Free "Daily Tips" hub (OB-150). The listing endpoints are public and ungated
 * — free "bets of the day" are visible without an account and are kept separate
 * from paid live picks. Management is a content-moderation surface (admin/staff).
 */
@Controller('free-tips')
export class FreeTipsController {
  constructor(private readonly freeTips: FreeTipsService) {}

  // ---- public (SEO, ungated) ----

  @Get()
  list(@Query('date') date?: string) {
    return this.freeTips.listByDate(date);
  }

  @Get('dates')
  dates() {
    return this.freeTips.listDates();
  }

  // ---- admin management ----

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('content:moderate')
  all() {
    return this.freeTips.listAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('content:moderate')
  create(@Body() dto: CreateFreeTipDto) {
    return this.freeTips.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('content:moderate')
  update(@Param('id') id: string, @Body() dto: UpdateFreeTipDto) {
    return this.freeTips.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('content:moderate')
  remove(@Param('id') id: string) {
    return this.freeTips.remove(id);
  }
}
