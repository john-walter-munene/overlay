// Browser Web Push (VAPID) helpers (OB-031). Registers the service worker,
// creates/removes the PushManager subscription and syncs it with the API so the
// backend can deliver new-pick alerts. All functions are safe to call in
// non-supporting browsers (they degrade to a clear error / no-op).

import { authFetch } from './auth';

/** Whether this browser supports service workers + the Push API. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Fetch the server's VAPID public key, or null when push isn't configured. */
export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await authFetch('/api/notifications/push/public-key');
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey: string | null };
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

/** Decode a base64url VAPID key into the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Register (idempotently) the push service worker and return its registration. */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

function subscriptionPayload(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  };
}

/**
 * Opt this browser in to push: request permission, subscribe via the service
 * worker and register the subscription with the API. Returns true on success.
 * Throws with a user-facing message when unsupported / permission denied.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    throw new Error('Push notifications are not available right now.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await registerServiceWorker();
  await navigator.serviceWorker.ready;

  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const res = await authFetch('/api/notifications/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscriptionPayload(sub)),
  });
  if (!res.ok) throw new Error('Failed to register push subscription.');
  return true;
}

/**
 * Opt this browser out of push: unsubscribe from the PushManager and tell the
 * API to drop the stored subscription. Best-effort; never throws.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await registration?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await authFetch('/api/notifications/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* best-effort opt-out */
  }
}
