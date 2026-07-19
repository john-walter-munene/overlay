/* Overlay Bets service worker — Web Push (VAPID) new-pick alerts (OB-031).
 *
 * Handles two events:
 *  - `push`: renders the notification pushed by the API (title/body/url).
 *  - `notificationclick`: focuses an existing tab or opens the target URL.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: 'Overlay Bets', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Overlay Bets';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'overlay-pick',
    data: { url: payload.url || '/feed' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/feed';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const url = new URL(client.url);
          if (url.pathname === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
