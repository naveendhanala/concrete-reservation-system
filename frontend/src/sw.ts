/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Push notification received
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title: string = data.title ?? 'ConcreteMS';
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: '/icons/icon.svg',
    badge: '/icons/badge-72.png.svg',
    data: { url: data.url ?? '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
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
