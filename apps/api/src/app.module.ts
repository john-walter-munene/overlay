import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';
import { globalThrottleRule } from './common/throttling';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
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
    // Global rate limiting: 120 requests / minute / IP by default (OB-080).
    // Sensitive routes (auth, pick submission, checkout, payout runs) tighten
    // this further via @Throttle overrides. All limits are env-configurable.
    ThrottlerModule.forRoot([globalThrottleRule()]),
    AuthModule,
    HealthModule,
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
