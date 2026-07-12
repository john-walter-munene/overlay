import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MockNotifier } from './mock.notifier';
import { PrismaService } from '../../prisma.service';

@Module({
  providers: [NotificationsService, MockNotifier, PrismaService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
