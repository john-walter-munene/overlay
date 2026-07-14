// Notification preferences & digests (OB-033). Pure, provider-agnostic helpers
// for respecting per-user channel/cadence preferences, batching daily digests
// and building CAN-SPAM one-click unsubscribe links. Decorator-free so it can be
// unit-tested under the `--experimental-strip-types` runner with a mocked
// Notifier (see notifications.service.ts for the Nest wiring).

import { randomBytes } from 'node:crypto';
import type { EmailTemplate, NewPickNotification } from './templates';
import type { Notifier } from './notifier.interface';

const APP_NAME = 'Overlay Bets';

/** Delivery cadence: fan out per pick, or batch into a daily digest email. */
export type DigestFrequency = 'instant' | 'daily';

/** A user's resolved notification preferences. */
export interface NotificationPreference {
  emailEnabled: boolean;
  pushEnabled: boolean;
  frequency: DigestFrequency;
  /** Opaque per-user token backing one-click unsubscribe links. */
  unsubscribeToken: string;
}

/** A subscriber to notify, paired with their preferences. */
export interface PreferenceRecipient {
  userId: string;
  email: string;
  preference: NotificationPreference;
}

/** Sensible defaults for a brand-new user: both channels on, instant cadence. */
export function defaultPreference(unsubscribeToken: string): NotificationPreference {
  return {
    emailEnabled: true,
    pushEnabled: true,
    frequency: 'instant',
    unsubscribeToken,
  };
}

/** Generate a fresh, URL-safe unsubscribe token. */
export function generateUnsubscribeToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * A user is fully unsubscribed (receives nothing) when neither channel is
 * enabled. One-click unsubscribe sets both to false.
 */
export function isOptedOut(pref: NotificationPreference): boolean {
  return !pref.emailEnabled && !pref.pushEnabled;
}

/** Build the CAN-SPAM one-click unsubscribe URL for a token. */
export function unsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/notifications/unsubscribe?token=${encodeURIComponent(
    token,
  )}`;
}

/** Append the required CAN-SPAM unsubscribe footer to an email body. */
export function withUnsubscribeFooter(body: string, url: string): string {
  return (
    `${body}\n\n` +
    `\u2014\n` +
    `You're receiving this because you subscribed to a tipster on ${APP_NAME}.\n` +
    `Unsubscribe (one click): ${url}`
  );
}

/**
 * Fan out a single new-pick notification, honouring each recipient's
 * preferences: opted-out users get nothing, daily-cadence users are skipped
 * (they receive the batched digest instead), and each enabled channel is used.
 * Emails carry a per-user unsubscribe footer. The `template` is pre-rendered by
 * the caller (see templates.ts) so this stays presentation-agnostic.
 */
export async function dispatchNewPickWithPreferences(
  notifier: Notifier,
  template: EmailTemplate,
  recipients: PreferenceRecipient[],
  baseUrl: string,
): Promise<void> {
  const jobs: Array<Promise<void>> = [];

  for (const r of recipients) {
    const pref = r.preference;
    // Daily-cadence recipients are batched by dispatchDailyDigests(), not here.
    if (isOptedOut(pref) || pref.frequency !== 'instant') continue;

    if (pref.emailEnabled) {
      jobs.push(
        notifier.sendEmail({
          to: r.email,
          subject: template.subject,
          body: withUnsubscribeFooter(
            template.body,
            unsubscribeUrl(baseUrl, pref.unsubscribeToken),
          ),
        }),
      );
    }
    if (pref.pushEnabled) {
      jobs.push(
        notifier.sendPush({
          userId: r.userId,
          title: template.subject,
          body: template.body,
        }),
      );
    }
  }

  await Promise.all(jobs);
}

/** One recipient's pending picks, ready to be sent as a single digest. */
export interface RecipientDigest {
  recipient: PreferenceRecipient;
  picks: NewPickNotification[];
}

/**
 * Group a flat list of (recipient, pick) events into one digest per recipient,
 * preserving pick order. This is the batching core: many picks collapse into a
 * single email per user.
 */
export function groupDigestByRecipient(
  events: Array<{ recipient: PreferenceRecipient; pick: NewPickNotification }>,
): RecipientDigest[] {
  const byUser = new Map<string, RecipientDigest>();
  for (const { recipient, pick } of events) {
    const existing = byUser.get(recipient.userId);
    if (existing) {
      existing.picks.push(pick);
    } else {
      byUser.set(recipient.userId, { recipient, picks: [pick] });
    }
  }
  return [...byUser.values()];
}

/** Render a batched digest email summarising several new picks. */
export function buildPickDigestEmail(picks: NewPickNotification[]): EmailTemplate {
  const count = picks.length;
  const lines = picks.map(
    (p) => `\u2022 ${p.market}: ${p.selection} @ ${p.oddsAtPick}`,
  );
  return {
    subject: `Your ${APP_NAME} daily digest \u2014 ${count} new pick${
      count === 1 ? '' : 's'
    }`,
    body: `Here ${count === 1 ? 'is' : 'are'} the ${count} new pick${
      count === 1 ? '' : 's'
    } from tipsters you follow:\n\n${lines.join('\n')}`,
  };
}

/**
 * Send batched daily digests. Only email-enabled recipients receive a digest
 * (digests are an email-only surface); opted-out users and empty batches are
 * skipped. Each email carries the unsubscribe footer. Returns the number of
 * digest emails sent.
 */
export async function dispatchDailyDigests(
  notifier: Notifier,
  digests: RecipientDigest[],
  baseUrl: string,
): Promise<number> {
  const jobs: Array<Promise<void>> = [];

  for (const { recipient, picks } of digests) {
    const pref = recipient.preference;
    if (picks.length === 0 || isOptedOut(pref) || !pref.emailEnabled) continue;

    const template = buildPickDigestEmail(picks);
    jobs.push(
      notifier.sendEmail({
        to: recipient.email,
        subject: template.subject,
        body: withUnsubscribeFooter(
          template.body,
          unsubscribeUrl(baseUrl, pref.unsubscribeToken),
        ),
      }),
    );
  }

  await Promise.all(jobs);
  return jobs.length;
}
