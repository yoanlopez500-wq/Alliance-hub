// assets/js/auth-core.js v4.1 - Autenticacion, roles, sesiones, notificaciones post-aprobacion
// Depende de: base.js, roles-data.js

// ===================== PERMISOS =====================

function canManage(myRole, targetRole) {
    if (myRole === targetRole) return false;
    return ROLE_HIERARCHY[myRole] > ROLE_HIERARCHY[targetRole];
}

function canView(myRole, targetRole) {
    if (myRole === 'superadmin') return true;
    if (myRole === 'event_admin') return targetRole !== 'superadmin';
    if (myRole === 'moderator') return targetRole === 'moderator' || targetRole === 'officer' || targetRole === 'co_leader' || targetRole === 'alliance_leader';
    if (myRole === 'alliance_leader') return targetRole === 'officer' || targetRole === 'co_leader' || targetRole === 'alliance_leader';
    if (myRole === 'co_leader') return targetRole === 'officer' || targetRole === 'co_leader';
    if (myRole === 'officer') return targetRole === 'officer';
    return false;
}

// ===================== SESION ADMIN =====================

async function isAdmin() {
    try {
        var sessionData = await supabase.auth.getSession();
        return !!sessionData.data.session;
    } catch(e) { return false; }
}

async function getAdminRole() {
    try {
        var sessionData = await supabase.auth.getSession();
        if (!sessionData.data.session) return null;
        var { data: admin } = await supabase.from('admin_users')
            .select('role, alliance_id, status, display_name, supremacy_player_id')
            .eq('id', sessionData.data.session.user.id)
            .single();
        return admin;
    } catch(e) { return null; }
}

async function requireAdmin() {
    try {
        var sessionData = await supabase.auth.getSession();
        if (!sessionData.data.session) { window.location.href = ahPath('admin/login.html'); return; }
        var admin = await getAdminRole();
        if (!admin) { window.location.href = ahPath('index.html'); return; }
        if (admin.status === 'suspended') {
            if (typeof showToast === 'function') showToast('Tu cuenta ha sido suspendida. Contacta al superadmin.', 'error');
            await supabase.auth.signOut();
            window.location.href = ahPath('admin/login.html');
        }
    } catch(e) { window.location.href = ahPath('admin/login.html'); }
}

async function requireRole(roles) {
    try {
        var admin = await getAdminRole();
        if (!admin || roles.indexOf(admin.role) === -1) {
            if (typeof showToast === 'function') showToast('No tienes permiso para acceder aqui', 'error');
            window.location.href = ahPath('index.html');
        }
    } catch(e) { window.location.href = ahPath('index.html'); }
}

async function requireMinRole(minRole) {
    try {
        var admin = await getAdminRole();
        if (!admin || ROLE_HIERARCHY[admin.role] < ROLE_HIERARCHY[minRole]) {
            if (typeof showToast === 'function') showToast('No tienes permiso para acceder aqui', 'error');
            window.location.href = ahPath('index.html');
        }
    } catch(e) { window.location.href = ahPath('index.html'); }
}

function getRoleBadge(role) {
    var badges = {
        superadmin: '<span class="text-[10px] bg-red-500 text-white px-2 py-1 rounded font-bold">SUPERADMIN</span>',
        event_admin: '<span class="text-[10px] bg-blue-500 text-white px-2 py-1 rounded font-bold">ADMIN EVENTOS</span>',
        alliance_leader: '<span class="text-[10px] bg-green-500 text-white px-2 py-1 rounded font-bold">LIDER</span>',
        co_leader: '<span class="text-[10px] bg-emerald-500 text-white px-2 py-1 rounded font-bold">CO-LIDER</span>',
        officer: '<span class="text-[10px] bg-teal-500 text-white px-2 py-1 rounded font-bold">OFICIAL</span>',
        moderator: '<span class="text-[10px] bg-purple-500 text-white px-2 py-1 rounded font-bold">MODERADOR</span>'
    };
    return badges[role] || '<span class="text-[10px] bg-slate-500 text-white px-2 py-1 rounded">' + role + '</span>';
}

// ===================== OFICIALES DE ALIANZA =====================

async function getAllianceOfficerRole(playerId, allianceId) {
    if (!playerId) return null;
    try {
        var { data } = await supabase.from('alliance_officers')
            .select('role, title, permissions')
            .eq('player_id', parseInt(playerId))
            .eq('is_active', true)
            .maybeSingle();
        if (data) return data;
        if (allianceId) {
            var { data: mem } = await supabase.from('alliance_memberships')
                .select('role')
                .eq('player_id', parseInt(playerId))
                .eq('alliance_id', allianceId)
                .eq('status', 'approved')
                .maybeSingle();
            if (mem && (mem.role === 'officer' || mem.role === 'co_leader')) {
                return { role: mem.role, title: mem.role === 'co_leader' ? 'Co-Lider' : 'Oficial', permissions: null };
            }
        }
        return null;
    } catch(e) { return null; }
}

async function isAllianceOfficer() {
    var playerData = (typeof getPlayerData === 'function') ? getPlayerData() : {};
    if (!playerData || !playerData.playerId) return null;
    return getAllianceOfficerRole(playerData.playerId, playerData.allianceId);
}

async function resolveUserVisibilityRole() {
    try {
        var admin = await getAdminRole();
        if (admin) {
            if (admin.role === 'superadmin') return 'superadmin';
            if (admin.role === 'event_admin') return 'admin';
            if (admin.role === 'moderator') return 'admin';
            if (admin.role === 'alliance_leader') return 'leader';
        }
    } catch(e) {}
    var officer = await isAllianceOfficer();
    if (officer) {
        if (officer.role === 'co_leader') return 'leader';
        return 'official';
    }
    if (hasPlayerSession()) return 'player';
    return 'public';
}

function canSeeRuleSection(userRole, sectionVisibility) {
    var order = { public: 0, player: 1, official: 2, leader: 3, admin: 4, superadmin: 5 };
    var userLevel = order[userRole] || 0;
    var sectionLevel = order[sectionVisibility] || 0;
    return userLevel >= sectionLevel;
}

// ===================== LOGIN / LOGOUT =====================

async function login(email, password) {
    var result = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (result.error) { console.error('Login error:', result.error); return false; }
    return true;
}

async function logout() {
    if (window.__ahNotifInterval) { clearInterval(window.__ahNotifInterval); window.__ahNotifInterval = null; }
    await supabase.auth.signOut();
    if (hasPlayerSession()) {
        window.location.href = ahPath('dashboard.html');
    } else {
        window.location.href = ahPath('login.html');
    }
}

async function logoutAll() {
    if (window.__ahNotifInterval) { clearInterval(window.__ahNotifInterval); window.__ahNotifInterval = null; }
    if (typeof clearPlayerData === 'function') clearPlayerData();
    if (typeof clearModePreference === 'function') clearModePreference();
    await supabase.auth.signOut();
    window.location.href = ahPath('index.html');
}

async function switchToPlayerMode() {
    if (!hasPlayerSession()) { window.location.href = ahPath('login-player.html'); return; }
    if (typeof setModePreference === 'function') setModePreference('player');
    window.location.href = ahPath('dashboard.html');
}

async function switchToAdminMode() {
    try {
        var admin = await getAdminRole();
        if (!admin) { window.location.href = ahPath('login.html'); return; }
        if (typeof setModePreference === 'function') setModePreference('admin');
        var target = admin.role === 'alliance_leader' ? 'leader-dashboard.html' : 'admin/index.html';
        window.location.href = ahPath(target);
    } catch(e) { window.location.href = ahPath('login.html'); }
}

function playerLogout() {
    if (typeof clearPlayerData === 'function') clearPlayerData();
    if (typeof clearModePreference === 'function') clearModePreference();
    isAdmin().then(function(isAdmin) {
        if (isAdmin) window.location.href = ahPath('admin/index.html');
        else window.location.href = ahPath('index.html');
    });
}

// ===================== AUTH HELPERS =====================

async function sendPasswordReset(email) {
    var { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.__AH_BASE_PATH + 'reset-password.html'
    });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'Revisa tu email para el enlace de recuperacion' };
}

async function updatePassword(newPassword) {
    var { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'Contrasena actualizada' };
}

async function signupWithInvite(email, password, inviteCode, supremacyId, displayName) {
    var normalizedCode = inviteCode.trim().toUpperCase();
    if (!normalizedCode || !/^AH[A-Z0-9]{6}$/.test(normalizedCode)) {
        return { success: false, message: 'Formato de codigo invalido. Debe ser AH + 6 caracteres.' };
    }
    var inviteResult = await supabase.from('admin_invites').select('*')
        .eq('code', normalizedCode)
        .eq('used', false);
    if (inviteResult.error) return { success: false, message: 'Error verificando codigo: ' + inviteResult.error.message };
    if (!inviteResult.data || inviteResult.data.length === 0) return { success: false, message: 'Codigo de invitacion invalido o ya usado' };
    var invite = inviteResult.data[0];
    if (new Date(invite.expires_at) < new Date()) return { success: false, message: 'Codigo de invitacion expirado' };
    if (!invite.role) return { success: false, message: 'Codigo de invitacion corrupto (sin rol asignado). Contacta al superadmin.' };
    var sid = parseInt(supremacyId);
    if (isNaN(sid)) return { success: false, message: 'ID de jugador invalido' };
    var { data: player, error: playerErr } = await supabase.from('players')
        .select('id, current_username')
        .eq('id', sid)
        .maybeSingle();
    if (playerErr) return { success: false, message: 'Error buscando jugador: ' + playerErr.message };
    if (!player) {
        var { error: insertPlayerError } = await supabase.from('players').insert({
            id: sid, current_username: displayName || ('Jugador ' + sid), status: 'active'
        });
        if (insertPlayerError) return { success: false, message: 'Error creando jugador: ' + insertPlayerError.message };
    }
    var authResult = await supabase.auth.signUp({ email: email, password: password });
    if (authResult.error) return { success: false, message: authResult.error.message };
    var user = authResult.data.user;
    if (!user) return { success: false, message: 'No se pudo crear el usuario. Revisa tu email para confirmacion.' };
    var { error: adminError } = await supabase.from('admin_users').insert({
        id: user.id, role: invite.role, display_name: displayName,
        supremacy_player_id: sid, approved_by: invite.created_by,
        approved_at: new Date().toISOString(), status: 'active'
    });
    if (adminError) {
        console.error('[signupWithInvite] Error creando admin_user:', adminError);
        return { success: false, message: 'Error creando admin: ' + adminError.message + '. Contacta al superadmin.' };
    }
    var { error: inviteUpdateErr } = await supabase.from('admin_invites').update({
        used: true, used_by: user.id, used_at: new Date().toISOString()
    }).eq('id', invite.id);
    if (inviteUpdateErr) console.error('[signupWithInvite] Error marcando invite como usado:', inviteUpdateErr);
    return { success: true, message: 'Cuenta de ' + invite.role + ' creada exitosamente.' };
}

// ===================== PLAYER SESSION =====================

function hasPlayerSession() {
    return !!localStorage.getItem('ah_v2_player_id') && !!localStorage.getItem('ah_v2_player_token');
}

function hasAdminSession() {
    return supabase.auth.getSession().then(function(r) { return !!r.data.session; }).catch(function() { return false; });
}

async function generatePlayerToken(playerId, displayName) {
    try {
        var { data: existing } = await supabase.from('players').select('id, current_username').eq('id', playerId).maybeSingle();
        var pid = parseInt(playerId);
        if (existing) {
            await supabase.from('players').update({ current_username: displayName, last_seen: new Date().toISOString() }).eq('id', pid);
        } else {
            var { error: insertErr } = await supabase.from('players').insert({ id: pid, current_username: displayName, status: 'active' });
            if (insertErr) return { success: false, message: insertErr.message };
        }
        var token = 'ah_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
        var { error: tokenErr } = await supabase.from('player_tokens').upsert({ player_id: pid, token: token }, { onConflict: 'player_id' });
        if (tokenErr) return { success: false, message: tokenErr.message };
        return { success: true, token: token };
    } catch(e) { return { success: false, message: e.message }; }
}

async function verifyPlayerToken(playerId, token) {
    try {
        var { data } = await supabase.from('player_tokens').select('token').eq('player_id', parseInt(playerId)).eq('token', token).maybeSingle();
        return !!data;
    } catch(e) { return false; }
}

async function verifyPlayerLogin(playerId, token) {
    try {
        var { data } = await supabase.from('player_tokens').select('token').eq('player_id', parseInt(playerId)).eq('token', token).maybeSingle();
        return !!data;
    } catch(e) { return false; }
}

// ===================== MATCH OPERATIONS =====================

async function registerForMatch(matchId) {
    var playerData = (typeof getPlayerData === 'function') ? getPlayerData() : {};
    if (!playerData || !playerData.playerId) { showToast('Inicia sesion como jugador primero', 'error'); return; }
    try {
        var { error } = await supabase.from('match_registrations').insert({ match_id: matchId, player_id: parseInt(playerData.playerId) });
        if (error) { showToast('Error: ' + error.message, 'error'); return; }
        showToast('Registrado en la partida', 'success');
        setTimeout(function(){location.reload()},500);
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function unregisterFromMatch(matchId) {
    var playerData = (typeof getPlayerData === 'function') ? getPlayerData() : {};
    if (!playerData || !playerData.playerId) return;
    try {
        var { error } = await supabase.from('match_registrations').delete().eq('match_id', matchId).eq('player_id', parseInt(playerData.playerId));
        if (error) { showToast('Error: ' + error.message, 'error'); return; }
        showToast('Desregistrado de la partida', 'success');
        setTimeout(function(){location.reload()},500);
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function getPlayerMatches() {
    var playerData = (typeof getPlayerData === 'function') ? getPlayerData() : {};
    if (!playerData || !playerData.playerId) return [];
    try {
        var { data } = await supabase.from('match_registrations').select('match_id').eq('player_id', parseInt(playerData.playerId));
        return data || [];
    } catch(e) { return []; }
}

// ===================== TRANSFERENCIA =====================

async function generateTransferCode() {
    var playerData = (typeof getPlayerData === 'function') ? getPlayerData() : {};
    if (!playerData || !playerData.playerId) return null;
    try {
        var { data, error } = await supabase.rpc('generate_transfer_code', { p_player_id: parseInt(playerData.playerId) });
        if (error) throw error;
        return data;
    } catch(e) { return null; }
}

async function transferPlayerWithCode(code) {
    var playerData = (typeof getPlayerData === 'function') ? getPlayerData() : {};
    if (!playerData || !playerData.playerId) return { success: false, message: 'No hay sesion de jugador' };
    try {
        var { data, error } = await supabase.rpc('transfer_player', { p_player_id: parseInt(playerData.playerId), p_transfer_code: code });
        if (error) return { success: false, message: error.message };
        return { success: true, message: 'Transferencia completada' };
    } catch(e) { return { success: false, message: e.message }; }
}

// ===================== PUSH NOTIFICATIONS =====================

function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
    return outputArray;
}

async function subscribeToPushNotifications() {
    try {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY) });
        var subJson = JSON.parse(JSON.stringify(sub));
        await supabase.from('push_subscriptions').upsert({
            endpoint: subJson.endpoint,
            p256dh: subJson.keys ? subJson.keys.p256dh : null,
            auth: subJson.keys ? subJson.keys.auth : null,
            player_id: (typeof getPlayerData === 'function') ? parseInt(getPlayerData().playerId) : null
        }, { onConflict: 'endpoint' });
        localStorage.setItem('ah_v2_push_subscribed', 'true');
        return true;
    } catch(e) { console.error('Push error:', e); return false; }
}

async function unsubscribePush() {
    try {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        if (sub) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.toJSON().endpoint);
            await sub.unsubscribe();
        }
        localStorage.removeItem('ah_v2_push_subscribed');
        return true;
    } catch(e) { return false; }
}

// ===================== NOTIFICACION POST-APROBACION =====================

var __leaderBannerChecked = false;

async function checkPendingLeaderApproval() {
    if (__leaderBannerChecked) return;
    __leaderBannerChecked = true;

    console.log('[checkPendingLeaderApproval] Starting check...');

    var playerData = (typeof getPlayerData === 'function') ? getPlayerData() : null;
    if (!playerData || !playerData.playerId) {
        console.log('[checkPendingLeaderApproval] No player session found');
        return;
    }

    try {
        var playerId = parseInt(playerData.playerId);
        console.log('[checkPendingLeaderApproval] Checking player_id:', playerId);

        var now = new Date().toISOString();
        var { data: invite, error } = await supabase
            .from('admin_invites')
            .select('code, role, alliance_id')
            .eq('player_id', playerId)
            .eq('used', false)
            .or('expires_at.gt.' + now + ',expires_at.is.null')
            .maybeSingle();

        if (error) {
            console.error('[checkPendingLeaderApproval] Query error:', error);
            return;
        }
        if (!invite) {
            console.log('[checkPendingLeaderApproval] No pending invite for player', playerId);
            return;
        }

        console.log('[checkPendingLeaderApproval] Found invite:', invite.code);

        var allianceName = 'tu alianza';
        if (invite.alliance_id) {
            try {
                var { data: alliance } = await supabase.from('alliances')
                    .select('name')
                    .eq('id', invite.alliance_id)
                    .maybeSingle();
                if (alliance && alliance.name) allianceName = alliance.name;
            } catch(e) { console.log('[checkPendingLeaderApproval] Could not fetch alliance name:', e); }
        }

        var lastShownCode = null;
        try { lastShownCode = localStorage.getItem('ah_leader_banner_shown'); } catch(e) {}
        if (lastShownCode === invite.code) {
            console.log('[checkPendingLeaderApproval] Banner already shown for', invite.code);
            return;
        }

        showLeaderApprovalBanner(invite.code, allianceName);
    } catch(e) {
        console.error('[checkPendingLeaderApproval] Exception:', e);
    }
}

function showLeaderApprovalBanner(code, allianceName) {
    if (window.location.pathname.indexOf('register/leader') !== -1) return;

    var banner = document.createElement('div');
    banner.id = 'leader-approval-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:rgba(17,24,58,0.98);border-bottom:2px solid #ff8f00;padding:12px 16px;font-family:"Inter",system-ui,sans-serif;';

    banner.innerHTML =
        '<div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:22px;">&#127941;</span>' +
                '<div>' +
                    '<p style="margin:0;font-weight:700;color:#ff8f00;font-size:14px;">¡Tu solicitud fue aprobada!</p>' +
                    '<p style="margin:2px 0 0;color:#9fa8da;font-size:12px;">Eres el lider de <strong style="color:#ff8f00;">' + escapeHtml(allianceName) + '</strong>. Completa tu registro para acceder al panel.</p>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<button onclick="dismissLeaderBanner(\'' + code + '\')" style="background:transparent;border:1px solid #1a237e;color:#9fa8da;padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-weight:600;">&#10005; Cerrar</button>' +
                '<button onclick="goToLeaderSignup(\'' + code + '\')" style="background:linear-gradient(135deg,#ff6f00,#ff8f00);border:none;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:700;">Completar Registro &#8594;</button>' +
            '</div>' +
        '</div>';

    document.body.prepend(banner);

    banner.style.transform = 'translateY(-100%)';
    banner.style.transition = 'transform 0.4s ease-out';
    requestAnimationFrame(function() {
        banner.style.transform = 'translateY(0)';
    });

    console.log('[showLeaderApprovalBanner] Banner shown for', code);
}

function dismissLeaderBanner(code) {
    try { localStorage.setItem('ah_leader_banner_shown', code); } catch(e) {}
    var banner = document.getElementById('leader-approval-banner');
    if (banner) {
        banner.style.transform = 'translateY(-100%)';
        setTimeout(function() { banner.remove(); }, 400);
    }
}

function goToLeaderSignup(code) {
    window.location.href = ahPath('register/leader.html?code=' + encodeURIComponent(code));
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// FIX: Esperar a DOMContentLoaded antes de ejecutar checkPendingLeaderApproval
// Esto asegura que el body exista y que todas las dependencias esten cargadas
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(checkPendingLeaderApproval, 200);
    });
} else {
    setTimeout(checkPendingLeaderApproval, 200);
}

window.canManage = canManage;
window.canView = canView;
window.isAdmin = isAdmin;
window.getAdminRole = getAdminRole;
window.requireAdmin = requireAdmin;
window.requireRole = requireRole;
window.requireMinRole = requireMinRole;
window.getRoleBadge = getRoleBadge;
window.getAllianceOfficerRole = getAllianceOfficerRole;
window.isAllianceOfficer = isAllianceOfficer;
window.resolveUserVisibilityRole = resolveUserVisibilityRole;
window.canSeeRuleSection = canSeeRuleSection;
window.login = login;
window.logout = logout;
window.logoutAll = logoutAll;
window.switchToPlayerMode = switchToPlayerMode;
window.switchToAdminMode = switchToAdminMode;
window.playerLogout = playerLogout;
window.sendPasswordReset = sendPasswordReset;
window.updatePassword = updatePassword;
window.signupWithInvite = signupWithInvite;
window.hasPlayerSession = hasPlayerSession;
window.hasAdminSession = hasAdminSession;
window.generatePlayerToken = generatePlayerToken;
window.verifyPlayerToken = verifyPlayerToken;
window.verifyPlayerLogin = verifyPlayerLogin;
window.registerForMatch = registerForMatch;
window.unregisterFromMatch = unregisterFromMatch;
window.getPlayerMatches = getPlayerMatches;
window.generateTransferCode = generateTransferCode;
window.transferPlayerWithCode = transferPlayerWithCode;
window.subscribeToPushNotifications = subscribeToPushNotifications;
window.unsubscribePush = unsubscribePush;
window.checkPendingLeaderApproval = checkPendingLeaderApproval;
window.showLeaderApprovalBanner = showLeaderApprovalBanner;
window.dismissLeaderBanner = dismissLeaderBanner;
window.goToLeaderSignup = goToLeaderSignup;
