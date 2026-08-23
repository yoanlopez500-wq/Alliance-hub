/**
 * login-player.js - Logica de login para jugadores
 *
 * Migrado desde login-player.html como parte de la refactorizacion.
 */
(function() {
    'use strict';

    var initialized = false;

    function init() {
        if (initialized) return;
        initialized = true;

        // Manejar parametro ?redirect= de la URL
        (function() {
            var urlParams = new URLSearchParams(window.location.search);
            var redirect = urlParams.get('redirect');
            if (redirect) {
                localStorage.setItem('ah_redirect_after_login', redirect);
            } else {
                localStorage.removeItem('ah_redirect_after_login');
            }
        })();

        if (typeof window.savePlayerSession !== 'function') {
            window.savePlayerSession = async function(playerId, displayName) {
                try {
                    // HOTFIX seguridad: pedir token al servidor (RPC player_login).
                    var token = null;
                    try {
                        var r = await window.supabase.rpc('player_login', { p_player_id: parseInt(playerId), p_display_name: displayName || '' });
                        if (!r.error && r.data) token = r.data;
                    } catch(eRpc) { console.warn('player_login RPC fallo:', eRpc); }
                    if (!token) {
                        // Sin token del servidor NO hay sesion valida: abortar en vez de
                        // crear un token local que el servidor rechazaria despues.
                        console.error('player_login no devolvio token');
                        return false;
                    }
                    localStorage.setItem('ah_v2_player_id', String(playerId));
                    localStorage.setItem('ah_v2_player_token', token);
                    localStorage.setItem('ah_v2_player_name', displayName || '');
                    return true;
                } catch(e) { console.error('savePlayerSession guard error:', e); return false; }
            };
        }

        // ---- Cuentas recordadas ("Continuar como...") ----
        function esc(s) {
            return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
        function getQuickPlayers() {
            try {
                var list = JSON.parse(localStorage.getItem('ah_quick_players') || '[]');
                return Array.isArray(list) ? list : [];
            } catch(e) { return []; }
        }
        function rememberQuickPlayer(pid, name) {
            try {
                var list = getQuickPlayers().filter(function(p) { return String(p.id) !== String(pid); });
                list.unshift({ id: String(pid), name: name });
                localStorage.setItem('ah_quick_players', JSON.stringify(list.slice(0, 3)));
            } catch(e) { console.warn('rememberQuickPlayer fallo:', e); }
        }
        window.forgetQuickPlayer = function(pid, ev) {
            if (ev) { ev.stopPropagation(); ev.preventDefault(); }
            var list = getQuickPlayers().filter(function(p) { return String(p.id) !== String(pid); });
            try { localStorage.setItem('ah_quick_players', JSON.stringify(list)); } catch(e) {}
            renderQuickLogin();
        };
        function renderQuickLogin() {
            var box = document.getElementById('quick-login');
            if (!box) return;
            var list = getQuickPlayers();
            if (!list.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
            var html = '<p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Continuar como...</p>';
            list.forEach(function(p) {
                var initial = esc((p.name || '?').charAt(0).toUpperCase());
                html += '<button type="button" onclick="doQuickLogin(\'' + esc(p.id) + '\')" class="w-full flex items-center gap-3 p-3 mb-2 rounded-lg border border-amber-500/40 bg-amber-50 hover:bg-amber-100 active:scale-[0.98] transition text-left">'
                    + '<span class="w-10 h-10 shrink-0 rounded-full bg-amber-500 text-slate-900 font-bold flex items-center justify-center text-lg">' + initial + '</span>'
                    + '<span class="flex-1 min-w-0">'
                    + '<span class="block font-bold text-slate-800 text-sm truncate">' + esc(p.name) + '</span>'
                    + '<span class="block text-xs text-slate-500">ID ' + esc(p.id) + ' &middot; toca para entrar</span>'
                    + '</span>'
                    + '<span role="button" tabindex="0" onclick="forgetQuickPlayer(\'' + esc(p.id) + '\', event)" class="text-slate-400 hover:text-red-500 px-2 py-1 text-sm" title="Olvidar esta cuenta">&#10005;</span>'
                    + '</button>';
            });
            html += '<div class="flex items-center gap-2 my-4"><div class="flex-1 border-t border-slate-200"></div><span class="text-xs text-slate-400">o entra con ID y username</span><div class="flex-1 border-t border-slate-200"></div></div>';
            box.innerHTML = html;
            box.classList.remove('hidden');
        }
        renderQuickLogin();

        async function performLogin(pid, name) {
            var result = document.getElementById('login-result');
            var msg = document.getElementById('login-message');
            result.classList.remove('hidden');
            msg.textContent = 'Verificando...';
            msg.className = 'text-sm text-slate-500';
            try {
                var { data: player, error } = await window.supabase.from('players').select('id, current_username, status, banned_until, suspended_until, suspension_reason, current_alliance_id').eq('id', parseInt(pid)).single();
                if (error && error.code !== 'PGRST116') { msg.textContent = 'Error: ' + error.message; msg.className = 'text-sm text-red-600'; return; }
                if (player) {
                    await checkAndClearExpiredBan(parseInt(pid));
                    // Re-fetch after cleanup
                    var { data: refreshed } = await window.supabase.from('players').select('id, current_username, status, banned_until, suspended_until, suspension_reason, current_alliance_id').eq('id', parseInt(pid)).single();
                    player = refreshed;
                    if (isPlayerBanned(player)) {
                        msg.innerHTML = '\u2716 Cuenta restringida.<br><strong>' + getBanRemainingText(player) + '</strong>' + (player.suspension_reason ? '<br>' + player.suspension_reason : '');
                        msg.className = 'text-sm text-red-600 font-bold';
                        return;
                    }
                }
                if (!player) {
                    var { error: insertErr } = await window.supabase.from('players').insert({ id: parseInt(pid), current_username: name, status: 'active', last_seen: new Date().toISOString() });
                    if (insertErr) { msg.textContent = 'Error creando jugador: ' + insertErr.message; msg.className = 'text-sm text-red-600'; return; }
                } else {
                    await window.supabase.from('players').update({ last_seen: new Date().toISOString() }).eq('id', parseInt(pid));
                }
                var ok = await window.savePlayerSession(pid, name);
                if (!ok) { msg.textContent = 'Error guardando sesion'; msg.className = 'text-sm text-red-600'; return; }
                rememberQuickPlayer(pid, name);
                msg.textContent = 'Bienvenido, ' + name + '!';
                msg.className = 'text-sm text-green-600 font-bold';

                // Hook push silencioso: re-suscribe solo si el permiso ya
                // estaba concedido (nunca pide permiso ni bloquea el flujo).
                // player puede ser null si el jugador se acaba de crear.
                try {
                    if (window.AHPush) window.AHPush.ensureSubscribed(player || { id: parseInt(pid), current_alliance_id: null });
                } catch (ePush) { console.warn('[Login] Hook push fallo (no critico):', ePush); }

                // REDIRECT: Despues de login exitoso, verificar si hay URL guardada
                setTimeout(function() {
                    var redirectUrl = localStorage.getItem('ah_redirect_after_login');
                    if (redirectUrl) {
                        localStorage.removeItem('ah_redirect_after_login');
                        window.location.href = redirectUrl;
                    } else {
                        window.location.href = 'index.html';
                    }
                }, 800);
            } catch(e) { msg.textContent = 'Error: ' + e.message; msg.className = 'text-sm text-red-600'; }
        }

        window.doLogin = function() {
            var pid = document.getElementById('player-id').value.trim();
            var name = document.getElementById('player-name').value.trim();
            if (!pid || !name) { showToast('ID y username son requeridos', 'error'); return; }
            performLogin(pid, name);
        };

        window.doQuickLogin = function(pid) {
            var p = getQuickPlayers().find(function(x) { return String(x.id) === String(pid); });
            if (!p) { renderQuickLogin(); return; }
            // Rellenar el formulario (transparencia) y lanzar el login directo
            var idInput = document.getElementById('player-id');
            var nameInput = document.getElementById('player-name');
            if (idInput) idInput.value = p.id;
            if (nameInput) nameInput.value = p.name;
            performLogin(String(p.id), p.name);
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('ah:dom-ready', init);
    window.addEventListener('ah:loaded', init);
})();
