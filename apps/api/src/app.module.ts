import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { PicksModule } from './modules/picks/picks.module';
import { StatsModule } from './modules/stats/stats.module';
import { TipstersModule } from './modules/tipsters/tipsters.module';
import { EventsModule } from './modules/events/events.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettlementModule } from './workers/settlement.module';

/**
 * Modular monolith root. Each feature is a Nest module with a clear boundary
 * (see docs/ARCHITECTURE.md §3.2).
 */
@Module({
  imports: [
    AuthModule,
    TipstersModule,
    EventsModule,
    PicksModule,
    StatsModule,
    SubscriptionsModule,
    PayoutsModule,
    NotificationsModule,
    SettlementModule,
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
