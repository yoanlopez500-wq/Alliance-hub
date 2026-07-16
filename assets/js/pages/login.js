/**
 * login.js - Logica de la pagina de login (login.html)
 *
 * Extraido de login.html como parte de la refactorizacion.
 * Funciones: tabs de login/signup/reset, auto-login, handlers de formularios.
 */
(function() {
    'use strict';

    // Auto-login: si hay token, redirigir al admin
    function autoLoginAdmin() {
        var token = localStorage.getItem('sb-qkccyjegkgjzwoxytnqp-auth-token');
        if (!token) return false;
        if (typeof window.supabase !== 'undefined') {
            window.supabase.auth.getSession().then(function(result) {
                if (!result.data.session) localStorage.removeItem('sb-qkccyjegkgjzwoxytnqp-auth-token');
            }).catch(function() {});
        }
        window.location.replace('admin/index.html');
        return true;
    }

    // Mostrar tab activo
    window.showTab = function(tab) {
        var formLogin = document.getElementById('form-login');
        var formSignup = document.getElementById('form-signup');
        var formReset = document.getElementById('form-reset');
        if (formLogin) formLogin.classList.toggle('hidden', tab !== 'login');
        if (formSignup) formSignup.classList.toggle('hidden', tab !== 'signup');
        if (formReset) formReset.classList.toggle('hidden', tab !== 'reset');

        ['login', 'signup', 'reset'].forEach(function(t) {
            var btn = document.getElementById('tab-' + t);
            if (!btn) return;
            if (t === tab) {
                btn.className = 'flex-1 pb-3 text-sm font-bold text-ah-accent border-b-2 border-ah-accent whitespace-nowrap min-w-[80px]';
            } else {
                btn.className = 'flex-1 pb-3 text-sm font-bold text-ah-muted hover:text-ah-text whitespace-nowrap min-w-[80px]';
            }
        });
    };

    // Inicializar
    document.addEventListener('DOMContentLoaded', function() {
        // Intentar auto-login
        if (autoLoginAdmin()) {
            document.documentElement.style.display = 'none';
            return;
        }

        // Handler pageshow para BFCache
        window.addEventListener('pageshow', function(event) {
            if (event.persisted) autoLoginAdmin();
        });

        // Login form
        var loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                var errorMsg = document.getElementById('error-msg');
                var successMsg = document.getElementById('success-msg');
                if (errorMsg) errorMsg.classList.add('hidden');
                if (successMsg) successMsg.classList.add('hidden');
                var success = await window.login(
                    document.getElementById('login-email').value,
                    document.getElementById('login-password').value
                );
                if (success) {
                    window.location.href = 'admin/index.html';
                } else {
                    if (errorMsg) { errorMsg.textContent = 'Email o contrasena incorrectos'; errorMsg.classList.remove('hidden'); }
                }
            });
        }

        // Signup form
        var signupForm = document.getElementById('signup-form');
        if (signupForm) {
            signupForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                var errorMsg = document.getElementById('error-msg');
                var successMsg = document.getElementById('success-msg');
                if (errorMsg) errorMsg.classList.add('hidden');
                if (successMsg) successMsg.classList.add('hidden');
                var result = await window.signupWithInvite(
                    document.getElementById('signup-email').value,
                    document.getElementById('signup-password').value,
                    document.getElementById('signup-code').value,
                    document.getElementById('signup-supremacy-id').value,
                    document.getElementById('signup-display-name').value.trim()
                );
                if (result.success) {
                    if (successMsg) { successMsg.textContent = result.message; successMsg.classList.remove('hidden'); }
                    this.reset();
                    setTimeout(function() { showTab('login'); }, 2000);
                } else {
                    if (errorMsg) { errorMsg.textContent = result.message; errorMsg.classList.remove('hidden'); }
                }
            });
        }

        // Reset password form
        var resetForm = document.getElementById('reset-form');
        if (resetForm) {
            resetForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                var errorMsg = document.getElementById('error-msg');
                var successMsg = document.getElementById('success-msg');
                if (errorMsg) errorMsg.classList.add('hidden');
                if (successMsg) successMsg.classList.add('hidden');
                var result = await window.sendPasswordReset(document.getElementById('reset-email').value);
                if (result.success) {
                    if (successMsg) { successMsg.textContent = result.message; successMsg.classList.remove('hidden'); }
                    this.reset();
                } else {
                    if (errorMsg) { errorMsg.textContent = result.message; errorMsg.classList.remove('hidden'); }
                }
            });
        }
    });
})();