/**
 * cache-buster.js - Sistema de cache-busting automatico para Alliance Hub
 *
 * Genera un hash unico por deploy usando la fecha actual (YYYY-MM-DD).
 * Todos los scripts y estilos usan este hash para invalidar cache automaticamente.
 *
 * Uso: window.AHBuster.url('assets/js/base.js') → "assets/js/base.js?h=20260714"
 */
(function() {
    'use strict';

    // Build ID: fecha actual en formato YYYYMMDD
    var now = new Date();
    var BUILD_ID = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('');

    // Almacenar en localStorage para detectar cambios de version
    // FIX: try/catch para modo privado/incognito donde localStorage puede fallar
    var PREVIOUS_BUILD = null;
    try {
        var LS_KEY = 'ah_build_id';
        PREVIOUS_BUILD = localStorage.getItem(LS_KEY);
        localStorage.setItem(LS_KEY, BUILD_ID);

        // Si cambio el build ID, limpiar caches de Service Worker
        if (PREVIOUS_BUILD && PREVIOUS_BUILD !== BUILD_ID) {
            console.log('[CacheBuster] Nuevo deploy detectado:', PREVIOUS_BUILD, '→', BUILD_ID);
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
            }
        }
    } catch(e) {
        console.warn('[CacheBuster] localStorage no disponible (modo privado?):', e.message);
    }

    // API publica
    window.AHBuster = {
        url: function(path) {
            if (!path) return '';
            // No agregar hash a URLs externas (CDN, etc.)
            if (path.indexOf('://') !== -1 || path.indexOf('//') === 0) {
                return path;
            }
            // Limpiar cache-busting anterior (?v=XX, ?h=XX)
            var cleanPath = path.replace(/\?[vh]=[^&]*/, '');
            return cleanPath + '?h=' + BUILD_ID;
        },

        hash: function() {
            return BUILD_ID;
        },

        hasUpdate: function() {
            return PREVIOUS_BUILD && PREVIOUS_BUILD !== BUILD_ID;
        },

        forceReload: function() {
            try { localStorage.setItem('ah_build_id', BUILD_ID); } catch(e) {}
            window.location.reload(true);
        }
    };

    console.log('[CacheBuster] Build ID:', BUILD_ID);
})();
