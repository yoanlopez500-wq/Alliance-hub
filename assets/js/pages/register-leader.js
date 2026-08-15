/**
 * register-leader.js - Registro de lider de alianza
 *
 * Migrado desde register/leader.html como parte de la refactorizacion.
 *
 * CAMBIO: el signup ahora se realiza de forma transaccional via la Edge Function
 * `complete-leader-signup` (crea auth user + admin_user + marca invite atomicamente).
 * Si window.SUPABASE_URL no existe, se hace fallback defensivo a signupWithInvite().
 */
(function() {
    'use strict';

    var initialized = false;
    var inviteCode = null;

    function init() {
        if (initialized) return;
        initialized = true;

        var urlParams = new URLSearchParams(window.location.search);
        inviteCode = urlParams.get('code');

        if (!inviteCode) {
            showError('No se proporciono un codigo de invitacion.');
            return;
        }
        // Formato via modulo compartido: acepta AH+10 (actual) y AH+6 (legacy)
        var codeOk = (window.AHInviteCode && window.AHInviteCode.isValid)
            ? window.AHInviteCode.isValid(inviteCode)
            : /^AH[A-Z0-9]{6,10}$/i.test(inviteCode);
        if (!codeOk) {
            showError('Formato de codigo invalido. Debe ser AH + 6 a 10 caracteres alfanumericos.');
            return;
        }

        verifyInviteCode(inviteCode);
        bindForm();
    }

    function showError(msg) {
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('error-state').classList.remove('hidden');
        document.getElementById('signup-form-state').classList.add('hidden');
        if (msg) document.getElementById('error-msg').textContent = msg;
    }

    function showForm() {
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('error-state').classList.add('hidden');
        document.getElementById('signup-form-state').classList.remove('hidden');
    }

    async function verifyInviteCode(code) {
        try {
            // HOTFIX seguridad: verificacion via RPC acotado (admin_invites
            // ya no es legible con anon key). La edge function revalida igual.
            var { data: inviteRows, error } = await window.supabase
                .rpc('verify_leader_invite', { p_code: code });

            if (error) throw error;
            var invite = inviteRows && inviteRows.length > 0 ? inviteRows[0] : null;
            if (!invite) { showError('Codigo invalido, ya usado o expirado.'); return; }

            var playerId = invite.player_id;
            var supremacyId = null;
            var username = '';

            if (playerId) {
                var { data: player } = await window.supabase.from('players')
                    .select('current_username, id')
                    .eq('id', playerId)
                    .maybeSingle();
                if (player) {
                    username = player.current_username || '';
                    supremacyId = player.id;
                }
            }

            document.getElementById('ls-player-id').value = playerId || '';
            document.getElementById('ls-username').value = username;
            document.getElementById('ls-alliance').value = invite.alliance_name || '';
            document.getElementById('ls-invite-code').value = code;
            document.getElementById('ls-supremacy-id').value = supremacyId || '';
            document.getElementById('alliance-name-display').textContent = invite.alliance_name || '';

            showForm();
        } catch(e) {
            console.error('[verifyInvite]', e);
            showError('Error verificando invitacion: ' + e.message);
        }
    }

    /**
     * Llama a la Edge Function `complete-leader-signup` (signup transaccional).
     * Contrato: POST {SUPABASE_URL}/functions/v1/complete-leader-signup
     *   body: {email, password, inviteCode, displayName}
     *   200 -> {success:true, message, role, alliance_id}
     *   error -> {error} (400 codigo invalido/expirado/corrupto, 409 email ya registrado, 500)
     * Devuelve {success, message} con el mismo formato que signupWithInvite().
     */
    async function signupViaEdgeFunction(email, password, inviteCode, displayName) {
        try {
            var resp = await fetch(window.SUPABASE_URL + '/functions/v1/complete-leader-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    password: password,
                    inviteCode: inviteCode,
                    displayName: displayName
                })
            });
            var data = {};
            try { data = await resp.json(); } catch(parseErr) { data = {}; }

            if (resp.ok && data && data.success) {
                return { success: true, message: data.message || 'Cuenta creada exitosamente.' };
            }

            // Mostrar el mensaje de error del servidor; mapear 409 a un mensaje claro
            var msg = (data && data.error) ? data.error : 'Error al crear la cuenta (HTTP ' + resp.status + ').';
            if (resp.status === 409) {
                msg = 'Ese email ya tiene cuenta, inicia sesion.';
            }
            return { success: false, message: msg };
        } catch(e) {
            console.error('[signupViaEdgeFunction]', e);
            return { success: false, message: 'Error de red al crear la cuenta: ' + e.message };
        }
    }

    function bindForm() {
        var form = document.getElementById('leader-signup-form');
        if (!form) return;
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            var errorEl = document.getElementById('form-error');
            errorEl.classList.add('hidden');

            var email = document.getElementById('ls-email').value.trim();
            var password = document.getElementById('ls-password').value;
            var code = document.getElementById('ls-invite-code').value;
            var supremacyId = document.getElementById('ls-supremacy-id').value;

            if (!email || !password || password.length < 6) {
                errorEl.textContent = 'Email valido y contrasena de minimo 6 caracteres son requeridos.';
                errorEl.classList.remove('hidden');
                return;
            }

            var displayName = document.getElementById('ls-username').value || null;

            var result;
            if (window.SUPABASE_URL) {
                // Camino principal: signup transaccional via Edge Function
                result = await signupViaEdgeFunction(email, password, code, displayName);
            } else {
                // Fallback defensivo: flujo anterior (no transaccional)
                result = await window.signupWithInvite(email, password, code, supremacyId || null, displayName);
            }

            if (result.success) {
                if (typeof window.showToast === 'function') window.showToast('Cuenta creada! Bienvenido lider.', 'success');
                setTimeout(function() {
                    window.location.href = '../leader-dashboard.html';
                }, 1500);
            } else {
                errorEl.textContent = result.message || 'Error al crear la cuenta.';
                errorEl.classList.remove('hidden');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('ah:dom-ready', init);
    window.addEventListener('ah:loaded', init);
})();
