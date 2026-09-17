/**
 * leader-dashboard.js - Panel de lider de alianza
 *
 * Migrado desde leader-dashboard.html como parte de la refactorizacion.
 *
 * FASE 4: la guarda de acceso ahora permite tambien a superadmin/event_admin
 * vinculados a una alianza (admin_users.alliance_id NOT NULL). En ese caso la
 * alianza de trabajo es admin.alliance_id (mismo camino que los lideres).
 */
(function() {
    'use strict';

    var myAllianceId = null;
    var myAllianceData = null;
    var initialized = false;
    // Estado del ultimo ranking de alianza cargado (re-orden sin refetch al cambiar el modo)
    var lastRankedState = null;

    // Sanitiza texto antes de inyectarlo en innerHTML (anti-XSS).
    // Reusa window.escapeHtml si existe (definido en auth-core.js).
    var escapeHtml = (typeof window.escapeHtml === 'function') ? window.escapeHtml : function(str) {
        if (str == null) return '';
        return String(str).replace(/[&<>"'`]/g, function(c) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c];
        });
    };

    function statusBadge(status) {
        if (status === 'pending') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">PENDIENTE</span>';
        if (status === 'under_review') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/15 text-blue-500">EN REVISION</span>';
        if (status === 'approved') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-500">APROBADO</span>';
        if (status === 'rejected') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">RECHAZADO</span>';
        return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-white/5 text-slate-400">' + escapeHtml(status || '?') + '</span>';
    }

    function formatDateTime(iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    async function init() {
        if (initialized) return;
        initialized = true;

        try {
            var admin = await window.getAdminRole();
            // FASE 4: superadmin/event_admin vinculado a una alianza puede acceder
            // al panel de SU alianza (sin selector; la alianza es admin.alliance_id).
            var isLinkedAdmin = !!(admin && (admin.role === 'superadmin' || admin.role === 'event_admin') && admin.alliance_id);
            if (!admin || (admin.role !== 'alliance_leader' && !isLinkedAdmin)) {
                window.location.href = 'index.html';
                return;
            }
            if (!admin.alliance_id) {
                document.body.innerHTML = '<div class="min-h-screen flex items-center justify-center bg-ah-bg text-ah-text"><div class="text-center"><h2 class="text-xl font-bold mb-2">Sin Alianza Asignada</h2><p class="text-ah-muted">Contacta a un superadmin.</p></div></div>';
                return;
            }
            myAllianceId = admin.alliance_id;
            var cmAlliance = document.getElementById('cm-alliance');
            if (cmAlliance) cmAlliance.value = myAllianceId;
            await loadAllianceData();
            loadMembers();
            loadPendingRequests();
            bindTabs();
            bindCreateMatchModal();
            activateTabFromQuery();
        } catch(e) {
            console.error('[LeaderDashboard] init error:', e);
        }
    }

    async function loadAllianceData() {
        try {
            var { data, error } = await window.DB.from('alliances').select('*').eq('id', myAllianceId).single();
            if (error) throw error;
            if (data) {
                myAllianceData = data;
                var nameEl = document.getElementById('alliance-name');
                var tagEl = document.getElementById('alliance-tag');
                if (nameEl) nameEl.textContent = data.name;
                if (tagEl) tagEl.textContent = '[' + (data.tag || '---') + '] ' + (data.description || '');
            }
        } catch(e) {
            console.error('[LeaderDashboard] Error cargando alianza:', e);
        }
    }

    async function loadPendingRequests() {
        try {
            var { data: requests, error } = await window.DB.from('allianceMemberships')
                .select('*')
                .eq('alliance_id', myAllianceId)
                .eq('status', 'pending')
                .eq('requested_by', 'player')
                .order('requested_at', { ascending: false });
            if (error) throw error;

            var badge = document.getElementById('req-badge');
            var count = requests ? requests.length : 0;
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }

            var container = document.getElementById('requests-list');
            if (!requests || requests.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">No hay solicitudes pendientes.</div>';
                return;
            }

            var playerIds = requests.map(function(r) { return r.player_id; }).filter(Boolean);
            var { data: players } = await window.DB.from('players').select('id, current_username').in('id', playerIds);
            var pm = {};
            (players || []).forEach(function(p) { pm[p.id] = p; });

            container.innerHTML = requests.map(function(r) {
                var p = pm[r.player_id] || {};
                return '<div class="rounded-xl p-4 mb-3 bg-ah-card border border-ah-border">' +
                    '<div class="flex items-center gap-3 mb-3">' +
                        '<div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold bg-indigo-900 text-white">' + (p.current_username ? escapeHtml(p.current_username.charAt(0).toUpperCase()) : '?') + '</div>' +
                        '<div class="flex-1">' +
                            '<p class="font-bold text-white text-sm">' + escapeHtml(p.current_username || 'Jugador ' + r.player_id) + '</p>' +
                            '<p class="text-xs text-ah-muted">Solicitado: ' + window.formatDate(r.requested_at) + '</p>' +
                        '</div>' +
                    '</div>' +
                    '<div class="flex gap-2">' +
                        '<button data-id="' + r.id + '" data-player="' + r.player_id + '" class="approve-btn flex-1 py-2 rounded-lg text-sm font-bold bg-green-500/15 text-green-500 border border-green-500/30 hover:bg-green-500/25 transition">&#10003; Aprobar</button>' +
                        '<button data-id="' + r.id + '" class="reject-btn flex-1 py-2 rounded-lg text-sm font-bold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition">&#10007; Rechazar</button>' +
                    '</div>' +
                '</div>';
            }).join('');

            container.querySelectorAll('.approve-btn').forEach(function(btn) {
                btn.addEventListener('click', function() { approveRequest(btn.getAttribute('data-id'), btn.getAttribute('data-player')); });
            });
            container.querySelectorAll('.reject-btn').forEach(function(btn) {
                btn.addEventListener('click', function() { rejectRequest(btn.getAttribute('data-id')); });
            });
        } catch(e) {
            console.error('[LeaderDashboard] Error cargando solicitudes:', e);
            document.getElementById('requests-list').innerHTML = '<div class="text-center py-8 text-red-400">Error cargando solicitudes.</div>';
        }
    }

    async function approveRequest(membershipId, playerId) {
        try {
            await window.DB.from('allianceMemberships').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', membershipId);
            await window.DB.from('players').update({ current_alliance_id: myAllianceId }).eq('id', playerId);
            if (typeof window.showToast === 'function') window.showToast('Solicitud aprobada!', 'success');
            loadPendingRequests();
            loadMembers();
        } catch(e) {
            if (typeof window.showToast === 'function') window.showToast('Error: ' + e.message, 'error');
        }
    }

    async function rejectRequest(membershipId) {
        if (!confirm('Rechazar solicitud?')) return;
        try {
            await window.DB.from('allianceMemberships').update({ status: 'rejected' }).eq('id', membershipId);
            if (typeof window.showToast === 'function') window.showToast('Rechazada', 'info');
            loadPendingRequests();
        } catch(e) {
            if (typeof window.showToast === 'function') window.showToast('Error: ' + e.message, 'error');
        }
    }

    async function loadValidStats(playerIds) {
        if (!playerIds || playerIds.length === 0) return {};
        var { data: results, error } = await window.supabase.from('match_results')
            .select('player_id, kills, deaths, match_id, matches!inner(match_type)')
            .in('player_id', playerIds)
            .neq('matches.match_type', 'internal');
        if (error) throw error;

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
            if (!stats[r.player_id]) stats[r.player_id] = { kills: 0, deaths: 0, games: 0 };
            stats[r.player_id].kills += (r.kills || 0);
            stats[r.player_id].deaths += (r.deaths || 0);
            stats[r.player_id].games += 1;
        });
        return stats;
    }

    async function loadMembers() {
        try {
            var { data: memberships, error } = await window.DB.from('allianceMemberships')
                .select('player_id')
                .eq('alliance_id', myAllianceId)
                .eq('status', 'approved');
            if (error) throw error;

            var container = document.getElementById('members-list');
            if (!memberships || memberships.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">No hay miembros.</div>';
                return;
            }

            var playerIds = memberships.map(function(m) { return m.player_id; });
            var { data: players, error: pErr } = await window.DB.from('players').select('*').in('id', playerIds).order('current_username');
            if (pErr) throw pErr;
            var stats = await loadValidStats(playerIds);

            container.innerHTML = (players || []).map(function(p) {
                var s = stats[p.id] || { kills: 0, deaths: 0, games: 0 };
                var kd = s.deaths > 0 ? (s.kills / s.deaths).toFixed(2) : s.kills || 0;
                return '<div class="rounded-xl p-4 flex items-center gap-4 transition hover:opacity-90 bg-ah-card border border-ah-border">' +
                    '<div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold bg-indigo-900 text-white">' + (p.current_username ? escapeHtml(p.current_username.charAt(0).toUpperCase()) : '?') + '</div>' +
                    '<div class="flex-1">' +
                        '<p class="font-bold text-white text-sm">' + escapeHtml(p.current_username) + '</p>' +
                        '<p class="text-xs text-ah-muted">' + (s.games || 0) + ' partidas validas</p>' +
                    '</div>' +
                    '<div class="text-right">' +
                        '<p class="text-sm font-bold text-ah-accent">' + kd + ' K/D</p>' +
                        '<p class="text-xs text-ah-muted">' + (s.kills || 0) + 'K / ' + (s.deaths || 0) + 'D</p>' +
                    '</div>' +
                '</div>';
            }).join('');
        } catch(e) {
            console.error('[LeaderDashboard] Error cargando miembros:', e);
            document.getElementById('members-list').innerHTML = '<div class="text-center py-8 text-red-400">Error</div>';
        }
    }

    async function loadAllianceRankings() {
        var container = document.getElementById('rankings-list');
        if (!myAllianceId) return;
        try {
            var { data: memberships, error: mErr } = await window.DB.from('allianceMemberships')
                .select('player_id')
                .eq('alliance_id', myAllianceId)
                .eq('status', 'approved');
            if (mErr) throw mErr;
            if (!memberships || memberships.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">Sin miembros para rankear.</div>';
                return;
            }

            var playerIds = memberships.map(function(m) { return m.player_id; });
            var { data: players, error } = await window.DB.from('players').select('id, current_username').in('id', playerIds);
            if (error) throw error;
            if (!players || players.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">Sin datos.</div>';
                return;
            }

            var stats = await loadValidStats(playerIds);
            var ranked = players.map(function(p) {
                var s = stats[p.id] || { kills: 0, deaths: 0, games: 0 };
                var kd = s.deaths > 0 ? (s.kills / s.deaths) : (s.kills || 0);
                return { player: p, kd: kd, kills: s.kills, deaths: s.deaths, games: s.games };
            });

            // Orden deterministico de 5 niveles con Score Bayesiano C=3
            // (mismo criterio que el ranking publico). Los priors deben ser
            // GLOBALES (toda la poblacion rankeada), no solo de la alianza.
            // ORDER BY player_id: paginacion estable entre requests.
            // Respaldo: si el motor no esta disponible, orden por KD crudo.
            // El modo de orden es SOLO visualizacion: compareBy() decide el
            // comparador segun el selector; el default 'score' es identico
            // al orden historico. En los caminos de respaldo (sin motor) se
            // conserva el orden por KD crudo y el selector no aplica.
            lastRankedState = null;
            if (window.AHRankingScore && window.AHRankingScore.makeBayesScorer) {
                try {
                    var vc = window.DB.tableCols('publicRankings');
                    var popRows = await window.AHRankingScore.fetchAllRows(function(from, to) {
                        return window.DB.from('publicRankings')
                            .select(window.DB.select('publicRankings', 'all'))
                            .order(vc.playerId, { ascending: true })
                            .range(from, to);
                    });
                    var scorer = window.AHRankingScore.makeBayesScorer(popRows, {
                        eff: function(p) { return p[vc.totalKills]; },
                        deaths: function(p) { return p[vc.totalDeaths]; },
                        games: function(p) { return p[vc.gamesPlayed]; }
                    });
                    lastRankedState = {
                        ranked: ranked,
                        acc: {
                            score: function(x) {
                                var denom = x.deaths + scorer.C * scorer.priorD;
                                if (denom <= 0) denom = 1;
                                return (x.kills + scorer.C * scorer.priorK) / denom;
                            },
                            games: function(x) { return x.games; },
                            deaths: function(x) { return x.deaths; },
                            eff: function(x) { return x.kills; },
                            name: function(x) { return x.player.current_username; }
                        }
                    };
                    ranked.sort(window.AHRankingScore.compareRankedPlayers(lastRankedState.acc));
                } catch(e2) {
                    console.error('[LeaderDashboard] Fallback a KD crudo:', e2);
                    ranked.sort(function(a, b) { return b.kd - a.kd; });
                    // Estado sin acc: el selector queda inerte pero el re-render es seguro
                    lastRankedState = { ranked: ranked, acc: null };
                }
            } else {
                ranked.sort(function(a, b) { return b.kd - a.kd; });
            }

            renderAllianceRanked(ranked);
        } catch(e) {
            console.error('[LeaderDashboard] Error cargando rankings:', e);
            container.innerHTML = '<div class="text-center py-4 text-red-400">Error cargando rankings.</div>';
        }
    }

    // Render del ranking de alianza. Si hay estado guardado (camino Bayesiano),
    // re-ordena segun el modo seleccionado; si no, usa el array tal cual
    // (respaldo KD crudo, comportamiento historico).
    function renderAllianceRanked(rankedFallback) {
        var container = document.getElementById('rankings-list');
        if (!container) return;
        var ranked = rankedFallback;
        if (!ranked && !lastRankedState) return;
        if (lastRankedState) {
            if (lastRankedState.acc && window.AHRankingScore) {
                var mode = (window.AHRankingScore.getSavedSortMode) ? window.AHRankingScore.getSavedSortMode() : 'score';
                var sel = document.getElementById('sort-mode');
                if (sel && sel.value !== mode) sel.value = mode;
                var cmp = window.AHRankingScore.compareBy
                    ? window.AHRankingScore.compareBy(mode, lastRankedState.acc)
                    : window.AHRankingScore.compareRankedPlayers(lastRankedState.acc);
                ranked = lastRankedState.ranked.slice().sort(cmp);
            } else {
                // Fallback KD crudo: array ya ordenado, selector inerte
                ranked = lastRankedState.ranked;
            }
        }

        container.innerHTML = '<div class="space-y-2">' + ranked.map(function(r, i) {
            var medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : (i + 1) + '.';
            var medalColor = i < 3 ? 'text-yellow-400' : 'text-ah-muted';
            return '<div class="flex items-center gap-3 p-3 rounded-lg bg-white/5">' +
                '<span class="text-lg font-bold w-8 ' + medalColor + '">' + medal + '</span>' +
                '<div class="flex-1">' +
                    '<p class="font-bold text-sm text-ah-text">' + escapeHtml(r.player.current_username) + '</p>' +
                    '<p class="text-xs text-ah-muted">' + r.games + ' partidas validas</p>' +
                '</div>' +
                '<div class="text-right">' +
                    '<p class="text-sm font-bold text-ah-accent">' + r.kd.toFixed(2) + ' K/D</p>' +
                    '<p class="text-xs text-ah-muted">' + r.kills + 'K / ' + r.deaths + 'D</p>' +
                '</div>' +
            '</div>';
        }).join('') + '</div>';
    }

    // Handler del selector de modo (onchange en leader-dashboard.html)
    function onSortModeChange() {
        var sel = document.getElementById('sort-mode');
        if (sel && window.AHRankingScore && window.AHRankingScore.saveSortMode) {
            window.AHRankingScore.saveSortMode(sel.value);
        }
        renderAllianceRanked(null);
    }
    window.onSortModeChange = onSortModeChange;

    async function loadDuels() {
        var container = document.getElementById('duels-list');
        if (!myAllianceId) {
            container.innerHTML = '<div class="text-center py-8 text-ah-muted">Sin alianza</div>';
            return;
        }
        try {
            var { data: duelsA, error: errA } = await window.DB.from('matches').select('*')
                .eq('alliance_a_id', myAllianceId).eq('match_type', 'duel').order('created_at', { ascending: false });
            var { data: duelsB, error: errB } = await window.DB.from('matches').select('*')
                .eq('alliance_b_id', myAllianceId).eq('match_type', 'duel').order('created_at', { ascending: false });
            if (errA) throw errA;
            if (errB) throw errB;

            var allDuels = [];
            (duelsA || []).forEach(function(d) { allDuels.push(d); });
            (duelsB || []).forEach(function(d) {
                if (!allDuels.find(function(x) { return x.id === d.id; })) allDuels.push(d);
            });

            if (allDuels.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">Sin duelos.</div>';
                return;
            }

            container.innerHTML = allDuels.map(function(d) {
                return '<div class="rounded-xl p-4 mb-3 bg-ah-card border border-ah-border">' +
                    '<div class="flex items-center justify-between mb-2">' +
                        '<span class="font-bold text-white">' + escapeHtml(d.name) + '</span>' +
                        (typeof window.getStatusBadge === 'function' ? window.getStatusBadge(d.status) : d.status) +
                    '</div>' +
                    '<p class="text-xs text-ah-muted">' + window.formatDate(d.created_at) + ' | Max: ' + (d.max_players || '-') + '</p>' +
                '</div>';
            }).join('');
        } catch(e) {
            console.error('[LeaderDashboard] Error cargando duelos:', e);
            container.innerHTML = '<div class="text-center py-8 text-red-400">Error</div>';
        }
    }

    async function loadAllianceMatches() {
        var container = document.getElementById('matches-list');
        if (!myAllianceId) return;
        try {
            var { data: matches, error } = await window.DB.from('matches').select('*')
                .eq('alliance_id', myAllianceId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            if (!matches || matches.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">Sin partidas.</div>';
                return;
            }

            container.innerHTML = matches.map(function(m) {
                var typeBadge = m.match_type === 'duel' ? '<span class="px-2 py-0.5 rounded text-xs font-bold ml-1 bg-red-500/15 text-red-400">DUELO</span>' :
                    m.match_type === 'internal' ? '<span class="px-2 py-0.5 rounded text-xs font-bold ml-1 bg-blue-500/15 text-blue-500">INTERNA</span>' :
                    '<span class="px-2 py-0.5 rounded text-xs font-bold ml-1 bg-purple-500/15 text-purple-400">GLOBAL</span>';
                return '<a href="admin/match-detail.html?id=' + m.id + '" class="block rounded-xl p-4 mb-3 transition hover:opacity-90 bg-ah-card border border-ah-border">' +
                    '<div class="flex items-center justify-between">' +
                        '<div>' +
                            '<h3 class="font-bold text-ah-text">' + escapeHtml(m.name || 'Partida') + '</h3>' +
                            '<p class="text-xs mt-1 text-ah-muted">' + window.formatDate(m.created_at) + ' | Max: ' + (m.max_players || '-') + ' jugadores</p>' +
                        '</div>' +
                        '<div class="flex items-center gap-1">' + (typeof window.getStatusBadge === 'function' ? window.getStatusBadge(m.status) : m.status) + typeBadge + '</div>' +
                    '</div>' +
                '</a>';
            }).join('');
        } catch(e) {
            console.error('[LeaderDashboard] Error cargando partidas:', e);
            container.innerHTML = '<div class="text-center py-4 text-red-400">Error cargando partidas.</div>';
        }
    }

    function bindTabs() {
        var tabs = ['members', 'requests', 'rankings', 'duels', 'matches', 'space'];
        tabs.forEach(function(tab) {
            var btn = document.getElementById('tab-' + tab);
            if (btn) btn.addEventListener('click', function() { switchTab(tab); });
        });
    }

    function bindCreateMatchModal() {
        var openBtn = document.getElementById('btn-open-create-match');
        var closeBtn = document.getElementById('btn-close-create-match');
        var cancelBtn = document.getElementById('btn-cancel-create-match');
        var modal = document.getElementById('create-match-modal');
        var form = document.getElementById('create-match-form');

        if (openBtn) openBtn.addEventListener('click', openCreateMatchModal);
        if (closeBtn) closeBtn.addEventListener('click', closeCreateMatchModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeCreateMatchModal);
        if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeCreateMatchModal(); });
        if (form) form.addEventListener('submit', createMatchFromLeaderPanel);
    }

    function openCreateMatchModal() {
        var modal = document.getElementById('create-match-modal');
        if (modal) modal.classList.add('active');
    }

    function closeCreateMatchModal() {
        var modal = document.getElementById('create-match-modal');
        if (modal) modal.classList.remove('active');
    }

    async function createMatchFromLeaderPanel(e) {
        e.preventDefault();
        if (!myAllianceId) {
            if (typeof window.showToast === 'function') window.showToast('Sin alianza asignada', 'error');
            return;
        }

        var name = document.getElementById('cm-name').value.trim();
        var gameId = document.getElementById('cm-game-id').value.trim() || null;
        var password = document.getElementById('cm-password').value.trim() || null;
        var maxPlayers = parseInt(document.getElementById('cm-max').value) || 31;
        var description = document.getElementById('cm-desc').value.trim() || null;
        // FIX visibilidad: el checkbox ahora significa "Partida publica (visible en el listado)".
        // Las partidas internas NUNCA pueden ser publicas: se fuerza is_private=true.
        var wantsPublic = document.getElementById('cm-allow-external').checked;
        var requireApproval = document.getElementById('cm-require-approval').checked;
        var matchType = (document.getElementById('cm-type') && document.getElementById('cm-type').value) || 'internal';

        if (!name) {
            if (typeof window.showToast === 'function') window.showToast('Nombre obligatorio', 'warning');
            return;
        }

        // Coherencia is_private <-> tipo de partida
        var isPrivate;
        if (matchType === 'internal') {
            isPrivate = true;
            if (wantsPublic && typeof window.showToast === 'function') {
                window.showToast("Las partidas internas no pueden ser públicas. Usa 'Torneo' o 'Amistosa' para partidas visibles.", 'warning');
            }
        } else {
            isPrivate = !wantsPublic;
        }

        try {
            var { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!session || !session.user) throw new Error('No hay sesion activa');

            var { data, error } = await window.DB.from('matches').insert({
                name: name,
                game_id: gameId,
                password: password,
                alliance_id: myAllianceId,
                match_type: matchType,
                max_players: maxPlayers,
                description: description,
                is_private: isPrivate,
                requires_approval: requireApproval,
                status: 'draft',
                created_by: session.user.id
            }).select('id').single();

            if (error) throw error;
            if (!data || !data.id) throw new Error('No se recibio ID de partida');

            if (typeof window.showToast === 'function') window.showToast('Partida interna creada', 'success');
            document.getElementById('create-match-form').reset();
            var cmAlliance = document.getElementById('cm-alliance');
            if (cmAlliance) cmAlliance.value = myAllianceId;
            closeCreateMatchModal();
            window.location.href = 'admin/match-detail.html?id=' + data.id;
        } catch(err) {
            console.error('[LeaderDashboard] Error creando partida:', err);
            if (typeof window.showToast === 'function') window.showToast('Error: ' + (err.message || err), 'error');
        }
    }

    window.switchTab = function(tab) {
        var tabs = ['members', 'requests', 'rankings', 'duels', 'matches', 'space'];
        tabs.forEach(function(t) {
            var panel = document.getElementById('panel-' + t);
            var btn = document.getElementById('tab-' + t);
            if (panel) panel.classList.add('hidden');
            if (btn) {
                btn.classList.remove('border-ah-accent', 'text-ah-accent');
                btn.classList.add('border-transparent', 'text-ah-muted');
            }
        });

        var activePanel = document.getElementById('panel-' + tab);
        var activeBtn = document.getElementById('tab-' + tab);
        if (activePanel) activePanel.classList.remove('hidden');
        if (activeBtn) {
            activeBtn.classList.remove('border-transparent', 'text-ah-muted');
            activeBtn.classList.add('border-ah-accent', 'text-ah-accent');
        }

        if (tab === 'rankings') loadAllianceRankings();
        if (tab === 'duels') loadDuels();
        if (tab === 'matches') loadAllianceMatches();
        if (tab === 'requests') loadPendingRequests();
        if (tab === 'space') loadSpace();
    };

    function activateTabFromQuery() {
        var tab = new URLSearchParams(window.location.search).get('tab');
        if (tab && ['members', 'requests', 'rankings', 'duels', 'matches', 'space'].indexOf(tab) !== -1) {
            switchTab(tab);
        }
    }

    // ===================== MI ESPACIO (Alianzas 2.0) =====================
    // Personalizacion de la pagina publica de la alianza (alliance.html):
    // apariencia (profile jsonb), links de comunidad, tablon de anuncios
    // (alliance_announcements, expiran solos) y reglamento propio
    // (rule_sections con alliance_id). Todo scope a myAllianceId.
    var spaceLoaded = false;
    var spaceProfile = {};
    var LINK_TYPES = [
        { id: 'whatsapp', label: 'WhatsApp' },
        { id: 'discord', label: 'Discord' },
        { id: 'telegram', label: 'Telegram' },
        { id: 'web', label: 'Web' }
    ];

    function toastOk(msg) { if (typeof window.showToast === 'function') window.showToast(msg, 'success'); }
    function toastErr(msg) { if (typeof window.showToast === 'function') window.showToast(msg, 'error'); }

    // kind: 'logo' (512px) | 'banner' (1600px) | 'announcement' (1200px)
    // Comprime a WebP via storage-utils.compressImage antes de subir al bucket.
    async function uploadSpaceImage(file, folder, kind) {
        var maxW = kind === 'logo' ? 512 : (kind === 'banner' ? 1600 : 1200);
        if (file && file.type && file.type.indexOf('image/') === 0 && window.compressImage) {
            try {
                file = await window.compressImage(file, { maxWidth: maxW, quality: 0.75 });
            } catch(e) { console.warn('[Space] compresion fallo, subiendo original:', e); }
        }
        var ext = ((file.name.split('.').pop() || 'png').toLowerCase()).replace(/[^a-z0-9]/g, '') || 'png';
        var path = folder + '/' + myAllianceId + '/' + Date.now() + '.' + ext;
        var up = await window.supabase.storage.from('public-assets').upload(path, file, { upsert: true, contentType: file.type });
        if (up.error) throw up.error;
        return window.supabase.storage.from('public-assets').getPublicUrl(path).data.publicUrl;
    }

    async function loadSpace() {
        if (spaceLoaded || !myAllianceId) return;
        spaceLoaded = true;
        var viewLink = document.getElementById('space-view-page');
        if (viewLink) viewLink.href = 'alliance.html?id=' + myAllianceId;
        try {
            var res = await window.DB.from('alliances').select(window.DB.select('alliances', 'withProfile')).eq('id', myAllianceId).single();
            if (res.error) throw res.error;
            var a = res.data;
            spaceProfile = a.profile || {};
            document.getElementById('sp-desc').value = a.description || '';
            document.getElementById('sp-welcome').value = spaceProfile.welcome_text || '';
            document.getElementById('sp-accent').value = /^#[0-9a-f]{6}$/i.test(spaceProfile.accent_color || '') ? spaceProfile.accent_color : '#ff8f00';
            renderLinkRows(Array.isArray(spaceProfile.community_links) ? spaceProfile.community_links : []);
        } catch(e) { console.error('[Space] perfil:', e); toastErr('Error cargando espacio: ' + e.message); }
        bindSpaceButtons();
        loadAnnouncementsAdmin();
        loadAllianceRulesAdmin();
    }

    // ---- Links de comunidad ----
    function renderLinkRows(links) {
        var c = document.getElementById('sp-links');
        if (!c) return;
        c.innerHTML = links.map(function(l, i) {
            var opts = LINK_TYPES.map(function(t) { return '<option value="' + t.id + '"' + (l.type === t.id ? ' selected' : '') + '>' + t.label + '</option>'; }).join('');
            return '<div class="flex gap-2 items-center" data-link-row="' + i + '">' +
                '<select class="sp-link-type px-2 py-2 rounded-lg text-sm border bg-ah-card text-ah-text border-indigo-900">' + opts + '</select>' +
                '<input type="text" class="sp-link-label px-2 py-2 rounded-lg text-sm ah-input w-28" placeholder="Etiqueta" maxlength="24" value="' + escapeHtml(l.label || '') + '">' +
                '<input type="url" class="sp-link-url flex-1 px-2 py-2 rounded-lg text-sm ah-input" placeholder="https://..." value="' + escapeHtml(l.url || '') + '">' +
                '<button type="button" class="sp-link-del px-2 py-2 rounded-lg text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">X</button>' +
                '</div>';
        }).join('');
        c.querySelectorAll('.sp-link-del').forEach(function(btn) {
            btn.addEventListener('click', function() { btn.parentElement.remove(); });
        });
    }

    function collectLinks() {
        var rows = document.querySelectorAll('#sp-links [data-link-row]');
        var out = [];
        rows.forEach(function(r) {
            var type = r.querySelector('.sp-link-type').value;
            var label = r.querySelector('.sp-link-label').value.trim();
            var url = r.querySelector('.sp-link-url').value.trim();
            if (url && /^https:\/\//i.test(url)) out.push({ type: type, label: label || null, url: url });
        });
        return out.slice(0, 4);
    }

    async function saveSpaceProfile() {
        try {
            var btn = document.getElementById('sp-save-profile');
            btn.disabled = true;
            var logoFile = document.getElementById('sp-logo-file').files[0];
            var bannerFile = document.getElementById('sp-banner-file').files[0];
            if (logoFile) spaceProfile.logo_url = await uploadSpaceImage(logoFile, 'alliance-profiles', 'logo');
            if (bannerFile) spaceProfile.banner_url = await uploadSpaceImage(bannerFile, 'alliance-profiles', 'banner');
            spaceProfile.welcome_text = document.getElementById('sp-welcome').value.trim() || null;
            spaceProfile.accent_color = document.getElementById('sp-accent').value;
            spaceProfile.community_links = collectLinks();
            var res = await window.DB.from('alliances').update({
                description: document.getElementById('sp-desc').value.trim() || null,
                profile: spaceProfile
            }).eq('id', myAllianceId);
            if (res.error) throw res.error;
            toastOk('Espacio guardado');
        } catch(e) { console.error('[Space] guardar:', e); toastErr('Error: ' + (e.message || e)); }
        var btn2 = document.getElementById('sp-save-profile');
        if (btn2) btn2.disabled = false;
    }

    // ---- Tablon de anuncios (gestion) ----
    async function loadAnnouncementsAdmin() {
        var c = document.getElementById('an-list');
        try {
            var res = await window.DB.from('allianceAnnouncements').select('*')
                .eq('alliance_id', myAllianceId)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(50);
            if (res.error) throw res.error;
            var list = res.data || [];
            if (list.length === 0) { c.innerHTML = '<div class="text-center py-4 text-ah-muted text-sm">Sin anuncios aun</div>'; return; }
            c.innerHTML = list.map(function(n) {
                var expired = new Date(n.expires_at) < new Date();
                return '<div class="flex items-center gap-3 rounded-lg p-3 bg-white/[0.03] border border-indigo-900">' +
                    '<div class="flex-1 min-w-0">' +
                    '<div class="flex items-center gap-2 flex-wrap">' +
                    (n.is_pinned ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/15 text-amber-400">FIJADO</span>' : '') +
                    (expired ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-red-500/15 text-red-400">EXPIRADO</span>' : '') +
                    '<span class="font-bold text-sm truncate">' + escapeHtml(n.title) + '</span></div>' +
                    '<div class="text-xs text-ah-muted">Expira: ' + new Date(n.expires_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + '</div>' +
                    '</div>' +
                    '<button type="button" onclick="deleteAnnouncement(\'' + n.id + '\')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30 shrink-0">Borrar</button>' +
                    '</div>';
            }).join('');
        } catch(e) { console.error('[Space] anuncios:', e); if (c) c.innerHTML = '<div class="text-center py-4 text-red-400 text-sm">Error cargando anuncios</div>'; }
    }

    async function publishAnnouncement() {
        var title = document.getElementById('an-title').value.trim();
        if (!title) { toastErr('El titulo es obligatorio'); return; }
        try {
            var btn = document.getElementById('an-publish');
            btn.disabled = true;
            var imageFile = document.getElementById('an-image').files[0];
            var imageUrl = null;
            if (imageFile) imageUrl = await uploadSpaceImage(imageFile, 'announcements', 'announcement');
            var days = parseInt(document.getElementById('an-duration').value) || 30;
            var expires = new Date(Date.now() + days * 86400000).toISOString();
            var res = await window.DB.from('allianceAnnouncements').insert({
                alliance_id: myAllianceId,
                title: title,
                body: document.getElementById('an-body').value.trim() || null,
                image_url: imageUrl,
                is_pinned: document.getElementById('an-pinned').checked,
                expires_at: expires
            });
            if (res.error) throw res.error;
            toastOk('Anuncio publicado');
            document.getElementById('an-title').value = '';
            document.getElementById('an-body').value = '';
            document.getElementById('an-image').value = '';
            document.getElementById('an-pinned').checked = false;
            loadAnnouncementsAdmin();
        } catch(e) { console.error('[Space] publicar:', e); toastErr('Error: ' + (e.message || e)); }
        var btn2 = document.getElementById('an-publish');
        if (btn2) btn2.disabled = false;
    }

    window.deleteAnnouncement = async function(id) {
        if (!confirm('Borrar este anuncio?')) return;
        try {
            var res = await window.DB.from('allianceAnnouncements').delete().eq('id', id).eq('alliance_id', myAllianceId);
            if (res.error) throw res.error;
            toastOk('Anuncio borrado');
            loadAnnouncementsAdmin();
        } catch(e) { toastErr('Error: ' + (e.message || e)); }
    };

    // ---- Reglamento de la alianza (gestion) ----
    async function loadAllianceRulesAdmin() {
        var c = document.getElementById('rl-list');
        try {
            var res = await window.supabase.from('rule_sections')
                .select('id, title, content, order_index')
                .eq('alliance_id', myAllianceId)
                .eq('is_active', true)
                .order('order_index');
            if (res.error) throw res.error;
            var list = res.data || [];
            if (list.length === 0) { c.innerHTML = '<div class="text-center py-4 text-ah-muted text-sm">Sin reglas propias aun</div>'; return; }
            c.innerHTML = list.map(function(r, i) {
                return '<div class="flex items-center gap-3 rounded-lg p-3 bg-white/[0.03] border border-indigo-900">' +
                    '<span class="text-ah-accent font-bold text-sm shrink-0">' + (i + 1) + '.</span>' +
                    '<div class="flex-1 min-w-0"><div class="font-bold text-sm">' + escapeHtml(r.title) + '</div>' +
                    (r.content ? '<div class="text-xs text-ah-muted truncate">' + escapeHtml(r.content) + '</div>' : '') + '</div>' +
                    '<button type="button" onclick="deleteAllianceRule(\'' + r.id + '\')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30 shrink-0">Borrar</button>' +
                    '</div>';
            }).join('');
        } catch(e) { console.error('[Space] reglas:', e); if (c) c.innerHTML = '<div class="text-center py-4 text-red-400 text-sm">Error cargando reglamento</div>'; }
    }

    async function addAllianceRule() {
        var title = document.getElementById('rl-title').value.trim();
        if (!title) { toastErr('El titulo de la regla es obligatorio'); return; }
        try {
            var existing = await window.supabase.from('rule_sections').select('order_index').eq('alliance_id', myAllianceId).order('order_index', { ascending: false }).limit(1);
            var nextOrder = (existing.data && existing.data[0] ? existing.data[0].order_index : 0) + 1;
            var res = await window.supabase.from('rule_sections').insert({
                alliance_id: myAllianceId,
                title: title,
                content: document.getElementById('rl-content').value.trim() || null,
                section_number: String(nextOrder),
                order_index: nextOrder,
                is_active: true,
                visibility: 'public'
            });
            if (res.error) throw res.error;
            toastOk('Regla añadida');
            document.getElementById('rl-title').value = '';
            document.getElementById('rl-content').value = '';
            loadAllianceRulesAdmin();
        } catch(e) { console.error('[Space] add regla:', e); toastErr('Error: ' + (e.message || e)); }
    }

    window.deleteAllianceRule = async function(id) {
        if (!confirm('Borrar esta regla?')) return;
        try {
            var res = await window.supabase.from('rule_sections').delete().eq('id', id).eq('alliance_id', myAllianceId);
            if (res.error) throw res.error;
            toastOk('Regla borrada');
            loadAllianceRulesAdmin();
        } catch(e) { toastErr('Error: ' + (e.message || e)); }
    };

    var spaceBound = false;
    function bindSpaceButtons() {
        if (spaceBound) return;
        spaceBound = true;
        var saveBtn = document.getElementById('sp-save-profile');
        if (saveBtn) saveBtn.addEventListener('click', saveSpaceProfile);
        var addLink = document.getElementById('sp-add-link');
        if (addLink) addLink.addEventListener('click', function() {
            var current = document.querySelectorAll('#sp-links [data-link-row]').length;
            if (current >= 4) { toastErr('Maximo 4 links'); return; }
            var c = document.getElementById('sp-links');
            var links = [];
            c.querySelectorAll('[data-link-row]').forEach(function(r) {
                links.push({ type: r.querySelector('.sp-link-type').value, label: r.querySelector('.sp-link-label').value, url: r.querySelector('.sp-link-url').value });
            });
            links.push({ type: 'whatsapp', label: '', url: '' });
            renderLinkRows(links);
        });
        var pubBtn = document.getElementById('an-publish');
        if (pubBtn) pubBtn.addEventListener('click', publishAnnouncement);
        var rlBtn = document.getElementById('rl-add');
        if (rlBtn) rlBtn.addEventListener('click', addAllianceRule);
    }

    // Exponer funciones globales necesarias
    window.loadMembers = loadMembers;
    window.loadPendingRequests = loadPendingRequests;
    window.approveRequest = approveRequest;
    window.rejectRequest = rejectRequest;
    window.openCreateMatchModal = openCreateMatchModal;

    // Inicializacion robusta
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('ah:dom-ready', init);
    window.addEventListener('ah:loaded', init);
})();
