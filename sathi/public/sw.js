/* ============================================================
   Sathi (साथी) — service worker
   - Offline shell: app UI loads even when the network drops
     (SOS flow survives flaky mobile networks)
   - Web Push: "SOS nearby" notification even when the app is
     backgrounded / closed on the phone
   ============================================================ */
'use strict';

const CACHE = 'sathi-shell-v1';
const SHELL = [
  '/',
  '/css/style.css',
  '/js/app.js',
  '/js/i18n.js',
  '/leaflet/leaflet.css',
  '/leaflet/leaflet.js',
  '/leaflet/images/marker-icon.png',
  '/leaflet/images/marker-shadow.png',
  '/socket.io/socket.io.js',
  '/manifest.webmanifest',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => { /* partial cache is fine */ })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiles, fonts, translation: network-first as usual

  // shell assets: cache-first (instant, offline-proof)
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // offline fallback for the main document
        if (req.mode === 'navigate') return caches.match('/');
        return Response.error();
      });
    })
  );
});

/* ---------------- web push ---------------- */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = {}; }
  const title = '🆘 Sathi — साथी';
  let body = 'SOS nearby — open the app to help.';
  if (data.kind === 'sos-match') body = `SOS ~${data.dist || '?'} m away — call connecting…`;
  else if (data.kind === 'sos-nearby') body = `SOS ~${data.dist || '?'} m away — open to help (5 s to accept).`;
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-512.png',
      badge: '/icon-512.png',
      tag: 'sathi-sos',
      renotify: true,
      data: { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow('/');
    })
  );
});
