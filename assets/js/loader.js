/**
 * loader.js - Carga centralizada de scripts para Alliance Hub
 *
 * Centraliza la carga de todos los scripts core en el orden correcto,
 * usando el cache-buster automatico (AHBuster).
 *
 * Elimina las 8-12 etiquetas <script> duplicadas en cada HTML.
 */
(function() {
    'use strict';

    var path = window.location.pathname;
    var isAdmin = path.indexOf('/admin/') !== -1;
    var isRegister = path.indexOf('/register/') !== -1;
    var BASE = isAdmin || isRegister ? '../' : '';

    // Orden de carga de scripts (dependencias primero)
    // HOTFIX: Agregado db-schema.js a core. Sin esto, window.DB es undefined
    // y todas las paginas que usan DB.tableCols() / DB.from() crashean.
    var SCRIPTS = {
        core: [
            'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
            'assets/js/config.js',
            'assets/js/db-schema.js',
            'assets/js/base.js',
            'assets/js/roles-data.js',
            'assets/js/auth-core.js'
        ],
        public: [
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/nav-engine.js',
            'assets/js/training.js',
            'assets/js/components.js'
        ],
        admin: [
            'assets/js/components.js',
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/nav-engine.js',
            'assets/js/training.js'
        ],
        player: [
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/nav-engine.js',
            'assets/js/training.js',
            'assets/js/components.js',
            'assets/js/pwa-utils.js'
        ],
        chat: [
            'assets/js/auth.js',
            'assets/js/base.js'
        ]
    };

    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.onload = function() { resolve(src); };
            script.onerror = function() {
                console.warn('[AHLoader] Fallo al cargar:', src);
                reject(src);
            };
            document.head.appendChild(script);
        });
    }

    async function loadScripts(urls) {
        for (var i = 0; i < urls.length; i++) {
            var url = urls[i];
            if (url.indexOf('://') === -1 && url.indexOf('//') !== 0) {
                url = BASE + url;
            }
            if (window.AHBuster) {
                url = window.AHBuster.url(url);
            }
            try {
                await loadScript(url);
            } catch(e) {
                console.warn('[AHLoader] Script no critico fallo:', urls[i]);
            }
        }
    }

    window.AHLoader = {
        init: async function(opts) {
            opts = opts || {};
            var role = opts.role || 'public';
            var pageScript = opts.pageScript || null;
            var extraScripts = opts.extraScripts || [];

            console.log('[AHLoader] Iniciando carga para rol:', role);

            if (role !== 'chat') {
                await loadScripts(SCRIPTS.core);
            }

            var roleScripts = SCRIPTS[role] || SCRIPTS.public;
            await loadScripts(roleScripts);

            if (extraScripts.length > 0) {
                await loadScripts(extraScripts);
            }

            if (pageScript) {
                var pageUrl = BASE + pageScript;
                if (window.AHBuster) {
                    pageUrl = window.AHBuster.url(pageUrl);
                }
                await loadScript(pageUrl);
            }

            console.log('[AHLoader] Carga completada para:', role);
            window.dispatchEvent(new CustomEvent('ah:loaded', { detail: { role: role } }));

            // FIX: Si el DOM ya estaba listo antes de que los scripts dinamicos
            // terminaran de cargar, DOMContentLoaded no se dispara para ellos.
            // Emitimos un evento explicito para que page scripts y nav-engine
            // puedan inicializarse de forma robusta.
            if (document.readyState === 'interactive' || document.readyState === 'complete') {
                console.log('[AHLoader] DOM ya estaba listo; disparando ah:dom-ready');
                window.dispatchEvent(new CustomEvent('ah:dom-ready', { detail: { role: role } }));
            }
        },

        load: function(src) {
            var url = BASE + src;
            if (window.AHBuster) {
                url = window.AHBuster.url(url);
            }
            return loadScript(url);
        }
    };
})();
