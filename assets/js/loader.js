// assets/js/loader.js - Cargador central de scripts con cache-buster automatico
// Todos los HTML cargan SOLO este script; el decide que modulos cargar segun la pagina.
// El cache-buster ?v= usa la version de APP_VERSION (config.js) + timestamp del build.
//
// USO en HTML: <script src="/assets/js/loader.js" data-page="home"></script>
// data-page indica el rol de la pagina: home | public | admin | player | chat
(function() {
    'use strict';

    var BUILD_TS = '20260731'; // actualizar al desplegar cambios en JS

    // Conjunto de scripts por rol de pagina. ORDEN IMPORTA (dependencias).
    var SCRIPTS = {
        // Nucleo: siempre se carga (todas las paginas lo necesitan)
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
            'assets/js/nav-engine.js',
            'assets/js/pages/rankings.js',
            'assets/js/pages/game.js',
            'assets/js/pages/games.js'
        ],
        admin: [
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/admin.js',
            'assets/js/modules/notifications-admin.js',
            'assets/js/modules/report-notes.js'
        ],
        player: [
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/nav-engine.js',
            'assets/js/player.js'
        ],
        chat: [
            'assets/js/messaging.js',
            'assets/js/notifications.js',
            'assets/js/chat.js'
        ]
    };

    // Mapa pagina -> rol. Las paginas pasan data-page con el nombre del HTML.
    var PAGE_ROLES = {
        'index': 'public',
        'rankings': 'public',
        'game': 'public',
        'games': 'public',
        'admin': 'admin',
        'player': 'player',
        'chat': 'chat'
    };

    function getVersion() {
        // Si config.js ya definio APP_VERSION, la usamos; si no, BUILD_TS.
        return (typeof window.APP_VERSION !== 'undefined') ? window.APP_VERSION : BUILD_TS;
    }

    function withBuster(src) {
        // Solo agregamos buster a scripts locales (no CDN).
        if (src.indexOf('http') === 0) return src;
        var sep = src.indexOf('?') >= 0 ? '&' : '?';
        return src + sep + 'v=' + getVersion();
    }

    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = withBuster(src);
            s.async = false; // respeta el orden de dependencias
            s.onload = function() { resolve(src); };
            s.onerror = function() { reject(new Error('No se pudo cargar ' + src)); };
            document.head.appendChild(s);
        });
    }

    async function boot() {
        var el = document.querySelector('script[data-page]');
        var page = el ? el.getAttribute('data-page') : 'index';
        var role = PAGE_ROLES[page] || 'public';

        var queue = SCRIPTS.core.concat(SCRIPTS[role] || []);
        try {
            for (var i = 0; i < queue.length; i++) {
                await loadScript(queue[i]);
            }
            // Senal global: todo el JS del rol ya esta disponible.
            window.dispatchEvent(new CustomEvent('ah:scripts-ready', { detail: { page: page, role: role } }));
        } catch (e) {
            console.error('[AHLoader]', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
