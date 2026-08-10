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

  /**
   * Bettor-facing event discovery (Phase 3). Public + DB-only (quota-free).
   * Filters: sport, group (provider sport group), league, status
   * (upcoming|live|completed|all), commence-time window, team/league search,
   * with server-clamped pagination.
   */
  @Get()
  discover(
    @Query('sport') sport?: string,
    @Query('group') group?: string,
    @Query('league') league?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('startFrom') startFrom?: string,
    @Query('startTo') startTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.events.listEvents({
      sport,
      group,
      league,
      status,
      q,
      startFrom,
      startTo,
      limit,
      offset,
    });
  }

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

  @Get('sports')
  sports() {
    return this.events.providerSports();
  }

  /** Fixtures ranked by how many tipsters have picks on them (OB-161). */
  @Get('fixtures')
  fixtures(
    @Query('sport') sport?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : undefined;
    return this.events.listFixturesWithPicks({
      sport,
      status,
      limit: Number.isFinite(parsed) ? parsed : undefined,
    });
  }

  /** Verified tipsters with picks on one fixture (OB-161). */
  @Get('fixtures/:id')
  fixture(@Param('id') id: string) {
    return this.events.getFixturePicksSummary(id);
  }

  /**
   * Bettor-facing event detail (Phase 3). Public, on-demand: normalized event
   * summary + featured markets (best price + per-bookmaker offers), served from
   * the shared odds cache to bound vendor credit spend.
   */
  @Get(':id/detail')
  detail(
    @Param('id') id: string,
    @Query('bookmaker') bookmaker?: string,
    @Query('market') market?: string,
  ) {
    return this.events.getEventDetail(id, { bookmaker, market });
  }

  /**
   * On-demand market inventory for one event (Phase 3): every market on offer,
   * classified (featured/props/period/alternate) with `pickable` flags. Public;
   * cached to bound vendor credit spend.
   */
  @Get(':id/markets')
  markets(@Param('id') id: string) {
    return this.events.getEventMarketInventory(id);
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

  /** Ingest fixtures for every in-season sport (quota-free). Admin/staff. */
  @Post('ingest-all')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('data:ingest')
  ingestAll() {
    return this.events.ingestAll();
  }
}
