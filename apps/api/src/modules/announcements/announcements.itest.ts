// Integration test (OB-034): exercises tip-drop announcement fan-out against a
// REAL Postgres. Verifies the publish fan-out reaches active subscribers, skips
// opted-out users and non-active subscriptions, is idempotent, and that the
// subscriber "upcoming" view surfaces the drop. Runs in CI against the
// `postgres` service and locally against the docker-compose DB (`npm run db:up`).
//
// The decorator-free announcements core is exercised directly (Nest DI is not
// needed) so it runs under the `--experimental-strip-types` test runner.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  cancelAnnouncement,
  createAnnouncement,
  fanOutAnnouncement,
  listUpcomingAnnouncements,
  type AnnouncementFanOutDeps,
} from './announcements.core.ts';
import {
  dispatchAnnouncementWithPreferences,
  loadSubscriberRecipients,
} from '../notifications/preferences.ts';
import { announcementEmail } from '../notifications/templates.ts';
import type {
  EmailMessage,
  Notifier,
  PushMessage,
} from '../notifications/notifier.interface.ts';

const DB_URL =
  process.env.DATABASE_URL ??
  '******localhost:5432/overlay?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const BASE_URL = 'http://localhost:4000';

/** Provider-mocked Notifier that records every call. */
function fakeNotifier(): Notifier & {
  emails: EmailMessage[];
  pushes: PushMessage[];
  reset(): void;
} {
  const emails: EmailMessage[] = [];
  const pushes: PushMessage[] = [];
  return {
    name: 'fake',
    emails,
    pushes,
    reset() {
      emails.length = 0;
      pushes.length = 0;
    },
    async sendEmail(msg) {
      emails.push(msg);
    },
    async sendPush(msg) {
      pushes.push(msg);
    },
  };
}

const notifier = fakeNotifier();

/** Wire the real notification collaborators into the injectable fan-out deps. */
function fanOutDeps(): AnnouncementFanOutDeps {
  return {
    notifier,
    baseUrl: BASE_URL,
    loadRecipients: loadSubscriberRecipients,
    buildEmail: announcementEmail,
    dispatch: dispatchAnnouncementWithPreferences,
  };
}

const tag = randomUUID().slice(0, 8);
const tipsterId = `it_tipster_${tag}`;
const activeSub = `it_active_${tag}`; // active sub, default prefs → notified
const optedOut = `it_optedout_${tag}`; // active sub, both channels off → skipped
const canceledSub = `it_canceled_${tag}`; // canceled sub → skipped
const follower = `it_follower_${tag}`; // follows (no sub) → sees upcoming, not notified

before(async () => {
  await prisma.$connect();
  await prisma.user.create({
    data: { id: tipsterId, email: `${tipsterId}@itest.local`, role: 'tipster' },
  });
  await prisma.tipster.create({
    data: { userId: tipsterId, displayName: 'Ada the Tipster' },
  });

  for (const id of [activeSub, optedOut, canceledSub, follower]) {
    await prisma.user.create({
      data: { id, email: `${id}@itest.local`, role: 'user' },
    });
  }

  await prisma.subscription.create({
    data: { userId: activeSub, tipsterId, status: 'active' },
  });
  await prisma.subscription.create({
    data: { userId: optedOut, tipsterId, status: 'active' },
  });
  await prisma.subscription.create({
    data: { userId: canceledSub, tipsterId, status: 'canceled' },
  });
  await prisma.follow.create({ data: { userId: follower, tipsterId } });

  // The opted-out subscriber has disabled both channels.
  await prisma.notificationPreference.create({
    data: {
      userId: optedOut,
      emailEnabled: false,
      pushEnabled: false,
      unsubscribeToken: `it_tok_${tag}`,
    },
  });
});

after(async () => {
  await prisma.tipDropAnnouncement.deleteMany({ where: { tipsterId } });
  await prisma.auditLog.deleteMany({
    where: { entity: 'TipDropAnnouncement', actor: `tipster:${tipsterId}` },
  });
  await prisma.follow.deleteMany({ where: { tipsterId } });
  await prisma.subscription.deleteMany({ where: { tipsterId } });
  await prisma.notificationPreference.deleteMany({
    where: { userId: { in: [activeSub, optedOut, canceledSub, follower] } },
  });
  await prisma.tipster.deleteMany({ where: { userId: tipsterId } });
  await prisma.user.deleteMany({
    where: {
      id: { in: [tipsterId, activeSub, optedOut, canceledSub, follower] },
    },
  });
  await prisma.$disconnect();
});

let announcementId = '';

test('create persists an announcement with a resolved next drop time + audit', async () => {
  const row = await createAnnouncement(prisma, tipsterId, {
    title: 'Daily tips at 18:00 EAT',
    message: 'Big weekend slate.',
    timezone: 'Africa/Nairobi',
    recurrence: 'daily',
    timeOfDay: '18:00',
  });
  announcementId = row.id;

  assert.equal(row.status, 'active');
  assert.ok(row.nextDropAt, 'a recurring announcement has a next drop time');

  const audit = await prisma.auditLog.findMany({
    where: {
      entity: 'TipDropAnnouncement',
      entityId: announcementId,
      action: 'announcement.created',
    },
  });
  assert.equal(audit.length, 1);
});

test('fan-out reaches active subscribers, skipping opted-out and non-active', async () => {
  notifier.reset();
  const notified = await fanOutAnnouncement(
    prisma,
    announcementId,
    'published',
    fanOutDeps(),
  );

  // Only the active, non-opted-out subscriber is notified (email + push).
  assert.equal(notified, 1);
  assert.deepEqual(
    notifier.emails.map((e) => e.to),
    [`${activeSub}@itest.local`],
  );
  assert.deepEqual(
    notifier.pushes.map((p) => p.userId),
    [activeSub],
  );
  // Email carries the one-click unsubscribe footer.
  assert.match(notifier.emails[0].body, /Unsubscribe \(one click\):/);
});

test('publish fan-out is idempotent (second dispatch sends nothing)', async () => {
  notifier.reset();
  const notified = await fanOutAnnouncement(
    prisma,
    announcementId,
    'published',
    fanOutDeps(),
  );
  assert.equal(notified, 0);
  assert.equal(notifier.emails.length, 0);
  assert.equal(notifier.pushes.length, 0);
});

test('subscribers and followers see the upcoming drop; strangers do not', async () => {
  const forSub = await listUpcomingAnnouncements(prisma, activeSub);
  assert.equal(forSub.length, 1);
  assert.equal(forSub[0].id, announcementId);
  assert.equal(forSub[0].title, 'Daily tips at 18:00 EAT');
  // The subscriber view never carries gated pick fields.
  assert.ok(!('market' in forSub[0]));
  assert.ok(!('selection' in forSub[0]));

  const forFollower = await listUpcomingAnnouncements(prisma, follower);
  assert.equal(forFollower.length, 1);

  const forStranger = await listUpcomingAnnouncements(prisma, `nobody_${tag}`);
  assert.equal(forStranger.length, 0);
});

test('cancel hides the announcement and stops further fan-out', async () => {
  await cancelAnnouncement(prisma, tipsterId, announcementId);

  const forSub = await listUpcomingAnnouncements(prisma, activeSub);
  assert.equal(forSub.length, 0);

  notifier.reset();
  const notified = await fanOutAnnouncement(
    prisma,
    announcementId,
    'reminder',
    fanOutDeps(),
  );
  assert.equal(notified, 0);
  assert.equal(notifier.emails.length, 0);
});
