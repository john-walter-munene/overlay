import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { PicksModule } from './modules/picks/picks.module';
import { StatsModule } from './modules/stats/stats.module';
import { TipstersModule } from './modules/tipsters/tipsters.module';
import { EventsModule } from './modules/events/events.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { AdminModule } from './modules/admin/admin.module';
import { SettlementModule } from './workers/settlement.module';

/**
 * Modular monolith root. Each feature is a Nest module with a clear boundary
 * (see docs/ARCHITECTURE.md §3.2).
 */
@Module({
  imports: [
    // Global rate limiting: 120 requests / minute / IP by default.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 120),
      },
    ]),
    AuthModule,
    HealthModule,
    MetricsModule,
    TipstersModule,
    EventsModule,
    PicksModule,
    StatsModule,
    SubscriptionsModule,
    PayoutsModule,
    NotificationsModule,
    ArticlesModule,
    AdminModule,
    SettlementModule,
  ],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [PrismaService],
})
export class AppModule {}
