window.requireAdmin();
var currentAdminId = null;
var currentAdminRole = null;
var pendingApprove = null;
var pendingReject = null;
var lastGeneratedInviteCode = '';

async function init() {
    try { var s = await window.supabase.auth.getSession(); currentAdminId = s.data.session.user.id; } catch(e){}
    // Cargar el rol del admin para las guardas de permisos en acciones criticas
    try {
        var admin = (typeof window.getAdminRole === 'function') ? await window.getAdminRole() : null;
        currentAdminRole = admin ? admin.role : null;
    } catch(e) { currentAdminRole = null; }
    loadRequests();
}

// Codigo de invitacion robusto: delega en el modulo compartido window.AHInviteCode
// (assets/js/invite-code.js, cargado en SCRIPTS.core). Fallback defensivo inline
// por si el modulo no cargo.
function generateInviteCode() {
    if (window.AHInviteCode && window.AHInviteCode.generate) return window.AHInviteCode.generate();
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I/O/0/1 ambiguos
    var code = 'AH';
    var arr = new Uint8Array(10);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(arr);
    } else {
        for (var i = 0; i < 10; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    for (var j = 0; j < 10; j++) code += chars[arr[j] % chars.length];
    return code;
}

// Guarda de rol: solo superadmin/event_admin pueden ejecutar acciones criticas
// (aprobar, rechazar, regenerar invites). requireAdmin() admite cualquier rol
// de admin_users; aqui se refuerza el permiso en cliente.
function hasLeaderRequestsWriteRole() {
    if (['superadmin', 'event_admin'].indexOf(currentAdminRole) === -1) {
        if (typeof window.showToast === 'function') window.showToast('No tienes permisos para esta acción', 'error');
        return false;
    }
    return true;
}

// Sanitiza texto antes de inyectarlo en innerHTML (anti-XSS)
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"'`]/g, function(c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c];
    });
}

// Escapa valores que van dentro de un string JS en un atributo onclick="...".
// Ademas aplica escapeHtml para neutralizar HTML en el valor resultante.
function escapeAttr(str) {
    if (str == null) return '';
    return escapeHtml(String(str).replace(/\/g, '\\').replace(/'/g, "\'").replace(/\r?\n/g, '\\n').replace(/\r/g, '\\r'));
}

function statusBadge(status) {
    var badges = {
        pending: '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">PENDIENTE</span>',
        under_review: '<span class="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/15 text-blue-500">EN REVISION</span>',
        approved: '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-500">APROBADO</span>',
        rejected: '<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">RECHAZADO</span>'
    };
    return badges[status] || '<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-500/15 text-slate-400">' + escapeHtml(status) + '</span>';
}

/**
 * Determina el estado del invite de lider de un player a partir de sus invites
 * (admin_invites con role='alliance_leader').
 * Devuelve: 'used' | 'valid' | 'expired' | 'missing'
 */
function leaderInviteStatus(invites) {
    if (!invites || invites.length === 0) return 'missing';
    var now = new Date();
    var hasUsed = invites.some(function(i) { return i.used; });
    if (hasUsed) return 'used';
    var hasValid = invites.some(function(i) {
        return !i.used && (!i.expires_at || new Date(i.expires_at) > now);
    });
    return hasValid ? 'valid' : 'expired';
}

function inviteStatusBadge(st) {
    if (st === 'used') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-500">INVITE USADA</span>';
    if (st === 'valid') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/15 text-blue-500">INVITE VALIDA</span>';
    if (st === 'expired') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">INVITE EXPIRADA</span>';
    return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">SIN INVITE</span>';
}

/**
 * Regenera el codigo de invitacion de lider para una solicitud aprobada cuya
 * invite expiro o no existe. Crea una nueva admin_invite (+7 dias) vinculada
 * a la alianza de esa solicitud (buscada por nombre; si no existe, error claro).
 */
async function regenerateInvite(playerId, allianceName, allianceTag) {
    if (!hasLeaderRequestsWriteRole()) return;
    try {
        window.showToast('Generando nuevo codigo de invitacion...', 'info');

        // Buscar la alianza de la solicitud por nombre (fallback: tag)
        var { data: alliance, error: aErr } = await window.supabase.from('alliances')
            .select('id')
            .eq('name', allianceName)
            .maybeSingle();
        if (aErr) throw aErr;
        if (!alliance && allianceTag) {
            var { data: byTag, error: tErr } = await window.supabase.from('alliances')
                .select('id')
                .eq('tag', allianceTag)
                .maybeSingle();
            if (tErr) throw tErr;
            alliance = byTag;
        }
        if (!alliance) {
            window.showToast('Error: no existe la alianza "' + allianceName + '" en el sistema. No se puede regenerar el invite.', 'error');
            return;
        }

        var inviteCode = generateInviteCode();
        var { error: iErr } = await window.supabase.from('admin_invites').insert({
            code: inviteCode,
            role: 'alliance_leader',
            created_by: currentAdminId,
            player_id: playerId,
            alliance_id: alliance.id,
            used: false,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });
        if (iErr) throw iErr;

        window.showToast('Nuevo codigo generado: ' + inviteCode + ' (expira en 7 dias)', 'success');
        loadRequests();
    } catch(e) {
        console.error('[regenerateInvite]', e);
        window.showToast('Error regenerando invite: ' + (e.message || e), 'error');
    }
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

        // Cargar invites de lider para las solicitudes aprobadas (estado + boton regenerar)
        var approvedPlayerIds = data.filter(function(r) { return r.status === 'approved'; }).map(function(r) { return r.player_id; });
        var invitesByPlayer = {};
        if (approvedPlayerIds.length > 0) {
            try {
                var { data: invites, error: invErr } = await window.supabase.from('admin_invites')
                    .select('*')
                    .eq('role', 'alliance_leader')
                    .in('player_id', approvedPlayerIds);
                if (invErr) throw invErr;
                (invites || []).forEach(function(inv) {
                    if (!invitesByPlayer[inv.player_id]) invitesByPlayer[inv.player_id] = [];
                    invitesByPlayer[inv.player_id].push(inv);
                });
            } catch(invEx) { console.error('[Requests] Error cargando invites:', invEx); }
        }

        list.innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' + data.map(function(r) {
            var playerName = r.display_name || 'Jugador ' + r.player_id;
            var displayDesc = (r.alliance_description || 'Sin descripcion');
            if (displayDesc.length > 160) displayDesc = displayDesc.substring(0, 160) + '...';

            var actions = '';
            if (r.status === 'pending' || r.status === 'under_review') {
                var descEscaped = escapeAttr(r.alliance_description || '');
                var nameEscaped = escapeAttr(r.alliance_name);
                var tagEscaped = escapeAttr(r.alliance_tag);
                var playerNameEscaped = escapeAttr(playerName);
                actions = '<div class="flex flex-col sm:flex-row gap-2 mt-4">' +
                    '<button onclick="openApproveModal(' + r.player_id + ', \'' + nameEscaped + '\', \'' + tagEscaped + '\', \'' + r.id + '\', \'' + descEscaped + '\', \'' + playerNameEscaped + '\')" class="flex-1 py-2 rounded-lg text-sm font-bold min-h-[44px] bg-green-700 text-white hover:bg-green-600 transition">&#10003; Aprobar</button>' +
                    '<button onclick="openRejectModal(\'' + r.id + '\', \'' + playerNameEscaped + '\', \'' + nameEscaped + '\')" class="flex-1 py-2 rounded-lg text-sm font-bold min-h-[44px] bg-red-600 text-white hover:bg-red-500 transition">&#10005; Rechazar</button>' +
                    '</div>';
            } else if (r.status === 'approved') {
                // Estado del invite de lider + boton "Regenerar invite" si expiro o no existe
                var invSt = leaderInviteStatus(invitesByPlayer[r.player_id]);
                var regenBtn = '';
                if (invSt === 'expired' || invSt === 'missing') {
                    regenBtn = '<button onclick="regenerateInvite(' + r.player_id + ', \'' + escapeAttr(r.alliance_name) + '\', \'' + escapeAttr(r.alliance_tag) + '\')" class="flex-1 py-2 rounded-lg text-sm font-bold min-h-[44px] bg-indigo-700 text-white hover:bg-indigo-600 transition">&#128273; Regenerar invite</button>';
                }
                actions = '<div class="mt-4 rounded-lg p-3 bg-slate-950 border border-indigo-900 flex flex-col sm:flex-row sm:items-center gap-3">' +
                    '<div class="flex items-center gap-2"><span class="text-xs text-slate-500 uppercase tracking-wider font-bold">Invite:</span>' + inviteStatusBadge(invSt) + '</div>' +
                    (regenBtn ? '<div class="sm:ml-auto flex-1 sm:flex-none">' + regenBtn + '</div>' : '') +
                    '</div>';
            }

            return '<div class="rounded-xl p-5 bg-slate-900 border border-indigo-900 flex flex-col">' +
                '<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">' +
                    '<div class="min-w-0">' +
                        '<h3 class="font-bold text-lg text-slate-100 truncate" title="' + escapeAttr(r.alliance_name) + '">' + escapeHtml(r.alliance_name) + '</h3>' +
                        '<p class="text-sm text-amber-400 font-mono">[' + escapeHtml(r.alliance_tag) + ']</p>' +
                    '</div>' +
                    '<div class="shrink-0">' + statusBadge(r.status) + '</div>' +
                '</div>' +
                '<p class="text-sm text-slate-300 mb-3 line-clamp-3">' + escapeHtml(displayDesc) + '</p>' +
                '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400 mb-4">' +
                    '<div class="rounded-lg p-2 bg-slate-950 border border-indigo-900"><span class="text-slate-500">Solicitante:</span> <span class="text-slate-200">' + escapeHtml(playerName) + '</span></div>' +
                    '<div class="rounded-lg p-2 bg-slate-950 border border-indigo-900"><span class="text-slate-500">ID Jugador:</span> <span class="text-slate-200 font-mono">' + escapeHtml(r.player_id) + '</span></div>' +
                    '<div class="rounded-lg p-2 bg-slate-950 border border-indigo-900"><span class="text-slate-500">Miembros:</span> <span class="text-slate-200">' + escapeHtml(r.member_count || '?') + '</span></div>' +
                    '<div class="rounded-lg p-2 bg-slate-950 border border-indigo-900"><span class="text-slate-500">Discord:</span> <span class="text-slate-200 break-all">' + escapeHtml(r.discord_handle || '-') + '</span></div>' +
                '</div>' +
                '<div class="mt-auto pt-3 border-t border-indigo-900/50 flex items-center justify-between text-xs text-slate-500">' +
                    '<span>Solicitado ' + window.formatDate(r.created_at) + '</span>' +
                    (r.rejection_reason ? '<span class="text-red-400">Motivo: ' + escapeHtml(r.rejection_reason) + '</span>' : '') +
                '</div>' +
                actions +
            '</div>';
        }).join('') + '</div>';
    } catch(e) { console.error('[Requests]', e); list.innerHTML = '<div class="text-center py-8 text-red-400">Error: ' + e.message + '</div>'; }
}

function openApproveModal(playerId, allianceName, allianceTag, requestId, allianceDescription, playerName) {
    pendingApprove = { playerId: playerId, allianceName: allianceName, allianceTag: allianceTag, requestId: requestId, allianceDescription: allianceDescription, playerName: playerName };
    document.getElementById('approve-modal-text').innerHTML =
        'Aprobar a <strong class="text-amber-400">' + escapeHtml(playerName) + '</strong> como lider de <strong class="text-amber-400">' + escapeHtml(allianceName) + ' [' + escapeHtml(allianceTag) + ']</strong>?<br><br>' +
        '<span class="text-slate-400">Se creara la alianza, se asignara como lider y se generara un codigo de invitacion.</span>';
    document.getElementById('approve-modal').classList.add('active');
}

function closeApproveModal() {
    document.getElementById('approve-modal').classList.remove('active');
    pendingApprove = null;
}

async function confirmApprove() {
    if (!hasLeaderRequestsWriteRole()) return;
    if (!pendingApprove) return;
    var playerId = pendingApprove.playerId;
    var allianceName = pendingApprove.allianceName;
    var allianceTag = pendingApprove.allianceTag;
    var requestId = pendingApprove.requestId;
    var allianceDescription = pendingApprove.allianceDescription;
    var playerName = pendingApprove.playerName;

    try {
        closeApproveModal();
        window.showToast('Procesando aprobacion...', 'info');

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

        var { error: pe } = await window.supabase.from('players').update({ current_alliance_id: allianceId }).eq('id', playerId);
        if (pe) throw pe;

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

        var { data: { session } } = await window.supabase.auth.getSession();
        var { error: re } = await window.supabase.from('alliance_leader_requests').update({
            status: 'approved', reviewed_by: session.user.id, reviewed_at: new Date().toISOString()
        }).eq('id', requestId);
        if (re) throw re;

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

function openRejectModal(requestId, playerName, allianceName) {
    pendingReject = { requestId: requestId };
    document.getElementById('reject-modal-text').innerHTML =
        'Rechazar la solicitud de <strong class="text-red-400">' + escapeHtml(playerName) + '</strong> para liderar <strong class="text-red-400">' + escapeHtml(allianceName) + '</strong>?';
    document.getElementById('reject-reason-input').value = '';
    document.getElementById('reject-modal').classList.add('active');
}

function closeRejectModal() {
    document.getElementById('reject-modal').classList.remove('active');
    pendingReject = null;
}

async function confirmReject() {
    if (!hasLeaderRequestsWriteRole()) return;
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
