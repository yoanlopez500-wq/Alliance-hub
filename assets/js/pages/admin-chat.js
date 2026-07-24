/**
 * admin-chat.js - DEPRECADO
 *
 * La pagina admin/chat.html ahora redirige al chat consolidado (/chat.html),
 * por lo que esta implementacion divergente (canales hardcodeados
 * general/anuncios/soporte) ya no se usa. Se conserva este stub defensivo
 * por si algun enlace antiguo aun cargara el script directamente.
 */
(function() {
    'use strict';
    if (window.location.pathname.indexOf('/admin/chat') !== -1) {
        window.location.replace('../chat.html');
    }
})();
