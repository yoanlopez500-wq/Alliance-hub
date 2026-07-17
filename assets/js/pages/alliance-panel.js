/**
 * alliance-panel.js - Panel de alianza para jugadores (alliance-panel.html)
 *
 * Extraido de alliance-panel.html como parte de la refactorizacion al sistema de loader/cache-buster.
 */
(function() {
    'use strict';

    var playerData = (typeof window.getPlayerData === 'function') ? window.getPlayerData() : {};
    if (!playerData || !playerData.playerId) { window.location.href = 'login-player.html'; }
    var myAllianceId = null;
    var myMembershipId = null;
    var allianceMap = {};

    async function init() {
        try {
            var { data: all, error: allErr } = await window.DB.from('alliances').select(window.DB.select('alliances', 'basic'));
            if (allErr) throw allErr;
            (all || []).forEach(function(a) { allianceMap[a.id] = a; });
        } catch(e) { console.error('[AlliancePanel] Error cargando alliances:', e); }
        try {
            var ac = window.DB.tableCols('allianceMemberships');
            var { data: membership, error: mErr } = await window.DB.from('allianceMemberships').select('*').eq(ac.playerId, parseInt(playerData.playerId)).maybeSingle();
            if (mErr && mErr.code !== 'PGRST116') throw mErr;
            if (!membership) {
                document.getElementById('join-section').classList.remove('hidden');
                document.getElementById('alliance-header').innerHTML = '<div class="rounded-2xl p-8 text-center" style="background:#11183a;border:1px solid #1a237e;"><div class="text-5xl mb-4">&#127988;</div><h1 class="text-3xl font-bold">Sin Alianza</h1><p class="mt-2" style="color:#9fa8da;">Unete a una alianza para competir en equipo</p></div>';
                loadAlliancesToJoin(); return;
            }
            myMembershipId = membership[window.DB.tableCols('allianceMemberships').id];
            myAllianceId = membership[window.DB.tableCols('allianceMemberships').allianceId];
            var status = membership[window.DB.tableCols('allianceMemberships').status];
            if (status === 'pending') { document.getElementById('pending-section').classList.remove('hidden'); return; }
            if (status === 'rejected') { document.getElementById('rejected-section').classList.remove('hidden'); return; }
            if (status === 'approved') {
                document.getElementById('approved-content').classList.remove('hidden');
                loadAllianceHeader(allianceMap[myAllianceId]);
                loadAllianceMatches(); loadAllianceMembers();
            }
        } catch(e) { console.error('[AlliancePanel] Error:', e); }
    }

    async function loadAllianceHeader(alliance) {
        if (!alliance) return;
        document.getElementById('alliance-header').innerHTML = '<div class="rounded-2xl p-8 text-center" style="background:#11183a;border:1px solid #1a237e;"><div class="text-5xl mb-4">&#127988;</div><h1 class="text-3xl font-bold">' + alliance.name + '</h1><p class="mt-2" style="color:#9fa8da;">[' + alliance.tag + '] ' + (alliance.description || '') + '</p></div>';
    }

    async function loadAlliancesToJoin() {
        var container = document.getElementById('alliances-list');
        var alliances = Object.values(allianceMap);
        if (alliances.length === 0) { container.innerHTML = '<div class="text-center py-4" style="color:#9fa8da;">No hay alianzas disponibles</div>'; return; }
        container.innerHTML = alliances.map(function(a) {
            return '<div class="flex items-center justify-between p-3 rounded-lg" style="background:rgba(255,255,255,0.03);border:1px solid #1a237e;"><div><span class="font-bold">' + a.name + '</span><span class="text-xs ml-2" style="color:#9fa8da;">[' + a.tag + ']</span></div><button onclick="requestJoin(\'' + a.id + '\')" class="px-3 py-1.5 rounded-lg text-sm font-bold" style="background:linear-gradient(135deg,#ff6f00,#ff8f00);color:#fff;">Solicitar</button></div>';
        }).join('');
    }

    window.requestJoin = async function(allianceId) {
        try {
            var ac = window.DB.tableCols('allianceMemberships');
            var { error } = await window.DB.from('allianceMemberships').insert({ [ac.playerId]: parseInt(playerData.playerId), [ac.allianceId]: allianceId, [ac.status]: 'pending' });
            if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
            window.showToast('Solicitud enviada', 'success');
            setTimeout(function(){ location.reload(); }, 1500);
        } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
    };

    window.cancelRequest = async function() {
        if (!myMembershipId) return;
        try {
            var { error } = await window.DB.from('allianceMemberships').delete().eq('id', myMembershipId);
            if (error) throw error;
            window.showToast('Solicitud cancelada', 'success');
            setTimeout(function(){ location.reload(); }, 1000);
        } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
    };

    window.clearRejectedAndShowJoin = function() {
        if (!myMembershipId) return;
        window.DB.from('allianceMemberships').delete().eq('id', myMembershipId).then(function(){ location.reload(); });
    };

    async function loadAllianceMatches() {
        if (!myAllianceId) return;
        try {
            var mc = window.DB.tableCols('matches');
            var { data: matches } = await window.DB.from('matches').select(window.DB.select('matches', 'basic')).eq(mc.allianceId, myAllianceId).eq(mc.isPrivate, false).order(mc.createdAt, { ascending: false }).limit(10);
            var container = document.getElementById('alliance-matches');
            if (!matches || matches.length === 0) { container.innerHTML = '<div class="text-center py-8" style="color:#9fa8da;">Sin partidas aun</div>'; return; }
            container.innerHTML = matches.map(function(m) {
                return '<div class="rounded-xl p-4" style="background:#11183a;border:1px solid #1a237e;"><div class="flex items-center justify-between"><div><div class="flex items-center gap-2 mb-1">' + window.getStatusBadge(m[mc.status]) + ' ' + window.getTypeBadge(m[mc.matchType]) + '</div><h3 class="font-bold">' + m[mc.name] + '</h3></div><a href="game.html?id=' + m[mc.id] + '" class="px-3 py-1.5 rounded-lg text-sm font-bold" style="background:linear-gradient(135deg,#ff6f00,#ff8f00);color:#fff;">Ver</a></div></div>';
            }).join('');
        } catch(e) { console.error('[AlliancePanel] Error partidas:', e); }
    }

    async function loadAllianceMembers() {
        if (!myAllianceId) return;
        try {
            var ac = window.DB.tableCols('allianceMemberships');
            var { data: memberships } = await window.DB.from('allianceMemberships').select(ac.playerId).eq(ac.allianceId, myAllianceId).eq(ac.status, 'approved');
            if (!memberships || memberships.length === 0) { document.getElementById('alliance-members').innerHTML = '<div class="text-center py-4 col-span-full" style="color:#9fa8da;">Sin miembros</div>'; return; }
            var playerIds = memberships.map(function(m){ return m[ac.playerId]; });
            var pc = window.DB.tableCols('players');
            var { data: players } = await window.DB.from('players').select([pc.id, pc.currentUsername, pc.lastSeen, pc.status].join(', ')).in(pc.id, playerIds);
            var container = document.getElementById('alliance-members');
            if (!players || players.length === 0) { container.innerHTML = '<div class="text-center py-4 col-span-full" style="color:#9fa8da;">Sin miembros</div>'; return; }
            container.innerHTML = players.map(function(p) {
                var isOnline = p[pc.lastSeen] && (new Date() - new Date(p[pc.lastSeen])) < 300000;
                return '<div class="rounded-xl p-4 text-center" style="background:#11183a;border:1px solid #1a237e;"><div class="text-2xl mb-2">&#128100;</div><p class="font-bold text-sm">' + p[pc.currentUsername] + '</p><div class="flex items-center justify-center gap-1 mt-2"><span class="w-2 h-2 rounded-full ' + (isOnline ? 'bg-green-500' : 'bg-gray-500') + '"></span><span class="text-xs" style="color:#9fa8da;">' + (isOnline ? 'Online' : 'Offline') + '</span></div></div>';
            }).join('');
        } catch(e) { console.error('[AlliancePanel] Error miembros:', e); }
    }

    init();
})();
