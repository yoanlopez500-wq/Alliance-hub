window.requireAdmin();
var currentAdminId = null;
var pendingApprove = null;
var pendingReject = null;
var lastGeneratedInviteCode = '';

async function init() {
    try { var s = await window.supabase.auth.getSession(); currentAdminId = s.data.session.user.id; } catch(e){}
    loadRequests();
}

function generateInviteCode() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var result = 'AH';
    for (var i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

// CRITICAL FIX: Properly escape strings for HTML onclick attributes
// Handles: backslashes, single quotes, newlines, carriage returns
function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n').replace(/\r/g, '\\r');
}

async function loadRequests() {
    var list = document.getElementById('requests-list');
    list.innerHTML = '<div class="text-center py-8 text-slate-400">Cargando...</div>';
    try {
        var status = document.getElementById('filter-status').value;
        var q = window.supabase.from('alliance_leader_requests').select('*').order('created_at', { ascending: false });
        if (status !== 'all') q = q.eq('status', status);
        var { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) { list.innerHTML = '<div class="text-center py-8 rounded-xl bg-slate-900 border border-indigo-900 text-slate-400">No hay solicitudes</div>'; return; }
        list.innerHTML = '<div class="space-y-3">' + data.map(function(r) {
            var statusBadge = r.status === 'pending' ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">PENDIENTE</span>' : r.status === 'under_review' ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/15 text-blue-500">EN REVISION</span>' : r.status === 'approved' ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-500">APROBADO</span>' : '<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">RECHAZADO</span>';
            var playerName = r.display_name || 'Jugador ' + r.player_id;
            var actions = '';
            if (r.status === 'pending' || r.status === 'under_review') {
                // CRITICAL FIX: Use escapeAttr() to properly handle newlines, quotes, and backslashes
                var descEscaped = escapeAttr(r.alliance_description || '');
                var nameEscaped = escapeAttr(r.alliance_name);
                var tagEscaped = escapeAttr(r.alliance_tag);
                var playerNameEscaped = escapeAttr(playerName);
                actions = '<div class="flex gap-2 mt-3">' +
                    '<button onclick="openApproveModal(' + r.player_id + ', \'' + nameEscaped + '\', \'' + tagEscaped + '\', \'' + r.id + '\', \'' + descEscaped + '\', \'' + playerNameEscaped + '\')" class="px-3 py-1.5 rounded-lg text-xs font-bold min-h-[32px] bg-green-700 text-white hover:bg-green-600 transition">&#10003; Aprobar</button>' +
                    '<button onclick="openRejectModal(\'' + r.id + '\', \'' + playerNameEscaped + '\', \'' + nameEscaped + '\')" class="px-3 py-1.5 rounded-lg text-xs font-bold min-h-[32px] bg-red-600 text-white hover:bg-red-500 transition">&#10005; Rechazar</button>' +
                    '</div>';
            }
            // Truncate long descriptions for display
            var displayDesc = (r.alliance_description || 'Sin descripcion').substring(0, 120) + ((r.alliance_description && r.alliance_description.length > 120) ? '...' : '');
            return '<div class="rounded-xl p-5 bg-slate-900 border border-indigo-900"><div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2"><div><h3 class="font-bold text-lg text-slate-100">' + r.alliance_name + ' [' + r.alliance_tag + ']</h3><p class="text-sm text-slate-400">Solicitante: ' + playerName + ' (ID: ' + r.player_id + ')</p><p class="text-xs mt-1 text-slate-400">' + displayDesc + '</p></div>' + statusBadge + '</div><p class="text-xs mt-2 text-slate-400">Miembros: ' + (r.member_count || '?') + ' | Discord: ' + (r.discord_handle || '-') + ' | ' + window.formatDate(r.created_at) + '</p>' + actions + '</div>';
        }).join('') + '</div>';
    } catch(e) { console.error('[Requests]', e); list.innerHTML = '<div class="text-center py-8 text-red-400">Error: ' + e.message + '</div>'; }
}

function openApproveModal(playerId, allianceName, allianceTag, requestId, allianceDescription, playerName) {
    pendingApprove = { playerId: playerId, allianceName: allianceName, allianceTag: allianceTag, requestId: requestId, allianceDescription: allianceDescription, playerName: playerName };
    document.getElementById('approve-modal-text').innerHTML =
        'Aprobar a <strong class="text-amber-400">' + playerName + '</strong> como lider de <strong class="text-amber-400">' + allianceName + ' [' + allianceTag + ']</strong>?<br><br>' +
        '<span class="text-slate-400">Se creara la alianza, se asignara como lider y se generara un codigo de invitacion.</span>';
    document.getElementById('approve-modal').classList.add('active');
}

function closeApproveModal() {
    document.getElementById('approve-modal').classList.remove('active');
    pendingApprove = null;
}

async function confirmApprove() {
    if (!pendingApprove) return;
    var playerId = pendingApprove.playerId;
    var allianceName = pendingApprove.allianceName;
    var allianceTag = pendingApprove.allianceTag;
    var requestId = pendingApprove.requestId;
    var allianceDescription = pendingApprove.allianceDescription;
    var playerName = pendingApprove.playerName;
    
    // CRITICAL FIX: closeApproveModal + showToast inside try/catch
    // so any error is properly reported instead of silently failing
    try {
        closeApproveModal();
        window.showToast('Procesando aprobacion...', 'info');

        // 1. Check if alliance already exists
        var { data: existing } = await window.supabase.from('alliances').select('id').eq('name', allianceName).maybeSingle();
        var allianceId;
        if (existing) {
            allianceId = existing.id;
        } else {
            var { data: newAlliance, error: ae } = await window.supabase.from('alliances').insert({
                name: allianceName, tag: allianceTag, description: allianceDescription || '',
                leader_id: playerId, status: 'active'
            }).select('id').single();
            if (ae) throw ae;
            allianceId = newAlliance.id;
        }

        // 2. Update player
        var { error: pe } = await window.supabase.from('players').update({ current_alliance_id: allianceId }).eq('id', playerId);
        if (pe) throw pe;

        // 3. Create alliance_memberships (status='approved', requested_by='leader' per CHECK constraints)
        var { error: me } = await window.supabase.from('alliance_memberships').insert({
            player_id: playerId, alliance_id: allianceId,
            role: 'leader', status: 'approved', requested_by: 'leader'
        });
        if (me) {
            if (me.code === '23505') {
                await window.supabase.from('alliance_memberships').update({ role: 'leader', status: 'approved' }).eq('player_id', playerId).eq('alliance_id', allianceId);
            } else {
                throw me;
            }
        }

        // 4. Mark request approved
        var { data: { session } } = await window.supabase.auth.getSession();
        var { error: re } = await window.supabase.from('alliance_leader_requests').update({
            status: 'approved', reviewed_by: session.user.id, reviewed_at: new Date().toISOString()
        }).eq('id', requestId);
        if (re) throw re;

        // 5. Generate invite code for the new leader (vinculado a player_id y alliance_id)
        var inviteCode = generateInviteCode();
        lastGeneratedInviteCode = inviteCode;
        var { error: ie } = await window.supabase.from('admin_invites').insert({
            code: inviteCode,
            role: 'alliance_leader',
            created_by: session.user.id,
            player_id: playerId,
            alliance_id: allianceId,
            used: false,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });
        if (ie) {
            console.error('[Invite] Error creating invite:', ie);
            window.showToast('Alianza creada pero error al generar codigo de invitacion', 'warning');
            loadRequests();
            return;
        }

        // 6. SHOW invite code modal to admin
        document.getElementById('im-alliance-name').textContent = allianceName;
        document.getElementById('im-player-name').textContent = playerName;
        document.getElementById('im-code').textContent = inviteCode;
        document.getElementById('invite-modal').classList.add('active');

        window.showToast('Solicitud aprobada. Alianza creada y codigo generado.', 'success');
        loadRequests();
    } catch(e) {
        console.error('[confirmApprove]', e);
        window.showToast('Error: ' + (e.message || e), 'error');
    }
}

// ===== MODAL: Invite Code =====
function closeInviteModal() {
    document.getElementById('invite-modal').classList.remove('active');
    lastGeneratedInviteCode = '';
}

function copyInviteCode() {
    if (!lastGeneratedInviteCode) return;
    navigator.clipboard.writeText(lastGeneratedInviteCode).then(function() {
        window.showToast('Codigo copiado al portapapeles', 'success');
    }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = lastGeneratedInviteCode;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        window.showToast('Codigo copiado al portapapeles', 'success');
    });
}

// ===== MODAL: Rechazar =====
function openRejectModal(requestId, playerName, allianceName) {
    pendingReject = { requestId: requestId };
    document.getElementById('reject-modal-text').innerHTML =
        'Rechazar la solicitud de <strong class="text-red-400">' + playerName + '</strong> para liderar <strong class="text-red-400">' + allianceName + '</strong>?';
    document.getElementById('reject-reason-input').value = '';
    document.getElementById('reject-modal').classList.add('active');
}

function closeRejectModal() {
    document.getElementById('reject-modal').classList.remove('active');
    pendingReject = null;
}

async function confirmReject() {
    if (!pendingReject) return;
    var reason = document.getElementById('reject-reason-input').value.trim() || null;
    var requestId = pendingReject.requestId;
    closeRejectModal();
    try {
        var { data: { session } } = await window.supabase.auth.getSession();
        var { error } = await window.supabase.from('alliance_leader_requests').update({
            status: 'rejected', reviewed_by: session.user.id,
            reviewed_at: new Date().toISOString(), rejection_reason: reason
        }).eq('id', requestId);
        if (error) throw error;
        window.showToast('Solicitud rechazada.', 'info');
        loadRequests();
    } catch(e) { window.showToast('Error: ' + (e.message || e), 'error'); }
}

init();
