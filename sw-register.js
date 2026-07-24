// sw-register.js - Smart service worker registration with auto-update
// Cada deploy con timestamp nuevo fuerza limpieza de caches y hard reload.

(function() {
    'use strict';

    if (!('serviceWorker' in navigator)) return;

    // Build ID: timestamp al minuto (YYYYMMDDHHMM). Cambia automaticamente
    // en cada deploy, invalidando caches sin editar manualmente versiones.
    function buildId() {
        var d = new Date();
        function p(n) { return String(n).padStart(2, '0'); }
        return d.getFullYear() +
            p(d.getMonth() + 1) +
            p(d.getDate()) +
            p(d.getHours()) +
            p(d.getMinutes());
    }

    var CURRENT_VERSION = 'ah-' + buildId();
    var STORED_VERSION = localStorage.getItem('ah_sw_version');

    function clearAllCaches() {
        if (!('caches' in window)) return Promise.resolve();
        return caches.keys().then(function(names) {
            return Promise.all(names.map(function(n) {
                console.log('[SW-Reg] Deleting cache:', n);
                return caches.delete(n);
            }));
        });
    }

    // Si hay un SW activo, intentar limpiar sus caches via postMessage primero.
    function requestSWCacheClear() {
        return new Promise(function(resolve) {
            if (!navigator.serviceWorker.controller) { resolve(); return; }
            var chan = new MessageChannel();
            chan.port1.onmessage = function(e) {
                if (e.data === 'ALL_CACHES_CLEARED') console.log('[SW-Reg] SW confirmo limpieza');
                resolve();
            };
            try {
                navigator.serviceWorker.controller.postMessage('CLEAR_ALL_CACHES', [chan.port2]);
                setTimeout(resolve, 500);
            } catch (e) { resolve(); }
        });
    }

    // If version changed, clear everything and force reload
    if (STORED_VERSION && STORED_VERSION !== CURRENT_VERSION) {
        console.log('[SW-Reg] Version changed:', STORED_VERSION, '->', CURRENT_VERSION);

        navigator.serviceWorker.getRegistrations().then(function(regs) {
            return Promise.all(regs.map(function(r) { return r.unregister(); }));
        }).then(function() {
            return requestSWCacheClear();
        }).then(function() {
            return clearAllCaches();
        }).then(function() {
            localStorage.setItem('ah_sw_version', CURRENT_VERSION);
            console.log('[SW-Reg] Hard reloading for fresh content...');
            window.location.reload(true);
        }).catch(function(e) {
            console.error('[SW-Reg] Cleanup error:', e);
            clearAllCaches().finally(function() {
                localStorage.setItem('ah_sw_version', CURRENT_VERSION);
                window.location.reload(true);
            });
        });

        return;
    }

    localStorage.setItem('ah_sw_version', CURRENT_VERSION);

    // Cache-buster en la URL del propio SW para que el navegador nunca
    // use un service-worker.js cacheado por un SW atascado o un proxy.
    var swUrl = './service-worker.js?bust=' + buildId();
    if (window.AHBuster) swUrl = window.AHBuster.url(swUrl);

    navigator.serviceWorker.register(swUrl)
        .then(function(reg) {
            console.log('[SW-Reg] Registered:', reg.scope);

            reg.addEventListener('updatefound', function() {
                var newWorker = reg.installing;
                newWorker.addEventListener('statechange', function() {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[SW-Reg] New version available');
                        newWorker.postMessage('SKIP_WAITING');
                        showUpdateBar();
                    }
                });
            });

            navigator.serviceWorker.addEventListener('message', function(event) {
                if (event.data === 'RELOAD_PAGE') {
                    window.location.reload();
                }
            });

            setInterval(function() { reg.update(); }, 5 * 60 * 1000);
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) reg.update();
            });
        })
        .catch(function(err) {
            console.log('[SW-Reg] Registration failed:', err);
        });

    navigator.serviceWorker.addEventListener('controllerchange', function() {
        console.log('[SW-Reg] New controller activated');
    });

    function showUpdateBar() {
        var bar = document.createElement('div');
        bar.id = 'sw-update-bar';
        bar.innerHTML = '<span>Nueva version disponible</span> <button id="sw-update-btn">Actualizar ahora</button>';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#ff6f00;color:#fff;padding:8px 16px;text-align:center;font-size:13px;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:12px;';
        document.body.appendChild(bar);

        document.getElementById('sw-update-btn').addEventListener('click', function() {
            window.location.reload(true);
        });

        setTimeout(function() {
            window.location.reload(true);
        }, 10000);
    }
})();
