// Web Push (VAPID) delivery core (OB-031). Pure, provider-agnostic helpers so
// the send logic can be unit-tested with a mocked transport under the
// `--experimental-strip-types` runner. The Nest wiring (DB lookups, lazy
// `web-push` import) lives in push.service.ts.

/** A stored browser push subscription (mirrors the PushSubscription row). */
export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The shape `web-push` expects when sending a notification. */
export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The JSON payload delivered to the service worker's `push` handler. */
export interface PushPayload {
  title: string;
  body: string;
  /** Path the browser opens when the notification is clicked. */
  url?: string;
}

/** Resolved VAPID configuration read from the environment. */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Read VAPID config from the environment. Returns null when keys are absent so
 * callers can degrade gracefully (log-and-skip) rather than crash. `subject`
 * must be a `mailto:` or `https:` URL per RFC 8292; we default to a mailto.
 */
export function vapidConfig(
  env: NodeJS.ProcessEnv = process.env,
): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: env.VAPID_SUBJECT ?? 'mailto:no-reply@overlay.bet',
  };
}

/** Convert a stored subscription row into the `web-push` subscription shape. */
export function toWebPushSubscription(
  sub: StoredPushSubscription,
): WebPushSubscription {
  return { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
}

/** Serialize a push message into the JSON payload the service worker reads. */
export function buildPushPayload(payload: PushPayload): string {
  return JSON.stringify(payload);
}

/**
 * A push endpoint is "gone" — the subscription expired or the user revoked it —
 * when the push service responds 404 or 410. Such rows should be pruned.
 */
export function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/** Transport that actually pushes to one endpoint; rejects on failure. */
export type PushSend = (
  sub: WebPushSubscription,
  payload: string,
) => Promise<unknown>;

/** Outcome of a fan-out: endpoints to prune (gone) and how many succeeded. */
export interface DeliveryResult {
  sent: number;
  pruned: string[];
}

/**
 * Fan a single payload out to every stored subscription for a user via the
 * injected transport. Failures never throw: endpoints reported gone (404/410)
 * are collected for pruning, other errors are surfaced via `onError` so the
 * caller can log them without aborting the remaining sends.
 */
export async function deliverToSubscriptions(
  subs: StoredPushSubscription[],
  payload: string,
  send: PushSend,
  onError?: (endpoint: string, err: unknown) => void,
): Promise<DeliveryResult> {
  const pruned: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await send(toWebPushSubscription(sub), payload);
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (isGoneStatus(status)) {
          pruned.push(sub.endpoint);
        } else if (onError) {
          onError(sub.endpoint, err);
        }
      }
    }),
  );

  return { sent, pruned };
}
