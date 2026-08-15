/**
 * push-manager.js - Gestor de suscripciones Web Push (Alliance Hub)
 *
 * Expone window.AHPush. Modulo PASIVO: no ejecuta nada al cargarse
 * (cero side-effects); toda la logica se dispara via llamadas explicitas.
 *
 * Estilo del repo: IIFE, globals window.*, sin ES modules.
 *
 * Notas de seguridad/RLS:
 * - La tabla push_subscriptions permite INSERT y DELETE a anon, pero NO
 *   SELECT. Por eso el INSERT se hace SIN .select() (sin returning), que
 *   fallaria con la politica actual.
 * - Antes de insertar se hace un DELETE por endpoint para evitar
 *   duplicados al re-suscribir el mismo dispositivo.
 */
(function() {
    'use strict';

    var FLAG_KEY = 'ah_push_subscribed';

    /**
     * Convierte la clave publica VAPID (base64url) a Uint8Array,
     * formato requerido por applicationServerKey.
     */
    function urlB64ToUint8Array(base64) {
        var padding = '='.repeat((4 - base64.length % 4) % 4);
        var b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        var raw = window.atob(b64);
        var output = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) {
            output[i] = raw.charCodeAt(i);
        }
        return output;
    }

    /**
     * true si el navegador soporta Service Worker + Push + Notification.
     */
    function isSupported() {
        return 'serviceWorker' in navigator &&
               'PushManager' in window &&
               'Notification' in window;
    }

    /**
     * Estado actual del permiso de notificaciones ('default', 'granted',
     * 'denied') o 'unsupported' si el navegador no soporta push.
     */
    function getPermission() {
        if (!isSupported()) return 'unsupported';
        return Notification.permission;
    }

    /**
     * Suscribe el dispositivo actual a Web Push y persiste la suscripcion
     * en push_subscriptions.
     *
     * @param {Object} player - { id, current_alliance_id }
     * @returns {Promise<boolean>} true si quedo suscrito y persistido.
     * NUNCA lanza excepciones: cualquier fallo se loguea y devuelve false.
     */
    async function subscribe(player) {
        try {
            if (!isSupported()) {
                console.warn('[AHPush] Push no soportado en este navegador');
                return false;
            }
            if (!player || !player.id) {
                console.warn('[AHPush] subscribe() requiere un player con id');
                return false;
            }
            if (!window.VAPID_PUBLIC_KEY) {
                console.warn('[AHPush] VAPID_PUBLIC_KEY no disponible');
                return false;
            }

            // Pedir permiso solo si aun no se decidio; si esta denegado, salir.
            if (Notification.permission === 'default') {
                var perm = await Notification.requestPermission();
                if (perm !== 'granted') {
                    console.warn('[AHPush] Permiso de notificaciones no concedido:', perm);
                    return false;
                }
            } else if (Notification.permission !== 'granted') {
                return false;
            }

            // Timeout defensivo: en paginas sin SW registrado, .ready nunca resuelve
            var reg = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise(function(_, reject) {
                    setTimeout(function() { reject(new Error('sw-ready-timeout')); }, 5000);
                })
            ]);
            var sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8Array(window.VAPID_PUBLIC_KEY)
            });

            var json = sub.toJSON();
            if (!json || !json.endpoint || !json.keys) {
                console.warn('[AHPush] Suscripcion sin endpoint/keys');
                return false;
            }

            // Borrado previo por endpoint: evita duplicados al re-suscribir.
            // La RLS permite DELETE a anon.
            try {
                await window.supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint);
            } catch (eDel) {
                console.warn('[AHPush] Limpieza previa fallo (no critico):', eDel);
            }

            // INSERT SIN .select(): la RLS no da SELECT a anon y un insert
            // con returning fallaria.
            var { error } = await window.supabase.from('push_subscriptions').insert({
                endpoint: json.endpoint,
                p256dh: json.keys.p256dh,
                auth: json.keys.auth,
                player_id: player.id,
                alliance_id: player.current_alliance_id || null
            });
            if (error) {
                console.warn('[AHPush] Error guardando suscripcion:', error.message || error);
                return false;
            }

            try { localStorage.setItem(FLAG_KEY, '1'); } catch (eLs) { /* storage no disponible */ }
            return true;
        } catch (e) {
            console.warn('[AHPush] subscribe() fallo:', e);
            return false;
        }
    }

    /**
     * Da de baja la suscripcion actual. Intenta baja completa:
     * 1) Obtiene la suscripcion del navegador (serviceWorker.ready con
     *    timeout de 3s + getSubscription()).
     * 2) Si hay endpoint, borra en BD via RPC delete_push_subscription
     *    (el DELETE REST directo NO funciona por un bug de RLS; no usar
     *    .from('push_subscriptions').delete()).
     * 3) sub.unsubscribe() y limpieza del flag local.
     * Si algo falla, cae al fallback window.unsubscribeFromPush() de
     * pwa-utils.js si existe. NUNCA lanza excepciones.
     */
    async function unsubscribe() {
        try {
            if (!isSupported()) return false;
            var reg = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise(function(_, reject) {
                    setTimeout(function() { reject(new Error('sw-ready-timeout')); }, 3000);
                })
            ]);
            var sub = await reg.pushManager.getSubscription();
            var endpoint = sub && sub.endpoint ? sub.endpoint : null;
            if (endpoint) {
                try {
                    await window.supabase.rpc('delete_push_subscription', { p_endpoint: endpoint });
                } catch (eRpc) {
                    console.warn('[AHPush] RPC delete_push_subscription fallo (no critico):', eRpc);
                }
            }
            if (sub) await sub.unsubscribe();
            try { localStorage.removeItem(FLAG_KEY); } catch (eLs) { /* noop */ }
            return true;
        } catch (e) {
            console.warn('[AHPush] unsubscribe() baja completa fallo:', e);
            // Fallback: unsubscribeFromPush() de pwa-utils.js si existe
            try {
                if (typeof window.unsubscribeFromPush === 'function') {
                    var ok = await window.unsubscribeFromPush();
                    try { localStorage.removeItem(FLAG_KEY); } catch (eLs2) { /* noop */ }
                    return ok;
                }
            } catch (e2) {
                console.warn('[AHPush] unsubscribe() fallback tambien fallo:', e2);
            }
            return false;
        }
    }

    /**
     * true si el navegador tiene una suscripcion push activa.
     * Implementacion propia: serviceWorker.ready con timeout de 3s +
     * getSubscription(). Si falla, fallback a window.checkSubscription()
     * de pwa-utils.js si existe; en ultima instancia, false.
     */
    async function isSubscribed() {
        try {
            if (!isSupported()) return false;
            var reg = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise(function(_, reject) {
                    setTimeout(function() { reject(new Error('sw-ready-timeout')); }, 3000);
                })
            ]);
            var sub = await reg.pushManager.getSubscription();
            return !!sub;
        } catch (e) {
            console.warn('[AHPush] isSubscribed() check directo fallo:', e);
            try {
                if (typeof window.checkSubscription === 'function') {
                    return await window.checkSubscription();
                }
            } catch (e2) { /* noop */ }
            return false;
        }
    }

    /**
     * Estado consolidado de las notificaciones push.
     * @returns {Promise<Object>} { supported, permission, subscribed }
     */
    async function getState() {
        var supported = isSupported();
        return {
            supported: supported,
            permission: getPermission(),
            subscribed: supported ? await isSubscribed() : false
        };
    }

    /**
     * Re-suscripcion SILENCIOSA pensada para llamar tras login: nunca pide
     * permiso. Solo actua si el navegador soporta push y el permiso YA esta
     * concedido (p.ej. el usuario re-instalo o se limpio la BD).
     */
    async function ensureSubscribed(player) {
        try {
            if (!isSupported()) return false;
            if (Notification.permission !== 'granted') return false;
            return await subscribe(player);
        } catch (e) {
            console.warn('[AHPush] ensureSubscribed() fallo:', e);
            return false;
        }
    }

    window.AHPush = {
        isSupported: isSupported,
        getPermission: getPermission,
        urlB64ToUint8Array: urlB64ToUint8Array,
        subscribe: subscribe,
        unsubscribe: unsubscribe,
        isSubscribed: isSubscribed,
        ensureSubscribed: ensureSubscribed,
        getState: getState
    };
})();
