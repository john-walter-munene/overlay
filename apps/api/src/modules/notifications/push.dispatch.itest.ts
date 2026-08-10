// Integration test (OB-031): a new pick fans out a Web Push alert to a
// tipster's opted-in subscribers, and only to them. Runs against a REAL
// Postgres (CI `postgres` service / local `npm run db:up`) so the whole path —
// Subscription + NotificationPreference lookups → preference filtering →
// PushSubscription lookup + delivery — is exercised end to end.
//
// It mirrors NotificationsService.notifyNewPick + PushService.sendPush using the
// same pure building blocks those services use (the Nest classes carry
// decorators that the strip-types test runner can't load), so the real DB reads
// and the real fan-out/delivery helpers are all covered.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  dispatchNewPickWithPreferences,
  type NotificationPreference,
  type PreferenceRecipient,
} from './preferences.ts';
import { newPickDigestEmail } from './templates.ts';
import {
  buildPushPayload,
  deliverToSubscriptions,
  type StoredPushSubscription,
} from './web-push.ts';
import type { Notifier, PushMessage } from './notifier.interface.ts';

const DB_URL =
  process.env.DATABASE_URL ??
  '******localhost:5432/overlay?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const tag = randomUUID().slice(0, 8);
const tipsterId = `it_push_tipster_${tag}`;
const optedIn = `it_push_in_${tag}`;
const pushOff = `it_push_off_${tag}`;
const endpointIn = `https://push.example/${tag}/in`;
const endpointOff = `https://push.example/${tag}/off`;

// Records every web-push send so we can assert who actually received an alert.
const sends: Array<{ endpoint: string; payload: string }> = [];

/**
 * PushService.sendPush, distilled: read the user's stored subscriptions and
 * deliver via the injected transport. Uses the same helpers the service does.
 */
async function sendPush(msg: PushMessage): Promise<void> {
  const subs = (await prisma.pushSubscription.findMany({
    where: { userId: msg.userId },
    select: { endpoint: true, p256dh: true, auth: true },
  })) as StoredPushSubscription[];
  if (subs.length === 0) return;

  const payload = buildPushPayload({ title: msg.title, body: msg.body, url: '/feed' });
  await deliverToSubscriptions(subs, payload, async (sub, body) => {
    sends.push({ endpoint: sub.endpoint, payload: body });
  });
}

const notifier: Notifier = {
  name: 'test',
  async sendEmail() {
    /* email not under test */
  },
  sendPush,
};

before(async () => {
  await prisma.user.create({
    data: { id: tipsterId, email: `${tipsterId}@example.com` },
  });
  await prisma.tipster.create({ data: { userId: tipsterId } });

  // Opted-in subscriber: push enabled, instant cadence, one browser subscription.
  await prisma.user.create({
    data: { id: optedIn, email: `${optedIn}@example.com` },
  });
  await prisma.notificationPreference.create({
    data: {
      userId: optedIn,
      emailEnabled: true,
      pushEnabled: true,
      frequency: 'instant',
      unsubscribeToken: `tok_in_${tag}`,
    },
  });
  await prisma.pushSubscription.create({
    data: { userId: optedIn, endpoint: endpointIn, p256dh: 'p1', auth: 'a1' },
  });
  await prisma.subscription.create({
    data: { userId: optedIn, tipsterId, status: 'active' },
  });

  // Push-disabled subscriber: has a browser subscription row but pushEnabled=false.
  await prisma.user.create({
    data: { id: pushOff, email: `${pushOff}@example.com` },
  });
  await prisma.notificationPreference.create({
    data: {
      userId: pushOff,
      emailEnabled: true,
      pushEnabled: false,
      frequency: 'instant',
      unsubscribeToken: `tok_off_${tag}`,
    },
  });
  await prisma.pushSubscription.create({
    data: { userId: pushOff, endpoint: endpointOff, p256dh: 'p2', auth: 'a2' },
  });
  await prisma.subscription.create({
    data: { userId: pushOff, tipsterId, status: 'active' },
  });
});

after(async () => {
  await prisma.pushSubscription.deleteMany({
    where: { userId: { in: [optedIn, pushOff] } },
  });
  await prisma.subscription.deleteMany({ where: { tipsterId } });
  await prisma.notificationPreference.deleteMany({
    where: { userId: { in: [optedIn, pushOff] } },
  });
  await prisma.tipster.deleteMany({ where: { userId: tipsterId } });
  await prisma.user.deleteMany({
    where: { id: { in: [tipsterId, optedIn, pushOff] } },
  });
  await prisma.$disconnect();
});

/** Load a tipster's active subscribers with preferences (as notifyNewPick does). */
async function loadRecipients(): Promise<PreferenceRecipient[]> {
  const subs = await prisma.subscription.findMany({
    where: { tipsterId, status: 'active' },
    include: { user: { include: { notificationPreference: true } } },
  });
  return subs.map((s) => {
    const p = s.user.notificationPreference!;
    const preference: NotificationPreference = {
      emailEnabled: p.emailEnabled,
      pushEnabled: p.pushEnabled,
      frequency: p.frequency as NotificationPreference['frequency'],
      unsubscribeToken: p.unsubscribeToken,
    };
    return { userId: s.userId, email: s.user.email, preference };
  });
}

test('new pick pushes only to opted-in subscribers', async () => {
  const recipients = await loadRecipients();
  const template = newPickDigestEmail({
    market: 'Match Odds',
    selection: 'Home',
    oddsAtPick: 2.1,
  });

  await dispatchNewPickWithPreferences(
    notifier,
    template,
    recipients,
    'http://localhost:4000',
  );

  // Exactly one push: the opted-in subscriber's endpoint. The push-disabled
  // subscriber is filtered out even though a subscription row exists for them.
  assert.equal(sends.length, 1);
  assert.equal(sends[0].endpoint, endpointIn);

  const payload = JSON.parse(sends[0].payload);
  assert.equal(payload.title, 'New pick posted');
  assert.equal(payload.body, 'Match Odds: Home @ 2.1');
  assert.equal(payload.url, '/feed');
});
