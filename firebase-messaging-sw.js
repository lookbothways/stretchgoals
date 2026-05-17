// Firebase Cloud Messaging service worker.
// Required filename: firebase-messaging-sw.js, must live at the site root
// (or in the scope you register).

// Compat builds work in service worker context (the modular SDK doesn't
// fully, yet, in SW for FCM). These are tiny and safe.
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

// Pull shared config (sets self.STRETCH_CONFIG).
importScripts('./firebase-config.js');

if (self.STRETCH_CONFIG && self.STRETCH_CONFIG.firebase && !self.STRETCH_CONFIG.firebase.projectId.startsWith('REPLACE_ME')) {
  firebase.initializeApp(self.STRETCH_CONFIG.firebase);
  const messaging = firebase.messaging();

  // Show whatever the server sent.
  messaging.onBackgroundMessage(payload => {
    const title = (payload.notification && payload.notification.title)
               || (payload.data && payload.data.title)
               || 'Stretch Goals';
    const body  = (payload.notification && payload.notification.body)
               || (payload.data && payload.data.body)
               || 'Time to do your physio.';
    self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'stretch-goals',
      renotify: false
    });
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});
