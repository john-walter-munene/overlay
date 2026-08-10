import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  confirmFlow,
  sendWeeklyDigestFlow,
  subscribeFlow,
  unsubscribeFlow,
  type FlowResult,
  type NewsletterMailer,
} from './newsletter';

@Injectable()
export class NewsletterService {
  private readonly log = new Logger(NewsletterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Adapt NotificationsService to the flow's minimal mailer interface. */
  private get mailer(): NewsletterMailer {
    return {
      sendEmail: (to, subject, body) =>
        this.notifications.sendEmail(to, subject, body),
    };
  }

  /** Public web origin used to build confirm / unsubscribe links in emails. */
  private baseUrl(): string {
    return (
      process.env.PUBLIC_WEB_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      'http://localhost:3000'
    );
  }

  /** Map a flow result onto the matching HTTP exception (or return ok). */
  private mapResult(result: FlowResult, unknownMessage: string): { ok: true } {
    if (result === 'invalid') {
      throw new BadRequestException('A valid token or email is required.');
    }
    if (result === 'unknown') {
      throw new NotFoundException(unknownMessage);
    }
    return { ok: true };
  }

  /** Start a double opt-in subscription (sends a confirmation link). */
  async subscribe(rawEmail: string): Promise<{ ok: true }> {
    const result = await subscribeFlow(
      this.prisma,
      this.mailer,
      this.baseUrl(),
      rawEmail,
      this.log,
    );
    if (result === 'invalid') {
      throw new BadRequestException('A valid email is required.');
    }
    return { ok: true };
  }

  /** Complete double opt-in for a confirmation token. */
  async confirm(token: string): Promise<{ ok: true }> {
    const result = await confirmFlow(this.prisma, this.mailer, token, this.log);
    return this.mapResult(result, 'Unknown or expired confirmation token');
  }

  /** One-click unsubscribe for an unsubscribe token. */
  async unsubscribe(token: string): Promise<{ ok: true }> {
    const result = await unsubscribeFlow(this.prisma, token);
    return this.mapResult(result, 'Unknown unsubscribe token');
  }

  /** Compose + send the weekly "Picks of the Week" digest. */
  async sendWeeklyDigest(
    sinceMs?: number,
  ): Promise<{ sent: number; picks: number }> {
    return sendWeeklyDigestFlow(
      this.prisma,
      this.mailer,
      this.baseUrl(),
      sinceMs,
      this.log,
    );
  }

  /** Admin: list newsletter subscribers, newest first. */
  async listForAdmin(status?: string) {
    const where =
      status === 'subscribed' ||
      status === 'unsubscribed' ||
      status === 'pending'
        ? { status }
        : {};
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
