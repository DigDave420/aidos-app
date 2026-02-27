const CACHE_NAME = 'aidos-app-v6';
const API_CACHE = 'aidos-api-v1';
const MAX_API_ENTRIES = 50;

// App shell — pre-cached on install
const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './team-data.json',
  './players.json',
  './bears-logo.svg',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

// API domains that get network-first with caching
const API_HOSTS = [
  'api.nal.usda.gov',
  'world.openfoodfacts.org'
];

// ── Install: pre-cache app shell ──────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches, claim clients ─────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for app, network-first for APIs ────────────────
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // API calls: network-first, cache fallback
  if (API_HOSTS.some(host => url.hostname === host)) {
    e.respondWith(networkFirstWithCache(e.request));
    return;
  }

  // App files: cache-first, network fallback
  e.respondWith(cacheFirstWithNetwork(e.request));
});

// Cache-first strategy for app shell
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Cache successful responses for same-origin files
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// Network-first strategy for API calls (cache last 50 responses)
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
      await trimApiCache();
    }
    return response;
  } catch {
    // Fall back to cached API response
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Keep API cache from growing too large
async function trimApiCache() {
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_API_ENTRIES) {
    const toDelete = keys.slice(0, keys.length - MAX_API_ENTRIES);
    await Promise.all(toDelete.map(k => cache.delete(k)));
  }
}

// ── Update notification ───────────────────────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
