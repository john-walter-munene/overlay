import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { PushMessage } from './notifier.interface';
import {
  buildPushPayload,
  deliverToSubscriptions,
  vapidConfig,
  type PushSend,
  type StoredPushSubscription,
} from './web-push';

/** Client-supplied Web Push subscription (from `PushManager.subscribe`). */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Web Push (VAPID) subscription store + delivery (OB-031).
 *
 * Persists one row per browser/device a user opted in from and pushes new-pick
 * alerts to them. The `web-push` SDK is imported lazily so the app builds/runs
 * without VAPID keys; when keys are absent, `sendPush` logs and no-ops (dev/test
 * parity with the mock notifier). Endpoints the push service reports as gone
 * (404/410) are pruned automatically.
 *
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional).
 */
@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webPush: any;

  constructor(private readonly prisma: PrismaService) {}

  /** Whether VAPID keys are configured (push can actually be delivered). */
  isConfigured(): boolean {
    return vapidConfig() !== null;
  }

  /** The VAPID public key clients need to create a subscription, or null. */
  publicKey(): string | null {
    return vapidConfig()?.publicKey ?? null;
  }

  /**
   * Store (or refresh) a browser subscription for a user. Keyed by endpoint so
   * re-subscribing from the same browser is idempotent and re-homes an endpoint
   * to the current user if it was previously owned by someone else.
   */
  async saveSubscription(
    userId: string,
    sub: PushSubscriptionInput,
  ): Promise<{ ok: true }> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    });
    return { ok: true };
  }

  /** Remove a browser subscription (opt-out from this device). Idempotent. */
  async removeSubscription(
    userId: string,
    endpoint: string,
  ): Promise<{ ok: true }> {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { ok: true };
  }

  /** Lazily load and configure the `web-push` SDK with the VAPID details. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadWebPush(config: {
    publicKey: string;
    privateKey: string;
    subject: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    if (!this.webPush) {
      const mod = await import('web-push');
      // The package exports its API on the default in ESM interop.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.webPush = (mod as any).default ?? mod;
    }
    this.webPush.setVapidDetails(
      config.subject,
      config.publicKey,
      config.privateKey,
    );
    return this.webPush;
  }

  /**
   * Deliver a push alert to every browser a user has opted in from. No-ops when
   * VAPID isn't configured or the user has no subscriptions. Endpoints reported
   * gone are pruned from the store.
   */
  async sendPush(msg: PushMessage): Promise<void> {
    const config = vapidConfig();
    if (!config) {
      this.log.debug(`push skipped (VAPID not configured) user=${msg.userId}`);
      return;
    }

    const subs = (await this.prisma.pushSubscription.findMany({
      where: { userId: msg.userId },
      select: { endpoint: true, p256dh: true, auth: true },
    })) as StoredPushSubscription[];
    if (subs.length === 0) return;

    const webPush = await this.loadWebPush(config);
    const payload = buildPushPayload({
      title: msg.title,
      body: msg.body,
      url: '/feed',
    });
    const send: PushSend = (sub, body) =>
      webPush.sendNotification(sub, body);

    const { pruned } = await deliverToSubscriptions(subs, payload, send, (
      endpoint,
      err,
    ) => this.log.warn(`push failed endpoint=${endpoint}: ${String(err)}`));

    if (pruned.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: pruned } },
      });
    }
  }
}
