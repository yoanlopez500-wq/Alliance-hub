/**
 * apply-leader.js - Logica de solicitud de liderazgo de alianza
 *
 * Migrado desde apply-leader.html como parte de la refactorizacion.
 * Requiere sesion de jugador. Si no hay sesion, redirige a login-player.html.
 */
(function() {
    'use strict';

    var initialized = false;

    function requirePlayerSession() {
        var playerData = (typeof window.getPlayerData === 'function') ? window.getPlayerData() : null;
        if (!playerData || !playerData.playerId) {
            try {
                localStorage.setItem('ah_redirect_after_login', 'apply-leader.html');
            } catch(e) {}
            window.location.href = 'login-player.html?redirect=apply-leader.html';
            return null;
        }
        return playerData;
    }

    function statusBadge(status) {
        if (status === 'pending') return '<span class="px-2 py-1 rounded text-xs font-bold bg-amber-500/15 text-amber-400">PENDIENTE</span>';
        if (status === 'under_review') return '<span class="px-2 py-1 rounded text-xs font-bold bg-blue-500/15 text-blue-500">EN REVISION</span>';
        if (status === 'approved') return '<span class="px-2 py-1 rounded text-xs font-bold bg-green-500/15 text-green-500">APROBADO</span>';
        if (status === 'rejected') return '<span class="px-2 py-1 rounded text-xs font-bold bg-red-500/15 text-red-400">RECHAZADO</span>';
        return '<span class="px-2 py-1 rounded text-xs font-bold bg-slate-500/15 text-slate-400">' + (status || '?') + '</span>';
    }

    function formatDateTime(iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    async function loadExistingRequest(playerId) {
        try {
            var { data, error } = await window.supabase
                .from('alliance_leader_requests')
                .select('*')
                .eq('player_id', parseInt(playerId))
                .in('status', ['pending', 'under_review', 'approved'])
                .order('created_at', { ascending: false })
                .limit(1);
            if (error) throw error;
            return data && data.length > 0 ? data[0] : null;
        } catch(e) {
            console.error('[ApplyLeader] Error cargando solicitud existente:', e);
            return null;
        }
    }

    async function loadInviteCode(playerId) {
        try {
            var now = new Date().toISOString();
            var { data, error } = await window.supabase
                .from('admin_invites')
                .select('code, role, alliance_id, created_at')
                .eq('player_id', parseInt(playerId))
                .eq('used', false)
                .or('expires_at.gt.' + now + ',expires_at.is.null')
                .order('created_at', { ascending: false })
                .limit(1);
            if (error) throw error;
            return data && data.length > 0 ? data[0] : null;
        } catch(e) {
            console.error('[ApplyLeader] Error cargando invite:', e);
            return null;
        }
    }

    async function renderStatus(playerData) {
        var container = document.getElementById('status-card');
        var formContainer = document.getElementById('form-container');
        if (!container) return;

        var request = await loadExistingRequest(playerData.playerId);
        if (!request) {
            container.classList.add('hidden');
            if (formContainer) formContainer.classList.remove('hidden');
            return;
        }

        if (formContainer) formContainer.classList.add('hidden');
        container.classList.remove('hidden');

        var html = '<div class="rounded-xl p-5 bg-ah-card border border-indigo-900">' +
            '<h2 class="text-lg font-bold text-white mb-2">Estado de tu solicitud</h2>' +
            '<div class="flex items-center gap-2 mb-3">' + statusBadge(request.status) +
            '<span class="text-xs text-ah-muted">' + formatDateTime(request.created_at) + '</span></div>' +
            '<p class="text-sm text-ah-muted mb-1"><strong class="text-ah-text">Alianza:</strong> ' + (request.alliance_name || '-') + ' [' + (request.alliance_tag || '-') + ']</p>' +
            '<p class="text-sm text-ah-muted mb-1"><strong class="text-ah-text">Solicitante:</strong> ' + (request.display_name || '-') + ' (ID: ' + request.player_id + ')</p>';

        if (request.status === 'pending') {
            html += '<p class="text-sm text-ah-muted mt-3">Tu solicitud esta pendiente de revision por un superadmin. Te notificaremos cuando sea aprobada.</p>';
        } else if (request.status === 'under_review') {
            html += '<p class="text-sm text-ah-muted mt-3">Tu solicitud esta siendo revisada. Pronto tendras una respuesta.</p>';
        } else if (request.status === 'approved') {
            var invite = await loadInviteCode(playerData.playerId);
            html += '<div class="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">' +
                '<p class="text-sm text-green-400 font-bold mb-2">&#127941; ¡Tu solicitud fue aprobada!</p>';
            if (invite && invite.code) {
                html += '<p class="text-sm text-ah-muted mb-2">Usa este codigo para completar tu registro como lider:</p>' +
                    '<div class="flex items-center gap-2 mb-3"><code class="text-base font-mono bg-ah-bg px-3 py-1 rounded border border-indigo-900 text-ah-accent">' + invite.code + '</code>' +
                    '<button onclick="copyLeaderInviteCode(this)" data-code="' + invite.code + '" class="px-2 py-1 rounded text-xs font-bold bg-indigo-900 text-white hover:bg-indigo-800 transition">Copiar</button></div>' +
                    '<a href="register/leader.html?code=' + encodeURIComponent(invite.code) + '" class="inline-block px-4 py-2 rounded-lg text-sm font-bold gradient-btn">Completar Registro &rarr;</a>';
            } else {
                html += '<p class="text-sm text-ah-muted">Contacta a un admin para obtener tu codigo de invitacion.</p>';
            }
            html += '</div>';
        } else if (request.status === 'rejected') {
            html += '<p class="text-sm text-red-400 mt-3">Tu solicitud fue rechazada. ' + (request.rejection_reason ? 'Motivo: ' + request.rejection_reason : '') + '</p>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    function init() {
        if (initialized) return;
        initialized = true;

        var playerData = requirePlayerSession();
        if (!playerData) return;

        // Pre-llenar campos
        var idInput = document.getElementById('supremacy-id');
        var nameInput = document.getElementById('username');
        if (idInput) idInput.value = playerData.playerId;
        if (nameInput && playerData.displayName) nameInput.value = playerData.displayName;

        // Mostrar estado de solicitud existente
        renderStatus(playerData);

        // Handler del formulario
        var form = document.getElementById('leader-form');
        if (form) {
            form.addEventListener('submit', async function(e) {
                e.preventDefault();
                var btn = document.getElementById('submit-btn');
                var errorBanner = document.getElementById('error-banner');
                var successMsg = document.getElementById('success-msg');
                if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
                if (errorBanner) errorBanner.classList.add('hidden');
                if (successMsg) successMsg.classList.add('hidden');

                try {
                    var supremacyId = parseInt(document.getElementById('supremacy-id').value);
                    var name = document.getElementById('alliance-name').value.trim();
                    var tag = document.getElementById('alliance-tag').value.trim().toUpperCase();
                    var desc = document.getElementById('alliance-desc').value.trim();
                    var username = document.getElementById('username').value.trim();
                    var discord = document.getElementById('discord').value.trim();
                    var memberCount = parseInt(document.getElementById('member-count').value) || null;

                    if (!name || !tag || !supremacyId || !username) throw new Error('Completa todos los campos obligatorios');
                    if (tag.length < 2 || tag.length > 10) throw new Error('El tag debe tener entre 2 y 10 caracteres');

                    var currentPlayer = requirePlayerSession();
                    if (!currentPlayer || String(currentPlayer.playerId) !== String(supremacyId)) {
                        throw new Error('El ID de Supremacy debe coincidir con tu sesion de jugador');
                    }

                    // Crear jugador si no existe
                    var { data: existingPlayer } = await window.supabase.from('players').select('id').eq('id', supremacyId).maybeSingle();
                    if (!existingPlayer) {
                        var { error: pe } = await window.supabase.from('players').insert({
                            id: supremacyId, current_username: username, status: 'active'
                        });
                        if (pe) throw new Error('Error creando jugador: ' + pe.message);
                    }

                    // Verificar solicitud existente
                    var { data: existingReq } = await window.supabase.from('alliance_leader_requests')
                        .select('id, status')
                        .eq('player_id', supremacyId)
                        .in('status', ['pending', 'under_review'])
                        .maybeSingle();
                    if (existingReq) throw new Error('Ya tienes una solicitud pendiente. Espera la respuesta del equipo.');

                    // Insertar solicitud
                    var { error } = await window.supabase.from('alliance_leader_requests').insert({
                        player_id: supremacyId,
                        display_name: username,
                        supremacy_player_id: supremacyId,
                        alliance_name: name,
                        alliance_tag: tag,
                        alliance_description: desc || null,
                        discord_handle: discord || null,
                        member_count: memberCount,
                        status: 'pending'
                    });
                    if (error) throw new Error(error.message);

                    if (successMsg) {
                        successMsg.textContent = 'Solicitud enviada correctamente. Un superadmin la revisara pronto.';
                        successMsg.classList.remove('hidden');
                    }
                    form.reset();
                    if (idInput) idInput.value = playerData.playerId;
                    if (nameInput && playerData.displayName) nameInput.value = playerData.displayName;

                    // Mostrar estado actualizado
                    renderStatus(playerData);
                } catch(err) {
                    if (errorBanner) {
                        errorBanner.textContent = err.message;
                        errorBanner.classList.remove('hidden');
                    }
                }
                if (btn) { btn.disabled = false; btn.textContent = '\uD83D\DCE8 Enviar Solicitud'; }
            });
        }
    }

    window.copyLeaderInviteCode = function(btn) {
        var code = btn.getAttribute('data-code');
        if (!code) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(function() {
                if (typeof window.showToast === 'function') window.showToast('Codigo copiado', 'success');
            }).catch(function() {});
        } else {
            var ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (typeof window.showToast === 'function') window.showToast('Codigo copiado', 'success');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('ah:dom-ready', init);
    window.addEventListener('ah:loaded', init);
})();
