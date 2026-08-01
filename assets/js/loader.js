/**
 * loader.js - Carga centralizada de scripts para Alliance Hub
 *
 * Centraliza la carga de todos los scripts core en el orden correcto,
 * usando el cache-buster automatico (AHBuster).
 *
 * Elimina las 8-12 etiquetas <script> duplicadas en cada HTML.
 *
 * FIX (chat consolidado): el rol 'chat' ahora carga SCRIPTS.core igual que
 * el resto de roles (antes lo omitia, dejando window.supabase undefined y
 * rompiendo el chat). Se elimina el shim assets/js/auth.js (document.write,
 * deprecated) y se carga el modulo de canales assets/js/chat-channels.js.
 */
(function() {
    'use strict';

    var ROLE = (function() {
        var el = document.querySelector('script[data-role]');
        return el ? el.getAttribute('data-role') : 'public';
    })();

    // Conjuntos de scripts por rol. Orden de carga = orden del array.
    // 'core' se carga SIEMPRE primero (supabase, config, base, auth, etc).
    var SCRIPTS = {
        core: [
            'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
            'assets/js/config.js',
            'assets/js/db-schema.js',
            'assets/js/modules/sanctions.js',
            'assets/js/base.js',
            'assets/js/ranking-utils.js',
            'assets/js/ranking-score.js',
            'assets/js/roles-data.js',
            'assets/js/auth-core.js',
            'assets/js/push-manager.js'
        ],
        public: [
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/nav-engine.js'
        ],
        admin: [
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/admin.js'
        ],
        player: [
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/player.js'
        ],
        chat: [
            'assets/js/config.js',
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/chat.js',
            'assets/js/chat-channels.js'
        ]
    };

    function loadSequential(list, onEach) {
        var i = 0;
        return new Promise(function(resolve, reject) {
            function next() {
                if (i >= list.length) { resolve(); return; }
                var src = list[i++];
                var url = src;
                // Cache-buster automatico para scripts locales (no CDN)
                if (src.indexOf('http') !== 0 && window.AHBuster) {
                    url = window.AHBuster.url(src);
                }
                var s = document.createElement('script');
                s.src = url;
                s.onload = function() { if (onEach) onEach(src); next(); };
                s.onerror = function() { reject(new Error('Error cargando: ' + src)); };
                document.head.appendChild(s);
            }
            next();
        });
    }

    async function init() {
        try {
            var core = SCRIPTS.core.slice();
            var role = SCRIPTS[ROLE] ? SCRIPTS[ROLE].slice() : [];

            // chat: carga core COMPLETO igual que los demas roles (fix: antes
            // lo omitia y dejaba window.supabase undefined). Su lista propia
            // solo contiene scripts especificos de chat (sin config duplicado).
            if (ROLE === 'chat') {
                role = SCRIPTS.chat.filter(function(s) { return core.indexOf(s) === -1; });
            }

            await loadSequential(core.concat(role));
            window.AHLoader = window.AHLoader || {};
            window.AHLoader.ready = true;
            window.dispatchEvent(new CustomEvent('ah:scripts-loaded', { detail: { role: ROLE } }));
        } catch (e) {
            console.error('[Loader]', e);
            window.AHLoader = window.AHLoader || {};
            window.AHLoader.error = e;
        }
    }

    // API publica minima
    window.AHLoader = {
        role: ROLE,
        ready: false,
        error: null,
        // Utilidad para scripts que necesitan esperar a que todo este cargado
        onReady: function(callback) {
            if (window.AHLoader.ready) {
                callback();
            } else {
                window.addEventListener('ah:scripts-loaded', function() { callback(); }, { once: true });
            }
        },
        // Ejecuta callback cuando el DOM esta listo (o inmediatamente si ya lo esta)
        onDomReady: function(callback) {
            function run() {
                if (window.AHLoader._domReadyFired) return;
                window.AHLoader._domReadyFired = true;
                try {
                    callback();
                } catch (e) {
                    console.error('[Loader] Error en onDomReady callback:', e);
                }
            }
            if (document.readyState === 'interactive' || document.readyState === 'complete') {
                run();
            } else {
                document.addEventListener('DOMContentLoaded', run);
            }
            window.addEventListener('ah:dom-ready', run);
            window.addEventListener('ah:loaded', run);
        }
    };
})();
