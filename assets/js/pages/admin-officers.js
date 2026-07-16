var myAllianceId = null;
var myPlayerId = null;

async function initOfficersPage() {
    var admin = await window.getAdminRole();
    if (!admin || admin.role !== 'alliance_leader') {
        window.showToast('Solo líderes de alianza', 'error');
        window.location.href = window.ahPath('index.html');
        return;
    }
    myAllianceId = admin.alliance_id;
    myPlayerId = admin.supremacy_player_id;
    loadOfficers();
    loadStats();
}

async function loadStats() {
    if (!myAllianceId) return;
    var { count: total } = await window.supabase.from('alliance_memberships').select('*', { count: 'exact', head: true }).eq('alliance_id', myAllianceId).eq('status', 'approved');
    var { count: officers } = await window.supabase.from('alliance_officers').select('*', { count: 'exact', head: true }).eq('alliance_id', myAllianceId).eq('role', 'officer');
    var { count: coleaders } = await window.supabase.from('alliance_officers').select('*', { count: 'exact', head: true }).eq('alliance_id', myAllianceId).eq('role', 'co_leader');
    var { count: duels } = await window.supabase.from('matches').select('*', { count: 'exact', head: true }).eq('alliance_id', myAllianceId).eq('match_type', 'duel');

    document.getElementById('stat-total').textContent = total || 0;
    document.getElementById('stat-officers').textContent = officers || 0;
    document.getElementById('stat-coleaders').textContent = coleaders || 0;
    document.getElementById('stat-duels').textContent = duels || 0;
}

async function loadOfficers() {
    if (!myAllianceId) return;
    var { data: officers, error } = await window.supabase.from('alliance_officers')
        .select('*')
        .eq('alliance_id', myAllianceId)
        .order('appointed_at', { ascending: false });

    var tbody = document.getElementById('officers-tbody');
    if (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-400">Error cargando oficiales</td></tr>';
        return;
    }
    if (!officers || officers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500">Sin oficiales nombrados</td></tr>';
        return;
    }

    tbody.innerHTML = officers.map(function(o) {
        var roleBadge = o.role === 'co_leader'
            ? '<span class="text-xs px-2 py-1 rounded font-bold bg-emerald-500/20 text-emerald-400">&#128081; Co-Líder</span>'
            : '<span class="text-xs px-2 py-1 rounded font-bold bg-teal-500/20 text-teal-400">&#11088; Oficial</span>';

        var perms = o.permissions || {};
        var permList = Object.keys(perms).filter(function(k) { return perms[k]; }).map(function(k) {
            var labels = { manage_members: '&#128101; Miembros', create_matches: '&#127918; Partidas', manage_duels: '&#9876;&#65039; Duelos', view_strikes: '&#9889; Strikes', view_reports: '&#128680; Reportes', edit_rules: '&#128220; Reglas', send_notifications: '&#128227; Notif.', manage_officers: '&#11088; Equipo' };
            return labels[k] || k;
        }).join(', ');

        return '<tr class="border-b border-slate-700/50 hover:bg-slate-700/30">' +
            '<td class="p-3"><p class="font-medium text-white">Jugador #' + o.player_id + '</p></td>' +
            '<td class="p-3">' + roleBadge + '</td>' +
            '<td class="p-3 text-slate-300">' + (o.title || '-') + '</td>' +
            '<td class="p-3 text-xs text-slate-400 max-w-[200px] truncate">' + (permList || 'Sin permisos') + '</td>' +
            '<td class="p-3 text-xs text-slate-500">' + window.formatDate(o.appointed_at) + '</td>' +
            '<td class="p-3"><button onclick="removeOfficer(\'' + o.id + '\')" class="px-3 py-1 rounded text-xs font-bold bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition">Remover</button></td>' +
        '</tr>';
    }).join('');
}

async function appointOfficer() {
    var playerId = document.getElementById('off-player-id').value.trim();
    var role = document.getElementById('off-role').value;
    var title = document.getElementById('off-title').value.trim();
    if (!playerId || !myAllianceId) { window.showToast('Completa los campos', 'warning'); return; }

    try {
        var sessionData = await window.supabase.auth.getSession();
        var { error } = await window.supabase.from('alliance_officers').insert({
            alliance_id: myAllianceId,
            player_id: parseInt(playerId),
            role: role,
            title: title || (role === 'co_leader' ? 'Co-Líder' : 'Oficial'),
            appointed_by: sessionData.data.session.user.id,
            permissions: role === 'co_leader' ? {
                manage_members: true, create_matches: true, manage_duels: true,
                view_strikes: true, view_reports: true, edit_rules: true,
                send_notifications: true, manage_officers: false
            } : {
                manage_members: true, create_matches: true, manage_duels: false,
                view_strikes: true, view_reports: true, edit_rules: false,
                send_notifications: false, manage_officers: false
            }
        });
        if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
        window.showToast('&#10003; Oficial nombrado', 'success');
        document.getElementById('off-player-id').value = '';
        document.getElementById('off-title').value = '';
        loadOfficers();
        loadStats();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

async function removeOfficer(officerId) {
    if (!confirm('&#191;Remover a este oficial?')) return;
    try {
        var { error } = await window.supabase.from('alliance_officers').delete().eq('id', officerId);
        if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
        window.showToast('&#10003; Oficial removido', 'success');
        loadOfficers();
        loadStats();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

async function transferLeadership() {
    var newLeaderId = document.getElementById('transfer-player-id').value.trim();
    var reason = document.getElementById('transfer-reason').value.trim();
    if (!newLeaderId || !myAllianceId) { window.showToast('Completa los campos', 'warning'); return; }
    if (!confirm('&#9888; &#191;Estás seguro? Esta acción transfiere el liderazgo PERMANENTEMENTE.')) return;

    try {
        var sessionData = await window.supabase.auth.getSession();
        var adminId = sessionData.data.session.user.id;

        await window.supabase.from('leader_transfer_log').insert({
            alliance_id: myAllianceId,
            from_player_id: myPlayerId,
            to_player_id: parseInt(newLeaderId),
            transferred_by: adminId,
            reason: reason || 'Transferencia de liderazgo'
        });

        await window.supabase.from('alliances').update({ leader_id: parseInt(newLeaderId) }).eq('id', myAllianceId);

        await window.supabase.from('alliance_officers').insert({
            alliance_id: myAllianceId,
            player_id: myPlayerId,
            role: 'co_leader',
            title: 'Fundador',
            appointed_by: adminId
        });

        window.showToast('&#10003; Liderazgo transferido. Serás redirigido...', 'success');
        setTimeout(function() { window.location.href = window.ahPath('index.html'); }, 2000);
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

initOfficersPage();
