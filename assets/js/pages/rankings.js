/**
 * rankings.js - Logica de la pagina de rankings (rankings.html)
 *
 * Extraido de rankings.html como parte de la refactorizacion.
 * Funciones: rankings de jugadores, alianzas, duelos, strikes, calculo de kills efectivos.
 */
(function() {
    'use strict';

    var nullifiedCache = {};
    var sanctionsCache = {};
    var strikesCache = {};
    var allianceMap = {};

    function showError(msg) {
        var el = document.getElementById('error-banner');
        if (el) { el.textContent = msg; el.classList.remove('hidden'); }
    }

    function getAllianceTag(aid) {
        return (allianceMap[aid] && allianceMap[aid].tag) ? allianceMap[aid].tag : '-';
    }

    function effectiveKills(player) {
        var pc = window.DB.tableCols('players');
        var sanc = sanctionsCache[player[pc.id]];
        var total = player[pc.kills] || 0; // en loadRankings se sobreescribe con kills validas
        var nullified = nullifiedCache[player[pc.id]] || 0;
        var strikes = strikesCache[player[pc.id]] || [];
        // Si hay sancion activa, recalculamos sobre el total VALIDO usando el penalty_pct guardado.
        if (sanc && sanc.kills_after != null) {
            var penalty = sanc.penalty_pct || 0;
            return Math.max(0, Math.round(total * (1 - penalty / 100) - nullified));
        }
        return computeEffectiveKills(total, strikes, nullified).effKills;
    }

    function getPenaltyPct(player) {
        var pc = window.DB.tableCols('players');
        var sanc = sanctionsCache[player[pc.id]];
        if (sanc && sanc.penalty_pct != null) return sanc.penalty_pct;
        var total = player[pc.kills] || 0;
        var nullified = nullifiedCache[player[pc.id]] || 0;
        var strikes = strikesCache[player[pc.id]] || [];
        return computeEffectiveKills(total, strikes, nullified).penaltyPct;
    }

    async function loadSanctions() {
        try {
            var sc = window.DB.tableCols('playerSanctions');
            var res = await window.DB.from('playerSanctions').select([sc.playerId, sc.killsAfter, sc.penaltyPct].join(', ')).order(sc.createdAt, { ascending: false });
            if (res.error) throw res.error;
            sanctionsCache = {};
            (res.data || []).forEach(function(s) {
                if (!sanctionsCache[s[sc.playerId]]) sanctionsCache[s[sc.playerId]] = { kills_after: s[sc.killsAfter], penalty_pct: s[sc.penaltyPct] || 0 };
            });
        } catch(e) { console.error('[Rankings] Error sanciones:', e); sanctionsCache = {}; }
    }

    async function loadData() {
        try {
            var ac = window.DB.tableCols('alliances');
            var res = await window.DB.from('alliances').select([ac.id, ac.name, ac.tag].join(', ')).order(ac.name);
            if (res.error) throw res.error;
            allianceMap = {};
            var selectEl = document.getElementById('filter-alliance');
            if (selectEl) {
                selectEl.innerHTML = '<option value="">Todas las alianzas</option>' +
                    (res.data || []).map(function(a) {
                        allianceMap[a[ac.id]] = { name: a[ac.name], tag: a[ac.tag] };
                        return '<option value="' + a[ac.id] + '">' + a[ac.name] + '</option>';
                    }).join('');
            }
        } catch(e) { console.error('[Rankings] Error alianzas:', e); }

        try {
            var nkc = window.DB.tableCols('matchNullifiedKills');
            var res2 = await window.DB.from('matchNullifiedKills').select([nkc.playerId, nkc.killsNullified].join(', '));
            if (res2.error) throw res2.error;
            nullifiedCache = {};
            (res2.data || []).forEach(function(r) { nullifiedCache[r[nkc.playerId]] = (nullifiedCache[r[nkc.playerId]] || 0) + r[nkc.killsNullified]; });
        } catch(e) { console.error('[Rankings] Error nullified:', e); nullifiedCache = {}; }

        await loadSanctions();

        try {
            var stc = window.DB.tableCols('playerStrikes');
            var res3 = await window.DB.from('playerStrikes').select(window.DB.select('playerStrikes', 'withType')).eq(stc.isActive, true);
            if (res3.error) throw res3.error;
            strikesCache = {};
            (res3.data || []).forEach(function(s) {
                var pid = s[stc.playerId];
                if (!strikesCache[pid]) strikesCache[pid] = [];
                strikesCache[pid].push(s);
            });
        } catch(e) { console.error('[Rankings] Error strikes:', e); strikesCache = {}; }

        try { await loadRankings(); } catch(e) { console.error('[Rankings] jugadores:', e); }
        try { await loadAlliances(); } catch(e) { console.error('[Rankings] alianzas:', e); }
        try { await loadDuels(); } catch(e) { console.error('[Rankings] duelos:', e); }
        try { await loadStrikes(); } catch(e) { console.error('[Rankings] strikes:', e); }
    }

    async function loadRankings() {
        try {
            var af = document.getElementById('filter-alliance');
            var allianceFilter = af ? af.value : '';
            var pc = window.DB.tableCols('players');

            var q = window.supabase.from('match_results')
                .select('player_id, kills, deaths, match_id, matches!inner(match_type, alliance_id)')
                .neq('matches.match_type', 'internal');

            var res = await q;
            if (res.error) throw res.error;

            // Solo cuentan resultados de jugadores registrados en la partida (match_registrations).
            var matchIds = [];
            (res.data || []).forEach(function(r) {
                if (r.match_id && matchIds.indexOf(r.match_id) === -1) matchIds.push(r.match_id);
            });
            var validRegistrations = {};
            if (matchIds.length > 0) {
                var mrc = window.DB.tableCols('matchRegistrations');
                var regRes = await window.DB.from('matchRegistrations')
                    .select([mrc.matchId, mrc.playerId].join(', '))
                    .in(mrc.matchId, matchIds);
                if (regRes.error) throw regRes.error;
                (regRes.data || []).forEach(function(r) {
                    validRegistrations[r[mrc.matchId] + ':' + r[mrc.playerId]] = true;
                });
            }

            var playerStats = {};
            (res.data || []).forEach(function(r) {
                if (!validRegistrations[r.match_id + ':' + r.player_id]) return;
                var pid = r.player_id;
                if (!playerStats[pid]) playerStats[pid] = { kills: 0, deaths: 0, games: 0 };
                playerStats[pid].kills += (r.kills || 0);
                playerStats[pid].deaths += (r.deaths || 0);
                playerStats[pid].games += 1;
            });

            var playerIds = Object.keys(playerStats).map(Number);
            var playersData = [];
            if (playerIds.length > 0) {
                var pq = window.DB.from('players').select([pc.id, pc.currentUsername, pc.currentAllianceId, pc.gamesPlayed].join(', ')).in(pc.id, playerIds);
                if (allianceFilter) pq = pq.eq(pc.currentAllianceId, allianceFilter);
                var pres = await pq;
                if (!pres.error && pres.data) {
                    playersData = pres.data.map(function(p) {
                        var stats = playerStats[p[pc.id]] || { kills: 0, deaths: 0, games: 0 };
                        p[pc.kills] = stats.kills;
                        p[pc.deaths] = stats.deaths;
                        p[pc.gamesPlayed] = stats.games;
                        return p;
                    });
                }
            }

            playersData.sort(function(a, b) { return effectiveKills(b) - effectiveKills(a); });
            var tbody = document.getElementById('players-tbody');
            if (!tbody) return;
            if (playersData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-ah-muted">Sin datos de rankings publicos</td></tr>';
                return;
            }

            tbody.innerHTML = playersData.map(function(p, i) {
                var eff = effectiveKills(p);
                var penalty = getPenaltyPct(p);
                var killClass = penalty > 0 ? 'kill-nullified' : '';
                var badge = penalty > 0 ? '<span class="text-[10px] px-1 py-0.5 rounded font-bold ml-1 bg-red-500/20 text-red-400">-' + penalty + '%</span>' : '';
                return '<tr class="border-b border-indigo-900"><td class="p-3 font-bold text-ah-muted">' + (i+1) + '</td><td class="p-3 font-medium"><a href="player.html?id=' + p[pc.id] + '" class="text-amber-400">' + p[pc.currentUsername] + '</a>' + badge + '</td><td class="p-3 text-ah-muted">' + getAllianceTag(p[pc.currentAllianceId]) + '</td><td class="p-3 text-right text-ah-muted">' + (p[pc.gamesPlayed] || 0) + '</td><td class="p-3 text-right font-bold ' + killClass + ' ' + (eff > 0 ? 'text-green-500' : 'text-ah-muted') + ';">' + eff + '</td><td class="p-3 text-right text-ah-muted">' + (p[pc.deaths] || 0) + '</td><td class="p-3 text-right font-bold">' + (p[pc.deaths] > 0 ? (eff / p[pc.deaths]).toFixed(2) : (eff > 0 ? eff.toFixed(2) : '0')) + '</td><td class="p-3 text-right">' + (penalty > 0 ? '<span title="Penalizacion por strikes/sanciones" class="text-red-400">&#9889;</span>' : '') + '</td></tr>';
            }).join('');
        } catch(e) {
            console.error('[Rankings] jugadores:', e);
            var tbody = document.getElementById('players-tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-400">Error: ' + e.message + '</td></tr>';
        }
    }

    async function loadAlliances() {
        try {
            var ac = window.DB.tableCols('alliances');
            var pc = window.DB.tableCols('players');
            var mrc = window.DB.tableCols('matchRegistrations');
            var res = await window.DB.from('alliances').select(window.DB.select('alliances', 'basic'));
            if (res.error) throw res.error;

            // Bajas validas = resultados de partidas publicas donde el jugador esta registrado en la partida.
            var resultsRes = await window.supabase.from('match_results')
                .select('player_id, kills, match_id, matches!inner(match_type)')
                .neq('matches.match_type', 'internal');
            if (resultsRes.error) throw resultsRes.error;

            var matchIds = [];
            (resultsRes.data || []).forEach(function(r) {
                if (r.match_id && matchIds.indexOf(r.match_id) === -1) matchIds.push(r.match_id);
            });
            var validRegistrations = {};
            if (matchIds.length > 0) {
                var regRes = await window.DB.from('matchRegistrations')
                    .select([mrc.matchId, mrc.playerId].join(', '))
                    .in(mrc.matchId, matchIds);
                if (regRes.error) throw regRes.error;
                (regRes.data || []).forEach(function(r) {
                    validRegistrations[r[mrc.matchId] + ':' + r[mrc.playerId]] = true;
                });
            }

            var killsByPlayer = {};
            (resultsRes.data || []).forEach(function(r) {
                if (!validRegistrations[r.match_id + ':' + r.player_id]) return;
                if (!killsByPlayer[r.player_id]) killsByPlayer[r.player_id] = 0;
                killsByPlayer[r.player_id] += (r.kills || 0);
            });

            var playerStats = {};
            var playerIds = Object.keys(killsByPlayer).map(Number);
            if (playerIds.length > 0) {
                var playersRes = await window.DB.from('players').select([pc.id, pc.currentAllianceId].join(', ')).in(pc.id, playerIds);
                if (!playersRes.error && playersRes.data) {
                    playersRes.data.forEach(function(p) {
                        if (!p[pc.currentAllianceId]) return;
                        if (!playerStats[p[pc.currentAllianceId]]) playerStats[p[pc.currentAllianceId]] = { count: 0, kills: 0 };
                        playerStats[p[pc.currentAllianceId]].count++;
                        playerStats[p[pc.currentAllianceId]].kills += (killsByPlayer[p[pc.id]] || 0);
                    });
                }
            }

            var c = document.getElementById('alliances-list');
            if (!c) return;
            if (!res.data || res.data.length === 0) { c.innerHTML = '<div class="text-center py-8 text-ah-muted">Sin alianzas registradas</div>'; return; }

            var sorted = res.data.map(function(a) {
                var stats = playerStats[a[ac.id]] || { count: 0, kills: 0 };
                return { id: a[ac.id], name: a[ac.name], tag: a[ac.tag], description: a[ac.description], member_count: stats.count, total_kills: stats.kills };
            }).sort(function(a, b) { return b.total_kills - a.total_kills; });

            c.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' + sorted.map(function(a, i) {
                return '<div class="rounded-xl p-5 bg-slate-900 border border-indigo-900"><div class="flex items-center gap-3"><div class="text-2xl font-bold text-amber-400">#' + (i+1) + '</div><div class="flex-1"><h3 class="font-bold text-lg">' + a.name + '</h3><p class="text-xs text-ah-muted">[' + (a.tag || '-') + ']</p></div></div><div class="grid grid-cols-2 gap-3 mt-3"><div class="rounded-lg p-2 text-center bg-slate-950"><p class="text-xs text-ah-muted">Miembros</p><p class="font-bold">' + (a.member_count || 0) + '</p></div><div class="rounded-lg p-2 text-center bg-slate-950"><p class="text-xs text-ah-muted">Bajas</p><p class="font-bold text-green-500">' + (a.total_kills || 0).toLocaleString() + '</p></div></div></div>';
            }).join('') + '</div>';
        } catch(e) { console.error('[Rankings] alianzas:', e); var c = document.getElementById('alliances-list'); if (c) c.innerHTML = '<div class="text-center py-8 text-red-400">Error alianzas: ' + (e.message || e) + '</div>'; }
    }

    async function loadDuels() {
        try {
            var mc = window.DB.tableCols('matches');
            var ac = window.DB.tableCols('alliances');
            var res = await window.DB.from('matches')
                .select([mc.id, mc.name, mc.allianceId, mc.status, mc.matchType, mc.createdAt].join(', '))
                .eq(mc.matchType, 'duel')
                .order(mc.createdAt, { ascending: false })
                .limit(20);
            if (res.error) throw res.error;
            var c = document.getElementById('duels-list');
            if (!c) return;
            if (!res.data || res.data.length === 0) { c.innerHTML = '<div class="text-center py-8 text-ah-muted bg-slate-900 border border-indigo-900 rounded-xl">Sin duelos finalizados</div>'; return; }

            var allianceIds = res.data.map(function(d) { return d[mc.allianceId]; }).filter(function(v) { return !!v; });
            var alliancesData = {};
            if (allianceIds.length > 0) {
                try {
                    var aRes = await window.DB.from('alliances').select([ac.id, ac.name, ac.tag].join(', ')).in(ac.id, allianceIds);
                    if (aRes.data) aRes.data.forEach(function(a) { alliancesData[a[ac.id]] = a; });
                } catch(e) {}
            }

            c.innerHTML = res.data.map(function(d) {
                var alli = alliancesData[d[mc.allianceId]] || {};
                var statusBadge = d[mc.status] === 'finished' ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-green-500/20 text-green-500">FINALIZADO</span>' :
                                  d[mc.status] === 'in_progress' ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-blue-500/20 text-blue-500">EN CURSO</span>' :
                                  '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400">' + (d[mc.status] || 'ABIERTO') + '</span>';
                return '<div class="rounded-xl p-5 mb-3 bg-slate-900 border border-indigo-900"><div class="flex items-center justify-between mb-2"><div class="font-bold">' + (d[mc.name] || 'Duelo') + '</div>' + statusBadge + '</div><div class="text-xs text-ah-muted">Alianza: ' + (alli[ac.name] || 'N/A') + (alli[ac.tag] ? ' [' + alli[ac.tag] + ']' : '') + ' | ' + window.formatDate(d[mc.createdAt]) + '</div></div>';
            }).join('');
        } catch(e) { console.error('[Rankings] duelos:', e); var c = document.getElementById('duels-list'); if (c) c.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando duelos: ' + (e.message || e) + '</div>'; }
    }

    async function loadStrikes() {
        try {
            var stc = window.DB.tableCols('playerStrikes');
            var res = await window.DB.from('playerStrikes')
                .select(stc.playerId + ', ' + stc.isActive + ', players!inner(id, current_username, current_alliance_id, status, last_seen)')
                .eq(stc.isActive, true)
                .limit(200);
            if (res.error) throw res.error;
            var tbody = document.getElementById('strikes-tbody');
            if (!tbody) return;
            if (!res.data || res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-ah-muted">Sin strikes registrados</td></tr>'; return; }
            var counts = {};
            res.data.forEach(function(s) {
                var pid = s[stc.playerId];
                if (!counts[pid]) counts[pid] = { count: 0, player: s.players };
                counts[pid].count++;
            });
            var rows = Object.values(counts).sort(function(a, b) { return b.count - a.count; }).slice(0, 50);
            tbody.innerHTML = rows.map(function(r) {
                return '<tr class="border-b border-indigo-900"><td class="p-3 font-medium">' + (r.player.current_username || '?') + '</td><td class="p-3 text-ah-muted">' + getAllianceTag(r.player.current_alliance_id) + '</td><td class="p-3 text-right font-bold text-red-400">' + r.count + '</td><td class="p-3">' + window.getStatusBadgePlayer(r.player.status) + '</td><td class="p-3 text-ah-muted text-xs">' + window.formatDate(r.player.last_seen) + '</td></tr>';
            }).join('');
        } catch(e) { console.error('[Rankings] strikes:', e); var tbody = document.getElementById('strikes-tbody'); if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-400">Error cargando strikes: ' + (e.message || e) + '</td></tr>'; }
    }

    // Tab switcher
    window.showTab = function(tab) {
        ['players', 'alliances', 'leagues', 'duels', 'strikes'].forEach(function(t) {
            var rankingEl = document.getElementById(t + '-ranking');
            if (rankingEl) rankingEl.classList.toggle('hidden', t !== tab);
            var btn = document.getElementById('tab-' + t);
            if (!btn) return;
            if (t === tab) {
                btn.className = 'px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 text-ah-accent min-w-[80px]';
                btn.style.borderColor = '#ff8f00';
            } else {
                btn.className = 'px-4 py-3 text-sm font-bold text-ah-muted hover:text-ah-text whitespace-nowrap min-w-[80px]';
                btn.style.borderColor = 'transparent';
            }
        });
    };

    // Exponer loadRankings para el filtro de alianza
    window.loadRankings = loadRankings;

    // Inicializar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof window.DB !== 'undefined') { loadData(); }
            else { window.addEventListener('ah:loaded', function() { loadData(); }); }
        });
    } else {
        if (typeof window.DB !== 'undefined') { loadData(); }
        else { window.addEventListener('ah:loaded', function() { loadData(); }); }
    }
})();