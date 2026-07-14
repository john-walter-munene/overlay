import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MockNotifier } from './mock.notifier';
import { ResendNotifier } from './resend.notifier';
import { NOTIFIER, type Notifier } from './notifier.interface';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    MockNotifier,
    ResendNotifier,
    PrismaService,
    {
      provide: NOTIFIER,
      inject: [MockNotifier, ResendNotifier],
      useFactory: (mock: MockNotifier, resend: ResendNotifier): Notifier =>
        process.env.NOTIFIER_PROVIDER === 'resend' ? resend : mock,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
