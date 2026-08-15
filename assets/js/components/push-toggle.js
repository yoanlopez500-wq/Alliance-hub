/**
 * assets/js/components/push-toggle.js - UI de notificaciones push
 *
 * Expone window.AHPushUI:
 * - autoMount(opts): banner flotante inferior para activar notificaciones.
 * - mountSwitch(container): tarjeta con switch ON/OFF para ajustes.
 *
 * Estilo del repo: IIFE, globals window.*, sin dependencias, defensivo
 * (try/catch por todas partes: NUNCA rompe la pagina).
 */
(function() {
    'use strict';

    var DISMISS_KEY = 'ah_push_banner_dismissed';
    var DISMISS_DAYS = 7;
    var BANNER_ID = 'ah-push-banner';

    /**
     * Jugador actual para suscripcion push: { id, current_alliance_id }.
     * Usa window.getPlayerData() de base.js ({playerId, displayName, token}
     * o null). Si hay sesion, intenta leer current_alliance_id de la tabla
     * players; si falla, devuelve el id con current_alliance_id null.
     */
    async function getPlayer() {
        try {
            if (typeof window.getPlayerData !== 'function') return null;
            var pd = window.getPlayerData();
            if (!pd || !pd.playerId) return null;
            var playerId = parseInt(pd.playerId);
            try {
                var res = await window.supabase
                    .from('players')
                    .select('id, current_alliance_id')
                    .eq('id', playerId)
                    .maybeSingle();
                if (res && res.data) {
                    return { id: playerId, current_alliance_id: res.data.current_alliance_id || null };
                }
            } catch (eFetch) {
                console.warn('[AHPushUI] No se pudo leer current_alliance_id:', eFetch);
            }
            return { id: playerId, current_alliance_id: null };
        } catch (e) {
            console.warn('[AHPushUI] getPlayer() fallo:', e);
            return null;
        }
    }

    /**
     * true si el banner se descarto hace menos de DISMISS_DAYS dias.
     */
    function dismissedRecently() {
        try {
            var ts = parseInt(localStorage.getItem(DISMISS_KEY) || '0');
            if (!ts) return false;
            return (Date.now() - ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
        } catch (e) {
            return false;
        }
    }

    function toast(msg, type) {
        try {
            if (typeof window.showToast === 'function') window.showToast(msg, type);
        } catch (e) { /* noop */ }
    }

    function hideBanner() {
        var el = document.getElementById(BANNER_ID);
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    /**
     * Pregunta al SW (via MessageChannel) cual fue el ultimo push recibido.
     * Devuelve { at, title } o null. Diagnostico de entrega.
     */
    function getLastPushFromSW() {
        return new Promise(function(resolve) {
            try {
                if (!('serviceWorker' in navigator)) { resolve(null); return; }
                Promise.race([
                    navigator.serviceWorker.ready,
                    new Promise(function(_, rej) { setTimeout(function() { rej(new Error('t')); }, 3000); })
                ]).then(function(reg) {
                    var worker = reg.active;
                    if (!worker) { resolve(null); return; }
                    var chan = new MessageChannel();
                    var done = false;
                    chan.port1.onmessage = function(e) { done = true; resolve(e.data || null); };
                    setTimeout(function() { if (!done) resolve(null); }, 2000);
                    worker.postMessage('GET_LAST_PUSH', [chan.port2]);
                }).catch(function() { resolve(null); });
            } catch (e) { resolve(null); }
        });
    }

    /**
     * Notificacion LOCAL de prueba: se muestra desde el SW registration sin
     * pasar por ningun servidor. Prueba si el dispositivo puede MOSTRAR
     * notificaciones de esta app (aisla pantalla vs entrega).
     */
    async function testLocalNotification() {
        try {
            if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return false;
            var reg = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise(function(_, rej) { setTimeout(function() { rej(new Error('t')); }, 3000); })
            ]);
            await reg.showNotification('Prueba local Alliance Hub', {
                body: 'Si ves esto, tu telefono SI muestra notificaciones de la app.',
                tag: 'ah-local-test'
            });
            return true;
        } catch (e) {
            console.warn('[AHPushUI] Prueba local fallo:', e);
            return false;
        }
    }

    /**
     * Banner flotante inferior para activar notificaciones push.
     * No muestra nada si: no hay soporte, no hay sesion de jugador, el
     * permiso esta denegado (salvo force), ya esta suscrito, o se descarto
     * hace menos de 7 dias (salvo force).
     *
     * @param {Object} [opts] - { force: true } para mostrarlo siempre que
     *        haya soporte y sesion (p.ej. tras registrarse a una partida).
     */
    async function autoMount(opts) {
        try {
            opts = opts || {};
            if (!window.AHPush || !window.AHPush.isSupported()) return;
            if (typeof window.getPlayerData !== 'function' || !window.getPlayerData()) return;

            // AUTO-REPARACION: si el permiso esta concedido pero la
            // suscripcion se perdio (p.ej. por el viejo sw-register que
            // desregistraba el SW cada minuto, destruyendo la suscripcion),
            // re-suscribir en silencio. No pide permiso: ya esta concedido.
            if (window.AHPush.getPermission() === 'granted' && !(await window.AHPush.isSubscribed())) {
                var healed = await window.AHPush.ensureSubscribed(await getPlayer());
                if (healed) {
                    console.log('[AHPushUI] Suscripcion push auto-reparada');
                    return;
                }
            }

            if (!opts.force) {
                if (window.AHPush.getPermission() === 'denied') return;
                if (await window.AHPush.isSubscribed()) return;
                if (dismissedRecently()) return;
            } else {
                if (window.AHPush.getPermission() === 'granted' && await window.AHPush.isSubscribed()) return;
            }
            if (document.getElementById(BANNER_ID)) return;

            var banner = document.createElement('div');
            banner.id = BANNER_ID;
            banner.className = 'fixed bottom-4 left-1/2 z-[9999] w-[92%] max-w-md';
            banner.style.transform = 'translateX(-50%)';
            banner.innerHTML =
                '<div class="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-4 flex flex-col gap-3">' +
                    '<p class="text-sm text-slate-200">\u{1F514} Activa las notificaciones para enterarte de nuevas partidas y cambios de estado</p>' +
                    '<div class="flex gap-2">' +
                        '<button id="ah-push-banner-yes" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2 px-4 rounded-lg text-sm">Activar</button>' +
                        '<button id="ah-push-banner-no" class="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-2 px-4 rounded-lg text-sm">Ahora no</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(banner);

            document.getElementById('ah-push-banner-yes').addEventListener('click', async function() {
                // Click real del usuario: aqui SI se puede pedir permiso.
                var btn = document.getElementById('ah-push-banner-yes');
                btn.disabled = true;
                btn.textContent = 'Activando...';
                try {
                    var player = await getPlayer();
                    var ok = await window.AHPush.subscribe(player);
                    if (ok) {
                        toast('Notificaciones activadas', 'success');
                        hideBanner();
                        return;
                    }
                    toast('No se pudieron activar las notificaciones', 'error');
                } catch (eSub) {
                    console.warn('[AHPushUI] Activacion fallo:', eSub);
                    toast('No se pudieron activar las notificaciones', 'error');
                }
                btn.disabled = false;
                btn.textContent = 'Activar';
            });

            document.getElementById('ah-push-banner-no').addEventListener('click', function() {
                try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (eLs) { /* noop */ }
                hideBanner();
            });
        } catch (e) {
            console.warn('[AHPushUI] autoMount() fallo (no critico):', e);
        }
    }

    /**
     * Tarjeta de ajustes con switch ON/OFF que refleja el estado real.
     * @param {HTMLElement} container - donde montar la tarjeta.
     */
    async function mountSwitch(container) {
        if (!container) return;
        try {
            var html =
                '<div class="bg-slate-800 border border-slate-700 rounded-xl p-4">' +
                    '<div class="flex items-center justify-between gap-4">' +
                        '<div>' +
                            '<h3 class="font-bold text-slate-100">Notificaciones push</h3>' +
                            '<p id="ah-push-switch-note" class="text-xs text-slate-400 mt-1"></p>' +
                        '</div>' +
                        '<label class="relative inline-flex items-center cursor-pointer">' +
                            '<input type="checkbox" id="ah-push-switch" class="sr-only peer">' +
                            '<div class="w-11 h-6 bg-slate-600 rounded-full peer peer-checked:bg-emerald-500 peer-disabled:opacity-40 peer-disabled:cursor-not-allowed after:content-[\'\'] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>' +
                        '</label>' +
                    '</div>' +
                    '<div class="mt-3 pt-3 border-t border-slate-700 flex flex-col gap-2">' +
                        '<button id="ah-push-local-test" class="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold py-1.5 px-3 rounded-lg text-xs">Probar notificacion local</button>' +
                        '<p id="ah-push-last" class="text-[11px] text-slate-500">Ultimo push recibido por el SW: —</p>' +
                    '</div>' +
                '</div>';
            container.innerHTML = html;

            // Diagnostico: ultimo push que llego al SW de este dispositivo
            getLastPushFromSW().then(function(v) {
                var el = container.querySelector('#ah-push-last');
                if (!el) return;
                if (v && v.at) {
                    el.textContent = 'Ultimo push recibido por el SW: ' + new Date(v.at).toLocaleString() + ' — "' + (v.title || '') + '"';
                }
            });

            var btnLocal = container.querySelector('#ah-push-local-test');
            if (btnLocal) {
                btnLocal.addEventListener('click', async function() {
                    btnLocal.disabled = true;
                    var ok = await testLocalNotification();
                    toast(ok ? 'Si no aparecio nada, el problema es de permisos del sistema (app PWA)' : 'No se pudo mostrar la prueba local', ok ? 'info' : 'error');
                    btnLocal.disabled = false;
                });
            }

            var sw = container.querySelector('#ah-push-switch');
            var note = container.querySelector('#ah-push-switch-note');

            // Estado real
            var state = await window.AHPush.getState();
            var hasSession = typeof window.getPlayerData === 'function' && !!window.getPlayerData();

            if (!state.supported) {
                sw.disabled = true;
                note.textContent = 'Tu navegador no soporta notificaciones push. En iPhone: instala la app (A\u00F1adir a pantalla de inicio).';
                return;
            }
            if (state.permission === 'denied') {
                sw.disabled = true;
                note.textContent = 'Has bloqueado las notificaciones en el navegador. Act\u00EDvalas en el candado de la barra de direcciones.';
                return;
            }
            if (!hasSession) {
                sw.disabled = true;
                note.textContent = 'Inicia sesi\u00F3n como jugador para activar notificaciones.';
                return;
            }

            sw.checked = state.permission === 'granted' && state.subscribed;
            note.textContent = sw.checked ? 'Activadas en este dispositivo' : 'Desactivadas en este dispositivo';

            sw.addEventListener('change', async function() {
                var prev = !sw.checked;
                sw.disabled = true;
                try {
                    if (sw.checked) {
                        // Toggle ON desde click: gesto de usuario valido
                        var player = await getPlayer();
                        var ok = await window.AHPush.subscribe(player);
                        if (ok) {
                            toast('Notificaciones activadas', 'success');
                            note.textContent = 'Activadas en este dispositivo';
                        } else {
                            sw.checked = prev;
                            toast('No se pudieron activar las notificaciones', 'error');
                        }
                    } else {
                        var okOff = await window.AHPush.unsubscribe();
                        if (okOff) {
                            toast('Notificaciones desactivadas', 'success');
                            note.textContent = 'Desactivadas en este dispositivo';
                        } else {
                            sw.checked = prev;
                            toast('No se pudieron desactivar las notificaciones', 'error');
                        }
                    }
                } catch (eTog) {
                    console.warn('[AHPushUI] Toggle fallo:', eTog);
                    sw.checked = prev;
                    toast('Error al cambiar las notificaciones', 'error');
                }
                sw.disabled = false;
            });
        } catch (e) {
            console.warn('[AHPushUI] mountSwitch() fallo (no critico):', e);
            try { container.innerHTML = ''; } catch (e2) { /* noop */ }
        }
    }

    window.AHPushUI = {
        getPlayer: getPlayer,
        autoMount: autoMount,
        mountSwitch: mountSwitch
    };
})();
