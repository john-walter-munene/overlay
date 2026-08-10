import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { PrismaService } from '../../prisma.service';
import { LeaderboardCache } from './leaderboard-cache';
import { LEADERBOARD_CACHE, RedisCacheStore } from './leaderboard-cache.redis';

@Module({
  controllers: [StatsController],
  providers: [
    StatsService,
    PrismaService,
    // OB-055: process-wide leaderboard cache backed by Redis. Best-effort — an
    // unreachable Redis degrades to a direct DB read (see LeaderboardCache).
    RedisCacheStore,
    {
      provide: LEADERBOARD_CACHE,
      useFactory: (store: RedisCacheStore) => new LeaderboardCache(store),
      inject: [RedisCacheStore],
    },
  ],
  exports: [StatsService],
})
export class StatsModule {}
