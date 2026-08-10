import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../../prisma.service';

/**
 * Tip-drop schedule announcements (OB-034). Depends on NotificationsModule to
 * reuse the preference-aware, unsubscribe-honouring subscriber fan-out.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, PrismaService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
