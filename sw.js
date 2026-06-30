/* sw.js — Service Worker for PWA offline shell */
const CACHE = 'sleep-hub-v34';
const SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './supabase-config.js',
  './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first for API calls, cache-first for shell assets
  if (e.request.url.includes('supabase.co')) return; // always network for Supabase
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
