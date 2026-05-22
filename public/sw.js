// Polywordlot Service Worker — cache-first with background revalidation
const CACHE_NAME = 'polywordlot-v1';
const VERSION_URL = '/version.json';

// Assets that should always be cached on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
];

// Install: precache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API analytics calls: network-only (fire-and-forget)
  if (url.pathname.startsWith('/api/')) return;

  // version.json: network-first (always get latest)
  if (url.pathname === VERSION_URL) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Dictionary files + static assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    )
  );
});

// Listen for version check messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    fetch(VERSION_URL, { cache: 'no-store' })
      .then((r) => r.json())
      .then((serverVersion) => {
        caches.open(CACHE_NAME).then((cache) =>
          cache.match(VERSION_URL).then((cached) => {
            if (!cached) return;
            cached.json().then((localVersion) => {
              if (localVersion.sha !== serverVersion.sha) {
                // New version available — clear cache and reload
                caches.delete(CACHE_NAME).then(() => {
                  self.clients.matchAll().then((clients) => {
                    clients.forEach((client) =>
                      client.postMessage({ type: 'UPDATE_AVAILABLE', version: serverVersion.sha })
                    );
                  });
                });
              }
            });
          })
        );
      })
      .catch(() => { /* offline — skip update check */ });
  }
});
