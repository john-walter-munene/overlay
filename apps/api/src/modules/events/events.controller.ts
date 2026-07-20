import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import {
  RolesGuard,
  Roles,
  PermissionsGuard,
  Permissions,
} from '../../common/roles.guard';

class IngestDto {
  @IsString() sport!: string;
}

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('upcoming')
  upcoming(
    @Query('sport') sport?: string,
    @Query('league') league?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : undefined;
    return this.events.listUpcoming({
      sport,
      league,
      q,
      limit: Number.isFinite(parsed) ? parsed : undefined,
    });
  }

  /** Distinct sports + leagues for the pick filters. */
  @Get('filters')
  filters() {
    return this.events.filters();
  }

  /** Live markets/odds for one event (tipsters only — limits credit spend). */
  @Get(':id/odds')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tipster')
  odds(@Param('id') id: string) {
    return this.events.getEventOdds(id);
  }

  @Post('ingest')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('data:ingest')
  async ingest(@Body() dto: IngestDto) {
    const count = await this.events.ingest(dto.sport);
    return { ingested: count };
  }
}
