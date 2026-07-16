/**
 * admin-matches.js - Logica de gestion de partidas (admin/matches.html)
 *
 * Extraido de admin/matches.html como parte de la refactorizacion.
 * Depende de: admin-base.js (loadAlliancesMap, getAlliance, formatDate, getStatusBadge, getTypeBadge)
 */
(function() {
    'use strict';

    var allMatches = [];

    async function loadMatches() {
        try {
            await window.loadAlliancesMap();
            var status = document.getElementById('filter-status');
            var statusVal = status ? status.value : '';

            // Filtrar por alianza para lideres de alianza
            var admin = null;
            try { admin = await window.getAdminRole(); } catch(e) {}
            var isAllianceLeader = admin && admin.role === 'alliance_leader' && admin.alliance_id;

            var q = window.supabase.from('matches').select('*').order('created_at', { ascending: false }).limit(50);
            if (isAllianceLeader) {
                q = q.eq('alliance_id', admin.alliance_id);
            }
            if (statusVal) q = q.eq('status', statusVal);
            var { data, error } = await q;
            if (error) throw error;
            allMatches = data || [];
            renderMatches(allMatches);
        } catch(e) {
            console.error('[Matches]', e);
            var list = document.getElementById('matches-list');
            if (list) list.innerHTML = '<div class="text-center py-8 rounded-xl bg-ah-card border border-indigo-900 text-red-400">Error cargando partidas: ' + e.message + '<br><button onclick="adminMatches.load()" class="mt-3 px-4 py-2 rounded-lg text-sm font-bold bg-indigo-900 text-slate-100">Reintentar</button></div>';
        }
    }

    function renderMatches(data) {
        var list = document.getElementById('matches-list');
        if (!list) return;
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="text-center py-8 rounded-xl bg-ah-card border border-indigo-900 text-ah-muted">No hay partidas. Crea la primera.</div>';
            return;
        }
        list.innerHTML = '<div class="space-y-3">' + data.map(function(m) {
            var alliance = window.getAlliance(m.alliance_id);
            var allianceLabel = alliance ? ' [' + alliance.tag + ']' : '';
            var typeBadge = m.match_type === 'duel' ? '<span class="px-2 py-0.5 rounded text-xs font-bold ml-1 bg-red-500/15 text-red-400">DUELO</span>' : m.match_type === 'internal' ? '<span class="px-2 py-0.5 rounded text-xs font-bold ml-1 bg-blue-500/15 text-blue-500">INTERNA</span>' : '<span class="px-2 py-0.5 rounded text-xs font-bold ml-1 bg-purple-500/15 text-purple-400">GLOBAL</span>';
            var statusBadge = window.getStatusBadge(m.status);
            return '<a href="match-detail.html?id=' + m.id + '" class="block rounded-xl p-4 transition hover:opacity-90 bg-ah-card border border-indigo-900"><div class="flex items-center justify-between"><div><h3 class="font-bold">' + (m.name || 'Partida') + allianceLabel + '</h3><p class="text-xs mt-1 text-ah-muted">' + window.formatDate(m.created_at) + ' | Max: ' + (m.max_players || '-') + ' jugadores</p></div><div class="flex items-center gap-1">' + statusBadge + typeBadge + '</div></div></a>';
        }).join('') + '</div>';
    }

    window.filterMatches = function(query) {
        var q = query.toLowerCase();
        var filtered = allMatches.filter(function(m) { return (m.name || '').toLowerCase().includes(q); });
        renderMatches(filtered);
    };

    window.openMatchModal = function() { window.location.href = 'match-detail.html?action=new'; };

    // Namespace para reintentos
    window.adminMatches = { load: loadMatches };

    // Inicializar
    window.requireAdmin();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadMatches);
    } else {
        loadMatches();
    }
})();