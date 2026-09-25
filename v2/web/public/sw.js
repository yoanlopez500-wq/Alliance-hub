/* ============================================================
   AllianceHub 2.0 — Service Worker
   Estrategia:
   - Precache del shell (index.html) en install.
   - Assets compilados (hasheados): cache-first, inmutable.
   - Navegaciones (SPA): network-first, fallback al shell precacheado.
   - /api/* y *.supabase.co: NUNCA cache (datos siempre frescos).
   ============================================================ */

const VERSION = 'ah2-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL = ['./index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isApi(req) {
  const url = new URL(req.url);
  return url.pathname.startsWith('/api/')
    || url.hostname.endsWith('.supabase.co')
    || url.hostname === 'localhost' && url.port === '3001';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (isApi(request)) return; // red, sin cache

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    // SPA: red primero, fallback al shell (deep links offline/recarga)
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    // Hasheados por Vite: cache-first
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }))
    );
    return;
  }

  // resto (manifest, favicon): red con relleno de cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
