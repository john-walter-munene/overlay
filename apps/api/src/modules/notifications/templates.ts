// Transactional email templates and notification fan-out helpers. These are
// pure and provider-agnostic (only type imports at runtime), so any Notifier
// can send them and they can be unit-tested with a mocked provider.

import type { EmailMessage, Notifier } from './notifier.interface';

/** An email template minus the recipient (filled in at send time). */
export type EmailTemplate = Omit<EmailMessage, 'to'>;

const APP_NAME = 'Overlay Bets';

/** Payment receipt sent after a successful subscription charge. */
export function receiptEmail(params: {
  tipsterName: string;
  amountCents: number;
  currency?: string;
  periodEnd?: Date;
}): EmailTemplate {
  const amount = formatAmount(params.amountCents, params.currency);
  const period = params.periodEnd
    ? ` Your subscription is active until ${params.periodEnd
        .toISOString()
        .slice(0, 10)}.`
    : '';
  return {
    subject: `Your ${APP_NAME} receipt`,
    body:
      `Thanks for subscribing to ${params.tipsterName}. ` +
      `You were charged ${amount}.${period}`,
  };
}

/** Digest of a newly posted pick, sent to a tipster's subscribers. */
export function newPickDigestEmail(params: {
  market: string;
  selection: string;
  oddsAtPick: number;
}): EmailTemplate {
  return {
    subject: 'New pick posted',
    body: `${params.market}: ${params.selection} @ ${params.oddsAtPick}`,
  };
}

/**
 * A tipster-authored tip-drop schedule announcement (OB-034). Carries only the
 * *timing* of a drop (or a pre-drop reminder) — never any gated pick content.
 */
export interface AnnouncementNotification {
  tipsterId: string;
  /** Public tipster name for the email/push copy (falls back to "A tipster"). */
  tipsterName?: string | null;
  title: string;
  message?: string | null;
  /** The resolved drop instant, when known. */
  dropAt?: Date | null;
  /** IANA timezone the drop time is expressed in. */
  timezone?: string | null;
  /** `published` = schedule just announced; `reminder` = pre-drop nudge. */
  kind: 'published' | 'reminder';
}

/** Human "Fri, 10 Jul 2026, 18:00 (Africa/Nairobi)" for an announcement drop. */
function formatDropTime(dropAt: Date, timeZone?: string | null): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  if (timeZone) opts.timeZone = timeZone;
  const when = new Intl.DateTimeFormat('en-GB', opts).format(dropAt);
  return timeZone ? `${when} (${timeZone})` : when;
}

/**
 * Render a schedule-announcement email. Purely about *when* tips drop, so it can
 * safely go to subscribers ahead of the actual (gated) picks.
 */
export function announcementEmail(a: AnnouncementNotification): EmailTemplate {
  const who = a.tipsterName?.trim() || 'A tipster';
  const when = a.dropAt ? formatDropTime(a.dropAt, a.timezone) : null;
  const lead =
    a.kind === 'reminder'
      ? `${who}'s tips are dropping soon.`
      : `${who} scheduled a tip drop.`;
  const subject =
    a.kind === 'reminder'
      ? `Tips dropping soon${when ? ` — ${when}` : ''}`
      : `Upcoming tips: ${a.title}`;
  const parts = [lead, a.title];
  if (when) parts.push(`When: ${when}`);
  if (a.message?.trim()) parts.push(a.message.trim());
  return { subject, body: parts.join('\n\n') };
}

function formatAmount(cents: number, currency = 'USD'): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

export interface NewPickNotification {
  tipsterId: string;
  market: string;
  selection: string;
  oddsAtPick: number;
}

/** A resolved subscriber to notify. */
export interface NotificationRecipient {
  userId: string;
  email: string;
}

/**
 * Render the "new pick" digest once and fan it out to every recipient over both
 * channels. The Notifier is injected so callers (and tests) control transport.
 */
export async function dispatchNewPick(
  notifier: Notifier,
  pick: NewPickNotification,
  recipients: NotificationRecipient[],
): Promise<void> {
  const template = newPickDigestEmail(pick);
  await Promise.all(
    recipients.flatMap((r) => [
      notifier.sendEmail({
        to: r.email,
        subject: template.subject,
        body: template.body,
      }),
      notifier.sendPush({
        userId: r.userId,
        title: template.subject,
        body: template.body,
      }),
    ]),
  );
}
