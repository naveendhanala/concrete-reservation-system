/// <reference lib="webworker" />
export {};
declare const self: ServiceWorkerGlobalScope;

// Push notification received
self.addEventListener('push', (event) => {
  let title = 'ConcreteMS';
  let body = '';
  let url = '/';
  try {
    const data = event.data?.json() ?? {};
    title = data.title ?? title;
    body = data.body ?? body;
    url = data.url ?? url;
  } catch (_) {}

  const options: NotificationOptions = {
    body,
    icon: '/icons/icon.svg',
    badge: '/icons/badge-72.png.svg',
    data: { url },
  };

  // Notify any open app windows so we can confirm SW received the push
  const notifyClients = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((c) => c.postMessage({ type: 'PUSH_RECEIVED', title, body }));
    });

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      notifyClients,
    ])
  );
});

// Notification clicked — open / focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) return client.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});
