/**
 * theme.js - Theme toggle para Alliance Hub
 *
 * Simplificado: solo maneja la clase .dark en <html>.
 * Todos los estilos CSS ahora viven en assets/css/theme.css
 * (antes inyectaba CSS dinamicamente, lo que causaba duplicacion con Tailwind)
 */
(function() {
    'use strict';

    // Aplicar tema guardado o preferencia del sistema
    var saved = localStorage.getItem('ah_theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    // Toggle global
    window.toggleTheme = function() {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('ah_theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    };
})();
