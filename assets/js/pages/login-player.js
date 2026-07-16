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
                    var token = 'ah_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
                    localStorage.setItem('ah_v2_player_id', String(playerId));
                    localStorage.setItem('ah_v2_player_token', token);
                    localStorage.setItem('ah_v2_player_name', displayName || '');
                    return true;
                } catch(e) { console.error('savePlayerSession guard error:', e); return false; }
            };
        }

        window.doLogin = async function() {
            var pid = document.getElementById('player-id').value.trim();
            var name = document.getElementById('player-name').value.trim();
            if (!pid || !name) { showToast('ID y username son requeridos', 'error'); return; }
            var result = document.getElementById('login-result');
            var msg = document.getElementById('login-message');
            result.classList.remove('hidden');
            msg.textContent = 'Verificando...';
            msg.className = 'text-sm text-slate-500';
            try {
                var { data: player, error } = await window.supabase.from('players').select('id, current_username, status').eq('id', parseInt(pid)).single();
                if (error && error.code !== 'PGRST116') { msg.textContent = 'Error: ' + error.message; msg.className = 'text-sm text-red-600'; return; }
                if (!player) {
                    var { error: insertErr } = await window.supabase.from('players').insert({ id: parseInt(pid), current_username: name, status: 'active', last_seen: new Date().toISOString() });
                    if (insertErr) { msg.textContent = 'Error creando jugador: ' + insertErr.message; msg.className = 'text-sm text-red-600'; return; }
                } else {
                    await window.supabase.from('players').update({ last_seen: new Date().toISOString() }).eq('id', parseInt(pid));
                }
                var ok = await window.savePlayerSession(pid, name);
                if (!ok) { msg.textContent = 'Error guardando sesion'; msg.className = 'text-sm text-red-600'; return; }
                msg.textContent = 'Bienvenido, ' + name + '!';
                msg.className = 'text-sm text-green-600 font-bold';

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
