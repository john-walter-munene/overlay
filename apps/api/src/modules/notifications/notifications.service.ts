import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MockNotifier } from './mock.notifier';

export interface NewPickNotification {
  tipsterId: string;
  market: string;
  selection: string;
  oddsAtPick: number;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: MockNotifier,
  ) {}

  /**
   * Fan out a "new pick" notification to a tipster's active subscribers.
   * In production this is enqueued (dispatch-notifications) rather than awaited
   * inline; the interface stays the same.
   */
  async notifyNewPick(pick: NewPickNotification): Promise<void> {
    const subs = await this.prisma.subscription.findMany({
      where: { tipsterId: pick.tipsterId, status: 'active' },
      include: { user: true },
    });

    const title = 'New pick posted';
    const body = `${pick.market}: ${pick.selection} @ ${pick.oddsAtPick}`;

    await Promise.all(
      subs.flatMap((sub) => [
        this.notifier.sendEmail({ to: sub.user.email, subject: title, body }),
        this.notifier.sendPush({ userId: sub.userId, title, body }),
      ]),
    );
  }
}
