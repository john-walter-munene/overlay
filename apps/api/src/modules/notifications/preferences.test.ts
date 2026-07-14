import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPickDigestEmail,
  defaultPreference,
  dispatchDailyDigests,
  dispatchNewPickWithPreferences,
  generateUnsubscribeToken,
  groupDigestByRecipient,
  isOptedOut,
  unsubscribeUrl,
  withUnsubscribeFooter,
  type NotificationPreference,
  type PreferenceRecipient,
} from './preferences.ts';
import type {
  EmailMessage,
  Notifier,
  PushMessage,
} from './notifier.interface.ts';
import type { EmailTemplate, NewPickNotification } from './templates.ts';

/** Provider-mocked Notifier that records every call. */
function fakeNotifier(): Notifier & {
  emails: EmailMessage[];
  pushes: PushMessage[];
} {
  const emails: EmailMessage[] = [];
  const pushes: PushMessage[] = [];
  return {
    name: 'fake',
    emails,
    pushes,
    async sendEmail(msg) {
      emails.push(msg);
    },
    async sendPush(msg) {
      pushes.push(msg);
    },
  };
}

const pick: NewPickNotification = {
  tipsterId: 't1',
  market: 'Match Odds',
  selection: 'Home',
  oddsAtPick: 2.1,
};

const pickTemplate: EmailTemplate = {
  subject: 'New pick posted',
  body: 'Match Odds: Home @ 2.1',
};

function pref(over: Partial<NotificationPreference> = {}): NotificationPreference {
  return { ...defaultPreference('tok'), ...over };
}

function recipient(
  userId: string,
  email: string,
  over: Partial<NotificationPreference> = {},
): PreferenceRecipient {
  return { userId, email, preference: pref({ unsubscribeToken: `tok-${userId}`, ...over }) };
}

const BASE = 'https://overlay.bet';

test('isOptedOut: true only when both channels are disabled', () => {
  assert.equal(isOptedOut(pref({ emailEnabled: false, pushEnabled: false })), true);
  assert.equal(isOptedOut(pref({ emailEnabled: true, pushEnabled: false })), false);
  assert.equal(isOptedOut(pref({ emailEnabled: false, pushEnabled: true })), false);
});

test('unsubscribeUrl: builds a token link without double slashes', () => {
  assert.equal(
    unsubscribeUrl('https://overlay.bet/', 'abc def'),
    'https://overlay.bet/notifications/unsubscribe?token=abc%20def',
  );
});

test('withUnsubscribeFooter: appends the unsubscribe link', () => {
  const body = withUnsubscribeFooter('Hi', 'https://overlay.bet/notifications/unsubscribe?token=x');
  assert.ok(body.startsWith('Hi'));
  assert.match(body, /Unsubscribe/i);
  assert.ok(body.includes('token=x'));
});

test('generateUnsubscribeToken: returns distinct URL-safe tokens', () => {
  const a = generateUnsubscribeToken();
  const b = generateUnsubscribeToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test('opted-out user receives nothing on instant dispatch', async () => {
  const notifier = fakeNotifier();
  const recipients = [
    recipient('u1', 'a@example.com', { emailEnabled: false, pushEnabled: false }),
  ];
  await dispatchNewPickWithPreferences(notifier, pickTemplate, recipients, BASE);
  assert.equal(notifier.emails.length, 0);
  assert.equal(notifier.pushes.length, 0);
});

test('instant dispatch honours per-channel opt-in and adds unsubscribe footer', async () => {
  const notifier = fakeNotifier();
  const recipients = [
    recipient('u1', 'a@example.com', { emailEnabled: true, pushEnabled: false }),
    recipient('u2', 'b@example.com', { emailEnabled: false, pushEnabled: true }),
  ];
  await dispatchNewPickWithPreferences(notifier, pickTemplate, recipients, BASE);

  assert.deepEqual(notifier.emails.map((e) => e.to), ['a@example.com']);
  assert.deepEqual(notifier.pushes.map((p) => p.userId), ['u2']);

  const email = notifier.emails[0];
  assert.equal(email.subject, 'New pick posted');
  assert.ok(email.body.startsWith('Match Odds: Home @ 2.1'));
  assert.ok(email.body.includes('/notifications/unsubscribe?token=tok-u1'));
});

test('daily-cadence users are skipped by instant dispatch (batched instead)', async () => {
  const notifier = fakeNotifier();
  const recipients = [recipient('u1', 'a@example.com', { frequency: 'daily' })];
  await dispatchNewPickWithPreferences(notifier, pickTemplate, recipients, BASE);
  assert.equal(notifier.emails.length, 0);
  assert.equal(notifier.pushes.length, 0);
});

test('groupDigestByRecipient: collapses many picks into one batch per user', () => {
  const r1 = recipient('u1', 'a@example.com', { frequency: 'daily' });
  const r2 = recipient('u2', 'b@example.com', { frequency: 'daily' });
  const pickB: NewPickNotification = { ...pick, selection: 'Away', oddsAtPick: 3.4 };
  const pickC: NewPickNotification = { ...pick, market: 'Total', selection: 'Over', oddsAtPick: 1.9 };

  const digests = groupDigestByRecipient([
    { recipient: r1, pick },
    { recipient: r2, pick: pickB },
    { recipient: r1, pick: pickC },
  ]);

  assert.equal(digests.length, 2);
  const d1 = digests.find((d) => d.recipient.userId === 'u1')!;
  assert.equal(d1.picks.length, 2);
  assert.deepEqual(d1.picks, [pick, pickC]);
});

test('buildPickDigestEmail: summarises all picks in one email', () => {
  const t = buildPickDigestEmail([
    pick,
    { ...pick, selection: 'Away', oddsAtPick: 3.4 },
  ]);
  assert.match(t.subject, /2 new picks/);
  assert.ok(t.body.includes('Match Odds: Home @ 2.1'));
  assert.ok(t.body.includes('Match Odds: Away @ 3.4'));
});

test('buildPickDigestEmail: singular wording for one pick', () => {
  const t = buildPickDigestEmail([pick]);
  assert.match(t.subject, /1 new pick\b/);
  assert.ok(!/picks/.test(t.subject));
});

test('digest batches correctly: one email per recipient with all their picks', async () => {
  const notifier = fakeNotifier();
  const r1 = recipient('u1', 'a@example.com', { frequency: 'daily' });
  const r2 = recipient('u2', 'b@example.com', { frequency: 'daily', emailEnabled: false, pushEnabled: false });
  const digests = groupDigestByRecipient([
    { recipient: r1, pick },
    { recipient: r1, pick: { ...pick, selection: 'Away', oddsAtPick: 3.4 } },
    { recipient: r2, pick },
  ]);

  const sent = await dispatchDailyDigests(notifier, digests, BASE);

  // Opted-out r2 gets nothing; r1 gets a single batched email.
  assert.equal(sent, 1);
  assert.equal(notifier.emails.length, 1);
  const email = notifier.emails[0];
  assert.equal(email.to, 'a@example.com');
  assert.match(email.subject, /2 new picks/);
  assert.ok(email.body.includes('Home @ 2.1'));
  assert.ok(email.body.includes('Away @ 3.4'));
  assert.ok(email.body.includes('/notifications/unsubscribe?token=tok-u1'));
});

test('dispatchDailyDigests: skips empty batches', async () => {
  const notifier = fakeNotifier();
  const r1 = recipient('u1', 'a@example.com', { frequency: 'daily' });
  const sent = await dispatchDailyDigests(notifier, [{ recipient: r1, picks: [] }], BASE);
  assert.equal(sent, 0);
  assert.equal(notifier.emails.length, 0);
});
