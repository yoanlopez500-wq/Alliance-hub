// assets/js/auth.js v6.0 - COMPATIBILITY SHIM
// DEPRECATED: Este archivo existe solo para backwards compatibilidad.
// Los modulos reales estan en: auth-core.js, nav-engine.js, roles-data.js,
// notifications.js, messaging.js, training.js
//
// Para nuevas paginas, usa los scripts modulares en lugar de auth.js:
//   <script src="assets/js/roles-data.js?v=18"></script>
//   <script src="assets/js/auth-core.js?v=18"></script>
//   <script src="assets/js/messaging.js?v=18"></script>
//   <script src="assets/js/notifications.js?v=18"></script>
//   <script src="assets/js/nav-engine.js?v=18"></script>
//   <script src="assets/js/training.js?v=18"></script>

(function() {
    var scripts = [
        'assets/js/roles-data.js',
        'assets/js/auth-core.js',
        'assets/js/messaging.js',
        'assets/js/notifications.js',
        'assets/js/nav-engine.js',
        'assets/js/training.js'
    ];
    var basePath = window.__AH_BASE_PATH || '/';
    if (!basePath.endsWith('/')) basePath += '/';

    // Detectar version de cache de los scripts ya cargados en la pagina
    var cacheVersion = '';
    var existingScripts = document.querySelectorAll('script[src*="?v="]');
    if (existingScripts.length > 0) {
        var match = existingScripts[0].src.match(/\?v=(\d+)/);
        if (match) cacheVersion = '?v=' + match[1];
    }

    scripts.forEach(function(src) {
        var fullPath = basePath + src + cacheVersion;
        var scriptName = src.replace('assets/js/', '');
        var existing = document.querySelector('script[src*="' + scriptName + '"]');
        if (!existing) {
            document.write('<script src="' + fullPath + '"><\/script>');
        }
    });
})();

// v6.0: onAuthStateChange se maneja en nav-engine.js ahora
// Este listener legacy se mantiene para paginas que no cargan nav-engine.js directamente
try {
    if (typeof supabase !== 'undefined' && supabase && supabase.auth) {
        supabase.auth.onAuthStateChange(function(event, session) {
            window.__ahNavRetryCount = 0;
            if (typeof initAdminNav === 'function') initAdminNav();
        });
    }
} catch(e) {
    console.warn('[Auth Shim] supabase no disponible aun');
}
