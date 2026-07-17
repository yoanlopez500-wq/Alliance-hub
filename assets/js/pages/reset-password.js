/**
 * reset-password.js - Logica de restablecimiento de contrasena (reset-password.html)
 *
 * Extraido de reset-password.html como parte de la refactorizacion al sistema de loader/cache-buster.
 */
(function() {
    'use strict';

    async function init() {
        try {
            var sessionData = await window.supabase.auth.getSession();
            if (!sessionData.data.session) {
                var hash = window.location.hash;
                if (!hash || !hash.includes('access_token')) {
                    document.getElementById('error-msg').textContent = 'Enlace invalido o expirado. Solicita uno nuevo.';
                    document.getElementById('error-msg').classList.remove('hidden');
                    var form = document.getElementById('reset-password-form');
                    if (form) form.style.display = 'none';
                }
            }
        } catch(e) { console.error('[ResetPassword] Error verificando sesion:', e); }
    }

    document.getElementById('reset-password-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var newPass = document.getElementById('new-password').value;
        var confirmPass = document.getElementById('confirm-password').value;
        var errorMsg = document.getElementById('error-msg');
        var successMsg = document.getElementById('success-msg');

        errorMsg.classList.add('hidden');
        successMsg.classList.add('hidden');

        if (newPass !== confirmPass) {
            errorMsg.textContent = 'Las contrasenas no coinciden';
            errorMsg.classList.remove('hidden');
            return;
        }

        try {
            var { error } = await window.supabase.auth.updateUser({ password: newPass });
            if (error) throw error;
            successMsg.textContent = 'Contrasena actualizada. Redirigiendo...';
            successMsg.classList.remove('hidden');
            setTimeout(function() { window.location.href = 'admin/index.html'; }, 2000);
        } catch(err) {
            errorMsg.textContent = 'Error: ' + err.message;
            errorMsg.classList.remove('hidden');
        }
    });

    init();
})();
