/* ============================================================
   AllianceHub 2.0 — Service Worker (v2.7)
   Fusion de la estrategia v2 + el arsenal probado del v1:

   CACHE (v2):
   - Shell (index.html) precacheado; assets /assets/* e /icons/*
     cache-first (Vite hashea los nombres: inmutables).
   - Navegaciones SPA: network-first, fallback al shell (deep links).
   - /api/* y *.supabase.co: NUNCA cache (datos siempre frescos).

   PUSH + DIAGNOSTICO (portado del v1, probado en produccion):
   - push -> showNotification con acciones Ver/Cerrar
   - IndexedDB ah-push-debug (ultimo push) + GET_LAST_PUSH
   - notificationclick: focus si la pestaña existe, si no openWindow
   - Mensajes: SKIP_WAITING, CLEAR_ALL_KILL_SWITCH (limpia todo)
   ============================================================ */

const VERSION = 'ah2-v2.15';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL = ['./index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => caches.keys())
      .then((names) => Promise.all(
        // Limpieza dura: cualquier cache que no sea de ESTA version
        names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))
      ))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function isApi(req) {
  const url = new URL(req.url);
  return url.pathname.startsWith('/api/')
    || url.hostname.endsWith('.supabase.co');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (isApi(request)) return; // red, sin cache

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
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

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

/* ===== PUSH DIAGNOSTICO (IndexedDB: ultimo push recibido) — portado v1 ===== */

function ahIdbOpen() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open('ah-push-debug', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

function ahIdbPut(val) {
  return ahIdbOpen().then((db) => new Promise((resolve) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, 'lastPush');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  })).catch(() => {});
}

function ahIdbGet() {
  return ahIdbOpen().then((db) => new Promise((resolve) => {
    const tx = db.transaction('kv', 'readonly');
    const rq = tx.objectStore('kv').get('lastPush');
    rq.onsuccess = () => resolve(rq.result || null);
    rq.onerror = () => resolve(null);
  })).catch(() => null);
}

self.addEventListener('push', (event) => {
  const info = { at: new Date().toISOString(), title: '(sin datos)' };
  try {
    const data = event.data ? event.data.json() : { title: 'AllianceHub', body: '' };
    info.title = data.title || 'AllianceHub';
    event.waitUntil(
      Promise.all([
        ahIdbPut(info),
        self.registration.showNotification(data.title || 'AllianceHub', {
          body: data.body || '',
          icon: data.icon || '/icons/icon-192x192.png',
          badge: data.icon || '/icons/icon-192x192.png',
          tag: data.tag || 'alliancehub',
          data: data.data || { url: '/' },
          actions: [
            { action: 'open', title: 'Ver' },
            { action: 'close', title: 'Cerrar' },
          ],
        }),
      ])
    );
  } catch (e) {
    event.waitUntil(ahIdbPut({ at: new Date().toISOString(), title: 'ERROR parseando push: ' + (e && e.message) }));
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_LAST_PUSH') {
    event.waitUntil(ahIdbGet().then((v) => {
      try { event.ports[0].postMessage(v); } catch (e) { /* noop */ }
    }));
  }
  if (event.data === 'CLEAR_ALL_CACHES' || event.data === 'CLEAR_ALL_KILL_SWITCH') {
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => {
        try { event.ports[0].postMessage('ALL_CACHES_CLEARED'); } catch (e) { /* noop */ }
      });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
