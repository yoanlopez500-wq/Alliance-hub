/**
 * admin-rankings.js - Rankings para administradores (admin/rankings.html)
 *
 * Extraido de admin/rankings.html como parte de la refactorizacion al sistema de loader/cache-buster.
 */
(function() {
    'use strict';

    var allAlliances = [];

    async function loadAlliances() {
        try {
            var { data, error } = await window.supabase.from('alliances').select('id, name');
            if (error) throw error;
            allAlliances = data || [];
        } catch(e) { console.error('[RankingsAdmin] Error cargando alliances:', e); }
    }

    function getAllianceName(allianceId) {
        if (!allianceId || !allAlliances.length) return null;
        return allAlliances.find(function(x) { return x.id === allianceId; });
    }

    async function loadRankings() {
        try {
            await loadAlliances();
            var { data, error } = await window.supabase.from('players').select('*').order('total_kills', { ascending: false }).limit(100);
            if (error) throw error;
            var tbody = document.getElementById('rankings-tbody');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8" style="color:#9fa8da;">Sin datos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(function(p, i) {
                var kd = p.total_deaths > 0 ? (p.total_kills / p.total_deaths).toFixed(2) : p.total_kills > 0 ? p.total_kills.toFixed(2) : '0.00';
                var alliance = getAllianceName(p.current_alliance_id);
                return '<tr style="border-bottom:1px solid #1a237e;"><td class="p-3 font-bold">' + (i+1) + '</td><td class="p-3 font-medium">' + p.current_username + '</td><td class="p-3" style="color:#9fa8da;">' + (alliance ? alliance.name : '-') + '</td><td class="p-3 text-right">' + (p.total_kills || 0) + '</td><td class="p-3 text-right">' + (p.total_deaths || 0) + '</td><td class="p-3 text-right">' + kd + '</td><td class="p-3">' + window.getStatusBadgePlayer(p.status) + '</td></tr>';
            }).join('');
        } catch(e) { console.error('[RankingsAdmin]', e); }
    }

    window.requireAdmin();
    loadRankings();
})();
