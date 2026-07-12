import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('leaderboard')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  leaderboard(
    @Query('minSample') minSample?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stats.leaderboard(
      minSample ? Number(minSample) : 50,
      limit ? Number(limit) : 100,
    );
  }
}
