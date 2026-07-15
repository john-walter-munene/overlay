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
import { RolesGuard, Roles } from '../../common/roles.guard';

/**
 * Free "Daily Tips" hub (OB-150). The listing endpoints are public and ungated
 * — free "bets of the day" are visible without an account and are kept separate
 * from paid live picks. Management is admin-only.
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  all() {
    return this.freeTips.listAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateFreeTipDto) {
    return this.freeTips.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateFreeTipDto) {
    return this.freeTips.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.freeTips.remove(id);
  }
}
