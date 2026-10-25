/**
 * ZIPLI PRO — Service Worker (Offline First & PWA Shell)
 *
 * Implements:
 * 1. Pre-caching static app shell (HTML, CSS, JS modules).
 * 2. Stale-while-revalidate for product and category catalog APIs with strict PII hygiene (F-023).
 * 3. Never caches authenticated endpoints, payments, or private personal responses.
 * 4. Graceful offline fallback.
 */

importScripts('./js/utils/swCachePolicy.js');

const CACHE_NAME = 'zipli-pro-v5';

const STATIC_ASSETS = [
  './',
  './index.html',
  './styleguide.html',
  './admin.html',
  './css/variables.css',
  './css/components.css',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/store.js',
  './js/router.js',
  './js/data/fallbackCatalog.js',
  './js/utils/dom.js',
  './js/utils/format.js',
  './js/utils/storage.js',
  './js/utils/offlineQueue.js',
  './js/utils/sseClient.js',
  './js/utils/swCachePolicy.js',
  './js/components/header.js',
  './js/components/productCard.js',
  './js/components/cartDrawer.js',
  './js/components/assistantDrawer.js',
  './js/components/toast.js',
  './js/components/modal.js',
  './js/charts/svgCharts.js',
  './js/pages/homePage.js',
  './js/pages/searchPage.js',
  './js/pages/productPage.js',
  './js/pages/checkoutPage.js',
  './js/pages/orderTrackingPage.js',
  './js/pages/accountPage.js',
  './js/pages/adminPage.js',
];

// Install: Cache static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('SW pre-cache non-fatal warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Prune outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const staleKeys = self.swCachePolicy
        ? self.swCachePolicy.getStaleCacheKeys(keys, CACHE_NAME)
        : keys.filter((k) => k !== CACHE_NAME);

      return Promise.all(staleKeys.map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

// Fetch: Enforce strict cache policy
self.addEventListener('fetch', (event) => {
  // Validate request cacheability (rejects non-GET, Authorization header, and sensitive endpoints)
  if (self.swCachePolicy && !self.swCachePolicy.isRequestCacheable(event.request)) {
    return;
  }

  const url = new URL(event.request.url);

  // Catalog API caching (Stale-while-revalidate for public products & categories)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              (!self.swCachePolicy || self.swCachePolicy.isResponseCacheable(networkResponse))
            ) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // App shell & static assets (Cache-first with network fallback)
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (
            !response ||
            response.status !== 200 ||
            response.type !== 'basic' ||
            (self.swCachePolicy && !self.swCachePolicy.isResponseCacheable(response))
          ) {
            return response;
          }
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, toCache);
          });
          return response;
        });
      })
      .catch(() => {
        // Offline fallback for navigation requests
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      })
  );
});
