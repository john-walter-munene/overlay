import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '../../prisma.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymentsModule } from '../../integrations/payments/payments.module';

@Module({
  imports: [SubscriptionsModule, PaymentsModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, PrismaService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
