/**
 * admin-rankings.js - Rankings para administradores (admin/rankings.html)
 *
 * Extraido de admin/rankings.html como parte de la refactorizacion al sistema de loader/cache-buster.
 * Ahora calcula bajas/muertes solo de partidas donde el jugador esta registrado en match_registrations.
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

            // 1) Resultados de partidas publicas (no internal)
            var { data: results, error: rErr } = await window.supabase.from('match_results')
                .select('player_id, kills, deaths, match_id, matches!inner(match_type)')
                .neq('matches.match_type', 'internal');
            if (rErr) throw rErr;

            // 2) Filtrar por jugadores registrados en cada partida
            var matchIds = [];
            (results || []).forEach(function(r) {
                if (r.match_id && matchIds.indexOf(r.match_id) === -1) matchIds.push(r.match_id);
            });
            var validRegistrations = {};
            if (matchIds.length > 0) {
                var { data: regs, error: regErr } = await window.supabase.from('match_registrations')
                    .select('match_id, player_id')
                    .in('match_id', matchIds);
                if (regErr) throw regErr;
                (regs || []).forEach(function(r) {
                    validRegistrations[r.match_id + ':' + r.player_id] = true;
                });
            }

            var stats = {};
            (results || []).forEach(function(r) {
                if (!validRegistrations[r.match_id + ':' + r.player_id]) return;
                var pid = r.player_id;
                if (!stats[pid]) stats[pid] = { kills: 0, deaths: 0, games: 0 };
                stats[pid].kills += (r.kills || 0);
                stats[pid].deaths += (r.deaths || 0);
                stats[pid].games += 1;
            });

            var playerIds = Object.keys(stats).map(Number);
            var playersData = [];
            if (playerIds.length > 0) {
                var { data: players, error: pErr } = await window.supabase.from('players')
                    .select('id, current_username, current_alliance_id, total_kills, total_deaths, games_played')
                    .in('id', playerIds);
                if (pErr) throw pErr;
                playersData = (players || []).map(function(p) {
                    var s = stats[p.id] || { kills: 0, deaths: 0, games: 0 };
                    return {
                        id: p.id,
                        username: p.current_username,
                        alliance_id: p.current_alliance_id,
                        kills: s.kills,
                        deaths: s.deaths,
                        games: s.games
                    };
                });
            }

            playersData.sort(function(a, b) { return b.kills - a.kills; });

            var tbody = document.getElementById('rankings-tbody');
            if (!tbody) return;
            if (playersData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8" style="color:#9fa8da;">Sin datos</td></tr>';
                return;
            }
            tbody.innerHTML = playersData.map(function(p, i) {
                var kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills > 0 ? p.kills.toFixed(2) : '0.00';
                var alliance = getAllianceName(p.alliance_id);
                return '<tr style="border-bottom:1px solid #1a237e;"><td class="p-3 font-bold">' + (i+1) + '</td><td class="p-3 font-medium">' + p.username + '</td><td class="p-3" style="color:#9fa8da;">' + (alliance ? alliance.name : '-') + '</td><td class="p-3 text-right">' + (p.kills || 0) + '</td><td class="p-3 text-right">' + (p.deaths || 0) + '</td><td class="p-3 text-right">' + kd + '</td><td class="p-3">' + (p.games || 0) + ' partidas</td></tr>';
            }).join('');
        } catch(e) { console.error('[RankingsAdmin]', e); }
    }

    window.requireAdmin();
    loadRankings();
})();
