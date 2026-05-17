// Firebase Cloud Messaging service worker.
// Required filename: firebase-messaging-sw.js, must live in the scope you register.

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
importScripts('./firebase-config.js');

// Path that resolves to this SW's directory — used so icons resolve correctly
// under GitHub Pages project URLs like /stretchgoals/.
const BASE = self.registration.scope; // e.g. "https://lookbothways.github.io/stretchgoals/"

if (self.STRETCH_CONFIG && self.STRETCH_CONFIG.firebase
    && !self.STRETCH_CONFIG.firebase.projectId.startsWith('REPLACE_ME')) {

  firebase.initializeApp(self.STRETCH_CONFIG.firebase);
  const messaging = firebase.messaging();

  // We always send data-only messages from the server, so this handler is
  // guaranteed to fire and we are responsible for actually showing the
  // notification ourselves.
  messaging.onBackgroundMessage(payload => {
    const data = payload.data || {};
    const title = data.title || 'Stretch Goals';
    const body  = data.body  || 'Time to do your physio.';
    return self.registration.showNotification(title, {
      body,
      icon:  BASE + 'icons/icon-192.png',
      badge: BASE + 'icons/icon-192.png',
      tag: 'stretch-goals',
      renotify: true,
      requireInteraction: false,
      data: { url: BASE }
    });
  });
}

// Belt-and-braces: handle the raw `push` event too, in case onBackgroundMessage
// isn't wired up for some reason. Without this, Chrome may show its own
// generic "this site has been updated" notification.
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { data: { body: event.data.text() } }; }
  const data = payload.data || payload.notification || {};
  const title = data.title || 'Stretch Goals';
  const body  = data.body  || 'Time to do your physio.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  BASE + 'icons/icon-192.png',
      badge: BASE + 'icons/icon-192.png',
      tag: 'stretch-goals',
      renotify: true,
      data: { url: BASE }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || BASE;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(BASE) && 'focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
