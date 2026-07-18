// Alliance Hub Service Worker - v16.1
// Workbox-powered with automatic cache cleanup
// This SW auto-detects file changes via content hashes in precache manifest

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js');

workbox.setConfig({ debug: false });

// ===== PRECACHE - Assets that change rarely (icons, fonts) =====
workbox.precaching.precacheAndRoute([
  { url: 'assets/icons/icon-192x192.png', revision: '1' },
  { url: 'assets/icons/icon-512x512.png', revision: '1' },
  { url: 'manifest.json', revision: '16.1' }
]);

// ===== HTML PAGES - Network First (ALWAYS fresh) =====
workbox.routing.registerRoute(
  ({ request, url }) => {
    return request.destination === 'document' || 
           url.pathname.endsWith('.html');
  },
  new workbox.strategies.NetworkFirst({
    cacheName: 'ah-pages-v16',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// ===== JS/CSS - Stale While Revalidate =====
workbox.routing.registerRoute(
  ({ request }) => 
    request.destination === 'script' || 
    request.destination === 'style',
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'ah-static-v16',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// ===== IMAGES - Cache First =====
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: 'ah-images-v16',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60
      })
    ]
  })
);

// ===== FONTS - Cache First =====
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'font',
  new workbox.strategies.CacheFirst({
    cacheName: 'ah-fonts-v16',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 365 * 24 * 60 * 60
      })
    ]
  })
);

// ===== SUPABASE - NEVER cache =====
workbox.routing.registerRoute(
  ({ url }) => url.hostname.includes('supabase.co'),
  new workbox.strategies.NetworkOnly()
);

// ===== GOOGLE/CDN - Network First =====
workbox.routing.registerRoute(
  ({ url }) => 
    url.hostname.includes('google') || 
    url.hostname.includes('cdn') ||
    url.hostname.includes('gstatic'),
  new workbox.strategies.NetworkFirst({
    cacheName: 'ah-cdn-v16',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 7 * 24 * 60 * 60
      })
    ]
  })
);

// ===== MESSAGE HANDLER - Kill switch =====
self.addEventListener('message', function(event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_ALL_CACHES') {
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(n) { return caches.delete(n); }));
    }).then(function() {
      event.ports[0].postMessage('ALL_CACHES_CLEARED');
    });
  }
});

// ===== INSTALL - Clean old caches immediately =====
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (!cacheName.includes('-v16')) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ===== ACTIVATE - Claim clients immediately =====
self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', function(event) {
  if (!event.data) return;
  try { var data = event.data.json(); } catch(e) { var data = { title: 'Alliance Hub', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Alliance Hub', {
      body: data.body || '',
      icon: data.icon || 'assets/icons/icon-192x192.png',
      badge: data.icon || 'assets/icons/icon-72x72.png',
      tag: data.tag || 'alliance-hub',
      data: data.data || { url: './' },
      actions: [
        { action: 'open', title: 'Ver' },
        { action: 'close', title: 'Cerrar' }
      ]
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'close') return;
  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
