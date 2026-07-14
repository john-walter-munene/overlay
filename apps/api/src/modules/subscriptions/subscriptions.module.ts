import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../../prisma.service';
import { PaymentsModule } from '../../integrations/payments/payments.module';
import { FxModule } from '../../integrations/fx/fx.module';

@Module({
  imports: [PaymentsModule, FxModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, PrismaService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
