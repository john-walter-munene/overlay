/**
 * Pure newsletter helpers (no framework deps) so they run under
 * `node --experimental-strip-types` in unit tests.
 */

import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const APP_NAME = 'Overlay Bets';
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize and validate a newsletter email. Trims, lowercases, and checks a
 * basic shape + length. Returns the normalized email, or null if invalid.
 */
export function normalizeSubscriberEmail(raw: string): string | null {
  const email = (raw ?? '').trim().toLowerCase();
  if (!email || email.length > 200) return null;
  if (!EMAIL_SHAPE.test(email)) return null;
  return email;
}

/** Generate a fresh, URL-safe opaque token (confirm / unsubscribe). */
export function generateNewsletterToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Double opt-in confirmation link the visitor must click to activate. */
export function newsletterConfirmUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/newsletter/confirm?token=${encodeURIComponent(
    token,
  )}`;
}

/** One-click unsubscribe link (CAN-SPAM/GDPR) for a subscriber token. */
export function newsletterUnsubscribeUrl(
  baseUrl: string,
  token: string,
): string {
  return `${baseUrl.replace(/\/+$/, '')}/newsletter/unsubscribe?token=${encodeURIComponent(
    token,
  )}`;
}

/**
 * Plain-text body for the double opt-in confirmation request. The visitor must
 * click the link before any newsletter is sent (GDPR consent).
 */
export function newsletterConfirmRequestBody(confirmUrl: string): string {
  return [
    `Please confirm your subscription to the ${APP_NAME} newsletter.`,
    '',
    'Click the link below to confirm (double opt-in) — you will not receive any',
    'newsletters until you do:',
    '',
    confirmUrl,
    '',
    'If you did not request this, simply ignore this email and nothing will be',
    'sent to you.',
    '',
    `\u2014 The ${APP_NAME} team`,
  ].join('\n');
}

/** Plain-text body for the post-confirmation welcome email. */
export function newsletterConfirmationBody(): string {
  return [
    `Thanks for confirming your subscription to the ${APP_NAME} newsletter.`,
    '',
    'You will get our weekly "Picks of the Week" digest, verified-tipster',
    'insights and closing line value education — no spam.',
    '',
    'You can unsubscribe in one click from the footer of any email.',
    '',
    `\u2014 The ${APP_NAME} team`,
  ].join('\n');
}

/** A single pick summarised in the weekly digest. */
export interface WeeklyDigestPick {
  tipsterName: string;
  market: string;
  selection: string;
  oddsAtPick: number;
}

/** Subject line for the weekly "Picks of the Week" digest. */
export const WEEKLY_DIGEST_SUBJECT = `${APP_NAME} — Picks of the Week`;

/**
 * Compose the shared body of the weekly "Picks of the Week" digest from the
 * week's picks. The per-recipient unsubscribe footer is appended separately
 * (see withNewsletterFooter) so the body can be rendered once and reused.
 */
export function buildWeeklyDigestBody(picks: WeeklyDigestPick[]): string {
  const lines = [
    'Here are this week\u2019s standout picks from verified tipsters on',
    `${APP_NAME}:`,
    '',
  ];
  for (const p of picks) {
    lines.push(
      `\u2022 ${p.tipsterName}: ${p.market} \u2014 ${p.selection} @ ${p.oddsAtPick}`,
    );
  }
  lines.push(
    '',
    'Bet responsibly. Past performance is not a guarantee of future results.',
  );
  return lines.join('\n');
}

/** Append the one-click unsubscribe footer to a newsletter email body. */
export function withNewsletterFooter(
  body: string,
  unsubscribeUrl: string,
): string {
  return (
    `${body}\n\n` +
    `\u2014\n` +
    `You're receiving this because you subscribed to the ${APP_NAME} newsletter.\n` +
    `Unsubscribe (one click): ${unsubscribeUrl}`
  );
}

// --- Orchestration ----------------------------------------------------------
// Framework-free flow logic (double opt-in, unsubscribe, weekly digest). Kept
// here (self-contained, type-only local imports) so it runs under the
// `--experimental-strip-types` test runner, mirroring preferences.ts. The
// decorated Nest service (newsletter.service.ts) is a thin delegator.


/** Minimal mailer the flow needs (one-off transactional sends). */
export interface NewsletterMailer {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

/** Best-effort logger; email delivery failures are logged, never thrown. */
export interface FlowLogger {
  warn(message: string): void;
  log?(message: string): void;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const noopLogger: FlowLogger = { warn() {}, log() {} };

/** Outcome of the subscribe/confirm/unsubscribe flows for the caller to map. */
export type FlowResult = 'ok' | 'invalid' | 'unknown';

/**
 * Start a double opt-in subscription. Idempotent: an already-`subscribed`
 * address is a no-op success (never re-sent). Otherwise the address is stored /
 * updated as `pending` with a fresh confirm token and a confirmation email is
 * sent — nothing else is delivered until the visitor clicks the link (consent).
 * Delivery failures never fail the request; the pending opt-in is saved.
 */
export async function subscribeFlow(
  prisma: PrismaClient,
  mailer: NewsletterMailer,
  baseUrl: string,
  rawEmail: string,
  logger: FlowLogger = noopLogger,
): Promise<FlowResult> {
  const email = normalizeSubscriberEmail(rawEmail);
  if (!email) return 'invalid';

  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { email },
  });
  if (existing && existing.status === 'subscribed') return 'ok';

  const confirmToken = generateNewsletterToken();
  await prisma.newsletterSubscriber.upsert({
    where: { email },
    update: { status: 'pending', confirmToken },
    create: {
      email,
      status: 'pending',
      confirmToken,
      unsubscribeToken: generateNewsletterToken(),
    },
  });

  try {
    await mailer.sendEmail(
      email,
      'Confirm your Overlay Bets newsletter subscription',
      newsletterConfirmRequestBody(newsletterConfirmUrl(baseUrl, confirmToken)),
    );
  } catch (err) {
    logger.warn(
      `Newsletter confirmation email failed for ${email}: ${String(err)}`,
    );
  }

  return 'ok';
}

/**
 * Complete double opt-in: activate the subscriber matching a confirm token,
 * record consent, clear the token, and send a welcome email (failures are
 * swallowed). Unknown/blank tokens are reported for the caller to map.
 */
export async function confirmFlow(
  prisma: PrismaClient,
  mailer: NewsletterMailer,
  token: string,
  logger: FlowLogger = noopLogger,
): Promise<FlowResult> {
  const trimmed = (token ?? '').trim();
  if (!trimmed) return 'invalid';

  const row = await prisma.newsletterSubscriber.findUnique({
    where: { confirmToken: trimmed },
  });
  if (!row) return 'unknown';

  await prisma.newsletterSubscriber.update({
    where: { id: row.id },
    data: { status: 'subscribed', confirmedAt: new Date(), confirmToken: null },
  });

  try {
    await mailer.sendEmail(
      row.email,
      'Welcome to the Overlay Bets newsletter',
      newsletterConfirmationBody(),
    );
  } catch (err) {
    logger.warn(
      `Newsletter welcome email failed for ${row.email}: ${String(err)}`,
    );
  }

  return 'ok';
}

/**
 * One-click unsubscribe (CAN-SPAM/GDPR): mark the subscriber matching an
 * unsubscribe token as `unsubscribed` (retained as a suppression record).
 * Idempotent; unknown/blank tokens are reported for the caller to map.
 */
export async function unsubscribeFlow(
  prisma: PrismaClient,
  token: string,
): Promise<FlowResult> {
  const trimmed = (token ?? '').trim();
  if (!trimmed) return 'invalid';

  const row = await prisma.newsletterSubscriber.findUnique({
    where: { unsubscribeToken: trimmed },
  });
  if (!row) return 'unknown';

  await prisma.newsletterSubscriber.update({
    where: { id: row.id },
    data: { status: 'unsubscribed', confirmToken: null },
  });
  return 'ok';
}

/**
 * Compose and send the weekly "Picks of the Week" digest to every confirmed
 * subscriber. Picks are the locked picks from the last `sinceMs` window
 * (default 7 days). Pending / unsubscribed addresses receive nothing; each
 * email carries a one-click unsubscribe footer. Returns the number of emails
 * sent (0 when there are no picks or no subscribers).
 */
export async function sendWeeklyDigestFlow(
  prisma: PrismaClient,
  mailer: NewsletterMailer,
  baseUrl: string,
  sinceMs = WEEK_MS,
  logger: FlowLogger = noopLogger,
): Promise<{ sent: number; picks: number }> {
  const since = new Date(Date.now() - sinceMs);
  const rawPicks = await prisma.pick.findMany({
    where: { lockedAt: { gte: since } },
    orderBy: { lockedAt: 'desc' },
    take: 20,
    include: { tipster: { include: { user: true } } },
  });

  const picks: WeeklyDigestPick[] = rawPicks.map((p: any) => ({
    tipsterName:
      p.tipster?.displayName ?? p.tipster?.user?.username ?? 'A verified tipster',
    market: p.market,
    selection: p.selection,
    oddsAtPick: p.oddsAtPick,
  }));

  if (picks.length === 0) return { sent: 0, picks: 0 };

  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { status: 'subscribed' },
    select: { email: true, unsubscribeToken: true },
  });
  if (subscribers.length === 0) return { sent: 0, picks: picks.length };

  const body = buildWeeklyDigestBody(picks);

  let sent = 0;
  for (const sub of subscribers) {
    try {
      await mailer.sendEmail(
        sub.email,
        WEEKLY_DIGEST_SUBJECT,
        withNewsletterFooter(
          body,
          newsletterUnsubscribeUrl(baseUrl, sub.unsubscribeToken),
        ),
      );
      sent += 1;
    } catch (err) {
      logger.warn(`Weekly digest email failed for ${sub.email}: ${String(err)}`);
    }
  }

  logger.log?.(
    `Weekly digest: sent ${sent} email(s) for ${picks.length} pick(s)`,
  );
  return { sent, picks: picks.length };
}
