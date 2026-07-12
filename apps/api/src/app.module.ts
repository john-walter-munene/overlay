import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PicksModule } from './modules/picks/picks.module';
import { StatsModule } from './modules/stats/stats.module';

/**
 * Modular monolith root. Each feature is a Nest module with a clear boundary
 * (see docs/ARCHITECTURE.md §3.2). Auth, tipsters, subscriptions, payouts,
 * notifications and admin are stubbed in and land across Phases 0–3.
 */
@Module({
  imports: [PicksModule, StatsModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
