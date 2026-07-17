/**
 * player.js - Perfil publico de jugador (player.html)
 *
 * Extraido de player.html como parte de la refactorizacion al sistema de loader/cache-buster.
 */
(function() {
    'use strict';

    var allAlliances = [];

    async function loadAlliances() {
        try {
            var { data, error } = await window.supabase.from('alliances').select('id, name, tag');
            if (error) throw error;
            allAlliances = data || [];
        } catch(e) { console.error('[Player] Error cargando alliances:', e); }
    }

    function getAllianceName(allianceId) {
        if (!allianceId || !allAlliances.length) return null;
        return allAlliances.find(function(x) { return x.id === allianceId; }) || null;
    }

    function renderError(message) {
        var container = document.getElementById('player-profile');
        if (!container) return;
        if (window.AhComponents) {
            container.innerHTML = '';
            window.AhComponents.inject('error-state', { message: message }, 'player-profile');
        } else {
            container.innerHTML = '<div class="text-center py-8 text-red-400">' + message + '</div>';
        }
    }

    function renderEmpty(message) {
        var container = document.getElementById('player-profile');
        if (!container) return;
        if (window.AhComponents) {
            container.innerHTML = '';
            window.AhComponents.inject('empty-state', { message: message }, 'player-profile');
        } else {
            container.innerHTML = '<div class="text-center py-8 text-red-400">' + message + '</div>';
        }
    }

    async function loadProfile() {
        var params = new URLSearchParams(window.location.search);
        var playerId = params.get('id');
        if (!playerId) { renderError('ID de jugador no especificado'); return; }
        try {
            var { data: player, error } = await window.supabase.from('players').select('*').eq('id', playerId).single();
            if (error) throw error;
            if (!player) { renderEmpty('Jugador no encontrado'); return; }

            var strikesRes = await window.supabase.from('player_strikes').select('*, strike_types(*)').eq('player_id', playerId).eq('status', 'active');
            var strikes = strikesRes.data || [];
            var strikeCount = strikes.length;
            var totalKills = player.total_kills || 0;
            var totalDeaths = player.total_deaths || 0;
            var eff = window.computeEffectiveKills(totalKills, strikes, 0);
            var effKills = eff.effKills;
            var penaltyPct = eff.penaltyPct;
            var kd = totalDeaths > 0 ? (effKills / totalDeaths).toFixed(2) : effKills > 0 ? effKills.toFixed(2) : '0.00';
            var penaltyBadge = penaltyPct > 0 ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold ml-2" style="background:rgba(198,40,40,0.2);color:#ef5350">-' + penaltyPct + '% penalizacion</span>' : '';
            var strikeBadge = strikeCount > 0 ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold ml-2" style="background:rgba(255,143,0,0.2);color:#ff8f00">' + strikeCount + ' strike' + (strikeCount > 1 ? 's' : '') + '</span>' : '';
            var alliance = getAllianceName(player.alliance_id);

            document.getElementById('player-profile').innerHTML = '<div class="rounded-xl p-6" style="background:#11183a;border:1px solid #1a237e;"><div class="flex items-center gap-4 mb-4"><div class="text-4xl">&#128100;</div><div><h1 class="text-2xl font-bold">' + player.current_username + strikeBadge + '</h1><p class="text-sm" style="color:#9fa8da;">' + (alliance ? alliance.name + ' [' + alliance.tag + ']' : 'Sin alianza') + '</p></div></div><div class="grid grid-cols-2 md:grid-cols-4 gap-4"><div class="rounded-lg p-3 text-center" style="background:#0a0e27;border:1px solid #1a237e;"><div class="text-2xl font-bold" style="color:#ff8f00;">' + effKills + penaltyBadge + '</div><div class="text-xs" style="color:#9fa8da;">Bajas Efectivas</div></div><div class="rounded-lg p-3 text-center" style="background:#0a0e27;border:1px solid #1a237e;"><div class="text-2xl font-bold">' + totalDeaths + '</div><div class="text-xs" style="color:#9fa8da;">Muertes</div></div><div class="rounded-lg p-3 text-center" style="background:#0a0e27;border:1px solid #1a237e;"><div class="text-2xl font-bold">' + kd + '</div><div class="text-xs" style="color:#9fa8da;">K/D</div></div><div class="rounded-lg p-3 text-center" style="background:#0a0e27;border:1px solid #1a237e;"><div class="text-2xl font-bold">' + (player.games_played || 0) + '</div><div class="text-xs" style="color:#9fa8da;">Partidas</div></div></div></div>';
        } catch(e) {
            console.error('[Profile]', e);
            renderError('Error: ' + e.message);
        }
    }

    async function init() {
        await loadAlliances();
        await loadProfile();
    }

    init();
})();
