// Stretch Goals — unified service worker.
// Handles BOTH offline caching AND Firebase Cloud Messaging push events.
//
// Why one file: service workers are one-per-scope. A separate
// firebase-messaging-sw.js at the same scope just replaces this one
// (or vice versa), so the second registration "wins" and the other's
// behavior silently goes away.

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
importScripts('./firebase-config.js');

const BASE  = self.registration.scope;   // e.g. https://USER.github.io/stretchgoals/
const CACHE = 'stretch-goals-v6';

// ----- IndexedDB helper: read the "done today" flag the page writes. -----
function _openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('stretch-goals', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('flags');
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
function _todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
async function isDoneToday() {
  try {
    const db = await _openIDB();
    return await new Promise(res => {
      const tx = db.transaction('flags', 'readonly');
      const req = tx.objectStore('flags').get('doneOn');
      req.onsuccess = () => res(req.result === _todayKey());
      req.onerror   = () => res(false);
    });
  } catch { return false; }
}
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ---------- Firebase Cloud Messaging ----------
if (self.STRETCH_CONFIG && self.STRETCH_CONFIG.firebase
    && !self.STRETCH_CONFIG.firebase.projectId.startsWith('REPLACE_ME')) {
  firebase.initializeApp(self.STRETCH_CONFIG.firebase);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(async payload => {
    if (await isDoneToday()) return; // user already ticked today's box
    const d = payload.data || {};
    return self.registration.showNotification(d.title || 'Stretch Goals', {
      body:  d.body || 'Time to do your physio.',
      icon:  BASE + 'icons/icon-192.png',
      badge: BASE + 'icons/icon-192.png',
      tag: 'sg-' + Date.now(),  // unique per push so each one dings
      renotify: true,
      data: { url: BASE }
    });
  });
}

// Belt-and-braces: handle raw push events too, in case onBackgroundMessage
// doesn't fire (different browsers behave differently here).
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { data: { body: event.data.text() } }; }
  const d = payload.data || payload.notification || {};
  event.waitUntil((async () => {
    if (await isDoneToday()) return; // suppressed: user already done for today
    return self.registration.showNotification(d.title || 'Stretch Goals', {
      body:  d.body || 'Time to do your physio.',
      icon:  BASE + 'icons/icon-192.png',
      badge: BASE + 'icons/icon-192.png',
      tag: 'sg-' + Date.now(),
      renotify: true,
      data: { url: BASE }
    });
  })());
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

// ---------- App-shell caching (network-first) ----------
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw new Error('offline and no cache');
    }
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
