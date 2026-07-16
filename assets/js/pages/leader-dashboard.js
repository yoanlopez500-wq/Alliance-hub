/**
 * leader-dashboard.js - Panel de lider de alianza
 *
 * Migrado desde leader-dashboard.html como parte de la refactorizacion.
 */
(function() {
    'use strict';

    var myAllianceId = null;
    var myAllianceData = null;
    var initialized = false;

    function statusBadge(status) {
        if (status === 'pending') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">PENDIENTE</span>';
        if (status === 'under_review') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/15 text-blue-500">EN REVISION</span>';
        if (status === 'approved') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-500">APROBADO</span>';
        if (status === 'rejected') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">RECHAZADO</span>';
        return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-white/5 text-slate-400">' + (status || '?') + '</span>';
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
            if (!admin || admin.role !== 'alliance_leader') {
                window.location.href = 'index.html';
                return;
            }
            if (!admin.alliance_id) {
                document.body.innerHTML = '<div class="min-h-screen flex items-center justify-center bg-ah-bg text-ah-text"><div class="text-center"><h2 class="text-xl font-bold mb-2">Sin Alianza Asignada</h2><p class="text-ah-muted">Contacta a un superadmin.</p></div></div>';
                return;
            }
            myAllianceId = admin.alliance_id;
            await loadAllianceData();
            loadMembers();
            loadPendingRequests();
            bindTabs();
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
            var { data: requests, error } = await window.DB.from('alliance_memberships')
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
                        '<div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold bg-indigo-900 text-white">' + (p.current_username ? p.current_username.charAt(0).toUpperCase() : '?') + '</div>' +
                        '<div class="flex-1">' +
                            '<p class="font-bold text-white text-sm">' + (p.current_username || 'Jugador ' + r.player_id) + '</p>' +
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
            await window.DB.from('alliance_memberships').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', membershipId);
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
            await window.DB.from('alliance_memberships').update({ status: 'rejected' }).eq('id', membershipId);
            if (typeof window.showToast === 'function') window.showToast('Rechazada', 'info');
            loadPendingRequests();
        } catch(e) {
            if (typeof window.showToast === 'function') window.showToast('Error: ' + e.message, 'error');
        }
    }

    async function loadMembers() {
        try {
            var { data: memberships, error } = await window.DB.from('alliance_memberships')
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

            container.innerHTML = (players || []).map(function(p) {
                var kd = p.total_deaths > 0 ? (p.total_kills / p.total_deaths).toFixed(2) : p.total_kills || 0;
                return '<div class="rounded-xl p-4 flex items-center gap-4 transition hover:opacity-90 bg-ah-card border border-ah-border">' +
                    '<div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold bg-indigo-900 text-white">' + (p.current_username ? p.current_username.charAt(0).toUpperCase() : '?') + '</div>' +
                    '<div class="flex-1">' +
                        '<p class="font-bold text-white text-sm">' + p.current_username + '</p>' +
                        '<p class="text-xs text-ah-muted">' + (p.games_played || 0) + ' partidas</p>' +
                    '</div>' +
                    '<div class="text-right">' +
                        '<p class="text-sm font-bold text-ah-accent">' + kd + ' K/D</p>' +
                        '<p class="text-xs text-ah-muted">' + (p.total_kills || 0) + 'K / ' + (p.total_deaths || 0) + 'D</p>' +
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
            var { data: memberships, error: mErr } = await window.DB.from('alliance_memberships')
                .select('player_id')
                .eq('alliance_id', myAllianceId)
                .eq('status', 'approved');
            if (mErr) throw mErr;
            if (!memberships || memberships.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">Sin miembros para rankear.</div>';
                return;
            }

            var playerIds = memberships.map(function(m) { return m.player_id; });
            var { data: players, error } = await window.DB.from('players').select('*').in('id', playerIds);
            if (error) throw error;
            if (!players || players.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">Sin datos.</div>';
                return;
            }

            var ranked = players.map(function(p) {
                var kd = p.total_deaths > 0 ? (p.total_kills / p.total_deaths) : (p.total_kills || 0);
                return { player: p, kd: kd, kills: p.total_kills || 0, deaths: p.total_deaths || 0, games: p.games_played || 0 };
            }).sort(function(a, b) { return b.kd - a.kd; });

            container.innerHTML = '<div class="space-y-2">' + ranked.map(function(r, i) {
                var medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : (i + 1) + '.';
                var medalColor = i < 3 ? 'text-yellow-400' : 'text-ah-muted';
                return '<div class="flex items-center gap-3 p-3 rounded-lg bg-white/5">' +
                    '<span class="text-lg font-bold w-8 ' + medalColor + '">' + medal + '</span>' +
                    '<div class="flex-1">' +
                        '<p class="font-bold text-sm text-ah-text">' + r.player.current_username + '</p>' +
                        '<p class="text-xs text-ah-muted">' + r.games + ' partidas</p>' +
                    '</div>' +
                    '<div class="text-right">' +
                        '<p class="text-sm font-bold text-ah-accent">' + r.kd.toFixed(2) + ' K/D</p>' +
                        '<p class="text-xs text-ah-muted">' + r.kills + 'K / ' + r.deaths + 'D</p>' +
                    '</div>' +
                '</div>';
            }).join('') + '</div>';
        } catch(e) {
            console.error('[LeaderDashboard] Error cargando rankings:', e);
            container.innerHTML = '<div class="text-center py-4 text-red-400">Error cargando rankings.</div>';
        }
    }

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
                        '<span class="font-bold text-white">' + d.name + '</span>' +
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
                            '<h3 class="font-bold text-ah-text">' + (m.name || 'Partida') + '</h3>' +
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
        var tabs = ['members', 'requests', 'rankings', 'duels', 'matches'];
        tabs.forEach(function(tab) {
            var btn = document.getElementById('tab-' + tab);
            if (btn) btn.addEventListener('click', function() { switchTab(tab); });
        });
    }

    window.switchTab = function(tab) {
        var tabs = ['members', 'requests', 'rankings', 'duels', 'matches'];
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
    };

    // Exponer funciones globales necesarias
    window.loadMembers = loadMembers;
    window.loadPendingRequests = loadPendingRequests;
    window.approveRequest = approveRequest;
    window.rejectRequest = rejectRequest;

    // Inicializacion robusta
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('ah:dom-ready', init);
    window.addEventListener('ah:loaded', init);
})();
