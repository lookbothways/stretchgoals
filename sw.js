// Stretch Goals — app-shell service worker.
// Strategy: network-first with cache fallback. Updates ship on every visit
// the user has connectivity, and the cache still keeps the page working
// offline. Bump CACHE whenever you change this file.

const CACHE = 'stretch-goals-v3';
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

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Delete every cache that isn't this version.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle same-origin GETs; let Firebase / fonts / etc. pass through.
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // Keep a copy for offline use.
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

// Allow the page to force a take-over without a reload.
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
