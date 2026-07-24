/**
 * rankings.js - Logica de la pagina de rankings (rankings.html)
 *
 * Extraido de rankings.html como parte de la refactorizacion.
 * Funciones: rankings de jugadores, alianzas, duelos, strikes, calculo de kills efectivos.
 *
 * v2: lecturas publicas via vistas (public_rankings_view, public_alliance_rankings_view,
 * public_matches_view). Strikes/sanciones/kills anulados siguen leyendo tablas base.
 * v3: tab Duelos muestra ademas la tabla de standings por alianza
 * (public_duel_standings_view) ordenada por puntos de duelo.
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
            var vc = window.DB.tableCols('publicRankings');

            // La vista ya agrega solo resultados validos de partidas no internas.
            var q = window.DB.from('publicRankings').select(window.DB.select('publicRankings', 'all'));
            if (allianceFilter) q = q.eq(vc.currentAllianceId, allianceFilter);
            var res = await q;
            if (res.error) throw res.error;

            // Mapear filas de la vista al formato de jugador usado por el renderizado.
            var playersData = (res.data || []).map(function(r) {
                var p = {};
                p[pc.id] = r[vc.playerId];
                p[pc.currentUsername] = r[vc.currentUsername];
                p[pc.currentAllianceId] = r[vc.currentAllianceId];
                p[pc.kills] = r[vc.totalKills] || 0;
                p[pc.deaths] = r[vc.totalDeaths] || 0;
                p[pc.gamesPlayed] = r[vc.gamesPlayed] || 0;
                return p;
            });

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
            var arc = window.DB.tableCols('publicAllianceRankings');
            var res = await window.DB.from('alliances').select(window.DB.select('alliances', 'basic'));
            if (res.error) throw res.error;

            // Stats agregadas por alianza desde la vista publica; LEFT JOIN en cliente.
            var rankingRes = await window.DB.from('publicAllianceRankings')
                .select([arc.allianceId, arc.memberCount, arc.totalKills].join(', '));
            if (rankingRes.error) throw rankingRes.error;
            var statsByAlliance = {};
            (rankingRes.data || []).forEach(function(r) {
                statsByAlliance[r[arc.allianceId]] = { count: r[arc.memberCount] || 0, kills: r[arc.totalKills] || 0 };
            });

            var c = document.getElementById('alliances-list');
            if (!c) return;
            if (!res.data || res.data.length === 0) { c.innerHTML = '<div class="text-center py-8 text-ah-muted">Sin alianzas registradas</div>'; return; }

            var sorted = res.data.map(function(a) {
                var stats = statsByAlliance[a[ac.id]] || { count: 0, kills: 0 };
                return { id: a[ac.id], name: a[ac.name], tag: a[ac.tag], description: a[ac.description], member_count: stats.count, total_kills: stats.kills };
            }).sort(function(a, b) { return b.total_kills - a.total_kills; });

            c.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' + sorted.map(function(a, i) {
                return '<div class="rounded-xl p-5 bg-slate-900 border border-indigo-900"><div class="flex items-center gap-3"><div class="text-2xl font-bold text-amber-400">#' + (i+1) + '</div><div class="flex-1"><h3 class="font-bold text-lg">' + a.name + '</h3><p class="text-xs text-ah-muted">[' + (a.tag || '-') + ']</p></div></div><div class="grid grid-cols-2 gap-3 mt-3"><div class="rounded-lg p-2 text-center bg-slate-950"><p class="text-xs text-ah-muted">Miembros</p><p class="font-bold">' + (a.member_count || 0) + '</p></div><div class="rounded-lg p-2 text-center bg-slate-950"><p class="text-xs text-ah-muted">Bajas</p><p class="font-bold text-green-500">' + (a.total_kills || 0).toLocaleString() + '</p></div></div></div>';
            }).join('') + '</div>';
        } catch(e) { console.error('[Rankings] alianzas:', e); var c = document.getElementById('alliances-list'); if (c) c.innerHTML = '<div class="text-center py-8 text-red-400">Error alianzas: ' + (e.message || e) + '</div>'; }
    }

    async function loadDuels() {
        var c = document.getElementById('duels-list');
        if (!c) return;
        var listHtml = '';
        try {
            var pmc = window.DB.tableCols('publicMatches');
            var ac = window.DB.tableCols('alliances');
            var res = await window.DB.from('publicMatches')
                .select([pmc.id, pmc.name, pmc.allianceId, pmc.status, pmc.matchType, pmc.createdAt].join(', '))
                .eq(pmc.matchType, 'duel')
                .order(pmc.createdAt, { ascending: false })
                .limit(20);
            if (res.error) throw res.error;

            if (!res.data || res.data.length === 0) {
                listHtml = '<div class="text-center py-8 text-ah-muted bg-slate-900 border border-indigo-900 rounded-xl">Sin duelos registrados</div>';
            } else {
                var allianceIds = res.data.map(function(d) { return d[pmc.allianceId]; }).filter(function(v) { return !!v; });
                var alliancesData = {};
                if (allianceIds.length > 0) {
                    try {
                        var aRes = await window.DB.from('alliances').select([ac.id, ac.name, ac.tag].join(', ')).in(ac.id, allianceIds);
                        if (aRes.data) aRes.data.forEach(function(a) { alliancesData[a[ac.id]] = a; });
                    } catch(e) {}
                }

                listHtml = res.data.map(function(d) {
                    var alli = alliancesData[d[pmc.allianceId]] || {};
                    var statusBadge = d[pmc.status] === 'finished' ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-green-500/20 text-green-500">FINALIZADO</span>' :
                                      d[pmc.status] === 'in_progress' ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-blue-500/20 text-blue-500">EN CURSO</span>' :
                                      '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400">' + (d[pmc.status] || 'ABIERTO') + '</span>';
                    return '<div class="rounded-xl p-5 mb-3 bg-slate-900 border border-indigo-900"><div class="flex items-center justify-between mb-2"><div class="font-bold">' + (d[pmc.name] || 'Duelo') + '</div>' + statusBadge + '</div><div class="text-xs text-ah-muted">Alianza: ' + (alli[ac.name] || 'N/A') + (alli[ac.tag] ? ' [' + alli[ac.tag] + ']' : '') + ' | ' + window.formatDate(d[pmc.createdAt]) + '</div></div>';
                }).join('');
            }
        } catch(e) {
            console.error('[Rankings] duelos:', e);
            listHtml = '<div class="text-center py-8 text-red-400">Error cargando duelos: ' + (e.message || e) + '</div>';
        }

        // Tabla de standings de duelos por alianza (public_duel_standings_view, acceso directo)
        var standingsHtml = '';
        try {
            var sRes = await window.supabase.from('public_duel_standings_view')
                .select('alliance_id, name, tag, duels_played, duels_won, duels_lost, duels_drawn, duel_points');
            if (sRes.error) throw sRes.error;
            var rows = (sRes.data || []).sort(function(a, b) { return (b.duel_points || 0) - (a.duel_points || 0); });
            if (rows.length === 0) {
                standingsHtml = '<div class="text-center py-6 text-ah-muted bg-slate-900 border border-indigo-900 rounded-xl">Aun no hay duelos finalizados</div>';
            } else {
                standingsHtml = '<div class="rounded-xl bg-slate-900 border border-indigo-900 overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-sm">' +
                    '<thead><tr class="border-b border-indigo-900 text-ah-muted text-xs">' +
                    '<th class="p-3 text-left">#</th><th class="p-3 text-left">Alianza</th><th class="p-3 text-left">Tag</th>' +
                    '<th class="p-3 text-right">Jugados</th><th class="p-3 text-right">Ganados</th><th class="p-3 text-right">Perdidos</th>' +
                    '<th class="p-3 text-right">Empatados</th><th class="p-3 text-right">Puntos</th>' +
                    '</tr></thead><tbody>' +
                    rows.map(function(r, i) {
                        return '<tr class="border-b border-indigo-900">' +
                            '<td class="p-3 font-bold text-ah-muted">' + (i + 1) + '</td>' +
                            '<td class="p-3 font-medium">' + (r.name || '?') + '</td>' +
                            '<td class="p-3 text-ah-muted">[' + (r.tag || '-') + ']</td>' +
                            '<td class="p-3 text-right text-ah-muted">' + (r.duels_played || 0) + '</td>' +
                            '<td class="p-3 text-right font-bold text-green-500">' + (r.duels_won || 0) + '</td>' +
                            '<td class="p-3 text-right font-bold text-red-400">' + (r.duels_lost || 0) + '</td>' +
                            '<td class="p-3 text-right text-amber-400">' + (r.duels_drawn || 0) + '</td>' +
                            '<td class="p-3 text-right font-bold text-amber-400">' + (r.duel_points || 0) + '</td>' +
                            '</tr>';
                    }).join('') +
                    '</tbody></table></div></div>';
            }
        } catch(e) {
            console.error('[Rankings] standings duelos:', e);
            standingsHtml = '<div class="text-center py-6 text-red-400">Error cargando standings: ' + (e.message || e) + '</div>';
        }

        c.innerHTML = listHtml +
            '<h3 class="text-lg font-bold mt-6 mb-3">Clasificacion de Duelos</h3>' +
            standingsHtml;
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
