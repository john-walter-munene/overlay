import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  normalizeSubscriberEmail,
  newsletterConfirmationBody,
} from './newsletter';

@Injectable()
export class NewsletterService {
  private readonly log = new Logger(NewsletterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Subscribe an email to the marketing newsletter. Idempotent: re-subscribing
   * an existing address is a no-op success, and re-activates a previously
   * unsubscribed address. A confirmation email is sent on first (re)subscribe,
   * but delivery failures never fail the request — the opt-in is already saved.
   */
  async subscribe(rawEmail: string): Promise<{ ok: true }> {
    const email = normalizeSubscriberEmail(rawEmail);
    if (!email) {
      throw new BadRequestException('A valid email is required.');
    }

    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email },
    });
    const shouldConfirm = !existing || existing.status !== 'subscribed';

    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      update: { status: 'subscribed' },
      create: { email, status: 'subscribed' },
    });

    if (shouldConfirm) {
      try {
        await this.notifications.sendEmail(
          email,
          'Welcome to the Overlay Bets newsletter',
          newsletterConfirmationBody(),
        );
      } catch (err) {
        this.log.warn(
          `Newsletter confirmation email failed for ${email}: ${String(err)}`,
        );
      }
    }

    return { ok: true };
  }

  /** Admin: list newsletter subscribers, newest first. */
  async listForAdmin(status?: string) {
    const where =
      status === 'subscribed' || status === 'unsubscribed' ? { status } : {};
    const rows = await this.prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }
}

