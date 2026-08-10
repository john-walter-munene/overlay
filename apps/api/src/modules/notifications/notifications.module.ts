import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MockNotifier } from './mock.notifier';
import { ResendNotifier } from './resend.notifier';
import { PushService } from './push.service';
import { NOTIFIER, type Notifier } from './notifier.interface';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    MockNotifier,
    ResendNotifier,
    PushService,
    PrismaService,
    {
      // The active notifier sends email through the configured provider (mock in
      // dev/test, Resend in prod) and delivers web push through PushService,
      // regardless of the email provider (OB-031).
      provide: NOTIFIER,
      inject: [MockNotifier, ResendNotifier, PushService],
      useFactory: (
        mock: MockNotifier,
        resend: ResendNotifier,
        push: PushService,
      ): Notifier => {
        const email =
          process.env.NOTIFIER_PROVIDER === 'resend' ? resend : mock;
        return {
          name: `${email.name}+webpush`,
          sendEmail: (msg) => email.sendEmail(msg),
          sendPush: (msg) => push.sendPush(msg),
        };
      },
    },
  ],
  exports: [NotificationsService, PushService, NOTIFIER],
})
export class NotificationsModule {}
