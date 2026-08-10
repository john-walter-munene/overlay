import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NOTIFIER, type Notifier } from './notifier.interface';
import {
  dispatchNewPickWithPreferences,
  dispatchDailyDigests,
  generateUnsubscribeToken,
  groupDigestByRecipient,
  loadSubscriberRecipients,
  type DigestFrequency,
  type NotificationPreference as PreferenceValues,
  type PreferenceRecipient,
} from './preferences';
import {
  newPickDigestEmail,
  receiptEmail,
  type NewPickNotification,
} from './templates';

export type { NewPickNotification };

/** Shape returned to the user over the API (never exposes internal columns). */
export interface PreferenceView {
  emailEnabled: boolean;
  pushEnabled: boolean;
  frequency: DigestFrequency;
}

interface PreferenceRow {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  frequency: string;
  unsubscribeToken: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  /**
   * Send a one-off transactional email (e.g. newsletter confirmation) through
   * the active notifier. Thin passthrough so other modules don't depend on the
   * NOTIFIER token directly.
   */
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    await this.notifier.sendEmail({ to, subject, body });
  }

  /** Public origin of the API, used to build one-click unsubscribe links. */
  private baseUrl(): string {
    return (
      process.env.PUBLIC_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000'
    );
  }

  private toValues(row: PreferenceRow): PreferenceValues {
    return {
      emailEnabled: row.emailEnabled,
      pushEnabled: row.pushEnabled,
      frequency: row.frequency as DigestFrequency,
      unsubscribeToken: row.unsubscribeToken,
    };
  }

  private toView(row: PreferenceRow): PreferenceView {
    return {
      emailEnabled: row.emailEnabled,
      pushEnabled: row.pushEnabled,
      frequency: row.frequency as DigestFrequency,
    };
  }

  /**
   * Load a user's preferences, lazily creating defaults (both channels on,
   * instant cadence, fresh unsubscribe token) on first access.
   */
  async getOrCreatePreference(userId: string): Promise<PreferenceRow> {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    return this.prisma.notificationPreference.create({
      data: { userId, unsubscribeToken: generateUnsubscribeToken() },
    });
  }

  /** Read a user's notification preferences (API view). */
  async getPreferences(userId: string): Promise<PreferenceView> {
    return this.toView(await this.getOrCreatePreference(userId));
  }

  /** Update a user's notification preferences. */
  async updatePreferences(
    userId: string,
    patch: Partial<PreferenceView>,
  ): Promise<PreferenceView> {
    await this.getOrCreatePreference(userId);
    const updated = await this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        emailEnabled: patch.emailEnabled,
        pushEnabled: patch.pushEnabled,
        frequency: patch.frequency,
      },
    });
    return this.toView(updated);
  }

  /**
   * CAN-SPAM one-click unsubscribe: disables every channel for the token owner.
   * Idempotent; unknown tokens are rejected.
   */
  async unsubscribe(token: string): Promise<{ ok: true }> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { unsubscribeToken: token },
    });
    if (!pref) throw new NotFoundException('Unknown unsubscribe token');
    await this.prisma.notificationPreference.update({
      where: { unsubscribeToken: token },
      data: { emailEnabled: false, pushEnabled: false },
    });
    return { ok: true };
  }

  /**
   * Fan out a "new pick" notification to a tipster's active subscribers,
   * respecting per-user preferences: opted-out users get nothing, daily-cadence
   * users are batched into a digest instead, and each email carries a one-click
   * unsubscribe link. In production this is enqueued (dispatch-notifications)
   * rather than awaited inline; the interface stays the same.
   */
  async notifyNewPick(pick: NewPickNotification): Promise<void> {
    const recipients = await loadSubscriberRecipients(
      this.prisma,
      pick.tipsterId,
    );
    const template = newPickDigestEmail(pick);
    await dispatchNewPickWithPreferences(
      this.notifier,
      template,
      recipients,
      this.baseUrl(),
    );
  }

  /**
   * Send batched daily digests for every daily-cadence subscriber: collects all
   * picks locked since `since` from the tipsters they follow and emails one
   * digest per user. Returns the number of digest emails sent.
   */
  async sendDailyDigests(since: Date): Promise<number> {
    const picks = await this.prisma.pick.findMany({
      where: { lockedAt: { gte: since } },
      orderBy: { lockedAt: 'asc' },
    });
    if (picks.length === 0) return 0;

    const tipsterIds = [...new Set(picks.map((p) => p.tipsterId))];
    const picksByTipster = new Map<string, NewPickNotification[]>();
    for (const p of picks) {
      const list = picksByTipster.get(p.tipsterId) ?? [];
      list.push({
        tipsterId: p.tipsterId,
        market: p.market,
        selection: p.selection,
        oddsAtPick: p.oddsAtPick,
      });
      picksByTipster.set(p.tipsterId, list);
    }

    const subs = await this.prisma.subscription.findMany({
      where: {
        tipsterId: { in: tipsterIds },
        status: 'active',
        user: { notificationPreference: { is: { frequency: 'daily' } } },
      },
      include: { user: { include: { notificationPreference: true } } },
    });

    const events: Array<{
      recipient: PreferenceRecipient;
      pick: NewPickNotification;
    }> = [];
    for (const s of subs) {
      if (!s.user.notificationPreference) continue;
      const recipient: PreferenceRecipient = {
        userId: s.userId,
        email: s.user.email,
        preference: this.toValues(s.user.notificationPreference),
      };
      for (const pk of picksByTipster.get(s.tipsterId) ?? []) {
        events.push({ recipient, pick: pk });
      }
    }

    const digests = groupDigestByRecipient(events);
    return dispatchDailyDigests(this.notifier, digests, this.baseUrl());
  }

  /** Send a payment receipt after a successful subscription charge. */
  async sendReceiptEmail(
    to: string,
    receipt: {
      tipsterName: string;
      amountCents: number;
      currency?: string;
      periodEnd?: Date;
    },
  ): Promise<void> {
    await this.notifier.sendEmail({ to, ...receiptEmail(receipt) });
  }
}
