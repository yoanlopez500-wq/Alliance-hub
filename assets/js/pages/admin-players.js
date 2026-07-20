/**
 * admin-players.js - Logica de gestion de jugadores (admin/players.html)
 *
 * Extraido de admin/players.html como parte de la refactorizacion.
 * Depende de: admin-base.js (loadAlliancesList, getAllianceName, formatDate, getStatusBadgePlayer)
 */
(function() {
    'use strict';

    var allPlayers = [];

    async function init() {
        await window.loadAlliancesList();
        await loadPlayers();
    }

    async function loadPlayers() {
        try {
            var pc = window.DB.tableCols('players');
            var status = document.getElementById('filter-status');
            var statusVal = status ? status.value : '';
            var q = window.DB.from('players').select('*');
            if (statusVal) q = q.eq('status', statusVal);
            var { data, error } = await q;
            if (error) throw error;

            var players = data || [];
            var playerIds = players.map(function(p) { return p[pc.id]; });
            var stats = {};
            if (playerIds.length > 0) {
                stats = await window.RankingUtils.getValidPlayerStats({ playerIds: playerIds });
            }

            allPlayers = players.map(function(p) {
                var s = stats[p[pc.id]] || { kills: 0, deaths: 0, games: 0 };
                p[pc.kills] = s.kills;
                p[pc.deaths] = s.deaths;
                p[pc.gamesPlayed] = s.games;
                return p;
            }).sort(function(a, b) {
                return (b[pc.kills] || 0) - (a[pc.kills] || 0);
            });

            renderPlayers(allPlayers.slice(0, 100));
        } catch(e) {
            console.error('[Players]', e);
            var container = document.getElementById('players-table-container');
            if (container) container.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando jugadores: ' + e.message + '</div>';
        }
    }

    function renderPlayers(data) {
        var tbody = document.getElementById('players-tbody');
        if (!tbody) return;
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-ah-muted">No hay jugadores</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(function(p) {
            var kd = p.total_deaths > 0 ? (p.total_kills / p.total_deaths).toFixed(2) : p.total_kills > 0 ? p.total_kills.toFixed(2) : '0.00';
            var alliance = window.getAllianceName(p.alliance_id);
            var revokeBtn = '';
            if (p.status === 'banned' || p.status === 'suspended') {
                revokeBtn = '<button onclick="revokePlayerBan(' + p.id + ')" class="ml-2 text-xs font-bold text-green-400 hover:text-green-300">Revocar</button>';
            }
            return '<tr class="border-b border-indigo-900"><td class="p-3 font-medium">' + (p.current_username || 'Sin nombre') + '</td><td class="p-3 text-ah-muted">' + (alliance ? alliance.name + ' [' + alliance.tag + ']' : '-') + '</td><td class="p-3 text-right">' + (p.total_kills || 0) + '</td><td class="p-3 text-right">' + (p.total_deaths || 0) + '</td><td class="p-3 text-right">' + kd + '</td><td class="p-3">' + window.getStatusBadgePlayer(p.status) + revokeBtn + '</td><td class="p-3"><a href="../player.html?id=' + p.id + '" class="text-xs font-bold text-orange-400">Ver</a></td></tr>';
        }).join('');
    }

    window.revokePlayerBan = async function(playerId) {
        if (!confirm('Revocar la restriccion de este jugador?')) return;
        try {
            var { error } = await window.supabase.from('players').update({
                status: 'active',
                banned_until: null,
                suspended_until: null,
                suspension_reason: null
            }).eq('id', playerId);
            if (error) throw error;
            window.showToast('Restriccion revocada', 'success');
            loadPlayers();
        } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
    };

    window.filterPlayers = function(query) {
        var q = query.toLowerCase();
        var filtered = allPlayers.filter(function(p) { return (p.current_username || '').toLowerCase().includes(q); });
        renderPlayers(filtered);
    };

    // Namespace para reintentos desde HTML
    window.adminPlayers = { load: loadPlayers };

    window.requireAdmin();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();