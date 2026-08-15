// sw-register.js v2 - Registro de Service Worker ESTABLE que preserva push
//
// PROBLEMA QUE CORRIGE (v1): la version se generaba por MINUTO
// (YYYYMMDDHHMM) y, al cambiar, se hacia unregister() de TODOS los SW +
// borrado total + reload. unregister() DESTRUYE la suscripcion push del
// dispositivo (esta ligada a la registration), asi que las notificaciones
// se "desactivaban solas" cada minuto.
//
// NUEVO DISENO:
// - La URL del SW es ESTABLE (sin ?bust por minuto). Las actualizaciones
//   del propio SW se obtienen con reg.update() + updateViaCache:'none'.
// - La version de la app se lee del archivo VERSION (solo cambia en
//   deploys reales), con fetch no-store.
// - Cuando cambia la version: NO se desregistra NADA. Se pide al SW que
//   limpie sus caches (CLEAR_ALL_CACHES), se fuerza update() y se hace UN
//   solo reload (con guarda anti-bucle).
// - La suscripcion push sobrevive a todo este flujo.

(function() {
    'use strict';

    if (!('serviceWorker' in navigator)) return;

    var LS_VERSION = 'ah_app_version';
    var LS_RELOAD_GUARD = 'ah_last_reload_ts';
    var BASE = window.__AH_BASE_PATH || '/';

    // Guarda anti-bucle de reloads: maximo 1 reload forzado por minuto.
    function guardedReload() {
        try {
            var last = parseInt(localStorage.getItem(LS_RELOAD_GUARD) || '0');
            if (Date.now() - last < 60000) {
                console.log('[SW-Reg] Reload omitido (guarda anti-bucle)');
                return;
            }
            localStorage.setItem(LS_RELOAD_GUARD, String(Date.now()));
        } catch (e) { /* storage no disponible: no recargar */ return; }
        window.location.reload(true);
    }

    // URL ESTABLE del SW: sin cache-buster por minuto. updateViaCache:'none'
    // hace que el navegador pida el script del SW fresco en cada update().
    var swUrl = BASE + 'service-worker.js';

    navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
        .then(function(reg) {
            console.log('[SW-Reg] Registered:', reg.scope);

            // Nuevo SW instalado -> activarlo ya; al tomar control, un solo reload.
            reg.addEventListener('updatefound', function() {
                var newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', function() {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[SW-Reg] Nueva version del SW, activando...');
                        newWorker.postMessage('SKIP_WAITING');
                    }
                });
            });

            navigator.serviceWorker.addEventListener('controllerchange', function() {
                console.log('[SW-Reg] Nuevo SW al mando');
                guardedReload();
            });

            // Buscar actualizaciones del SW periodicamente (sin desregistrar).
            setInterval(function() { reg.update(); }, 5 * 60 * 1000);
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) reg.update();
            });

            // Deteccion de deploy real via archivo VERSION (no-store).
            return fetch(BASE + 'VERSION', { cache: 'no-store' })
                .then(function(res) { return res.ok ? res.text() : null; })
                .then(function(txt) {
                    if (!txt) return; // fallo de red: no hacer nada (seguro)
                    var version = txt.trim();
                    var stored = null;
                    try { stored = localStorage.getItem(LS_VERSION); } catch (e) {}
                    if (stored && stored !== version) {
                        console.log('[SW-Reg] Deploy nuevo:', stored, '->', version);
                        try { localStorage.setItem(LS_VERSION, version); } catch (e) {}
                        // Limpiar caches del SW activo (NO desregistrar).
                        if (navigator.serviceWorker.controller) {
                            try {
                                navigator.serviceWorker.controller.postMessage('CLEAR_ALL_CACHES');
                            } catch (e) { /* noop */ }
                        }
                        reg.update().finally(function() { guardedReload(); });
                    } else {
                        try { localStorage.setItem(LS_VERSION, version); } catch (e) {}
                    }
                });
        })
        .catch(function(err) {
            console.log('[SW-Reg] Registration failed:', err);
        });
})();
