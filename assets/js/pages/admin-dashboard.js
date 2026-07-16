/**
 * admin-dashboard.js - Logica del panel de admin (admin/index.html)
 *
 * Extraido de admin/index.html como parte de la refactorizacion.
 * Funcion: verificar autenticacion de admin y redirigir si no es valido.
 */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', async function() {
        try {
            var sessionRes = await window.supabase.auth.getSession();
            if (!sessionRes.data || !sessionRes.data.session) {
                window.location.href = '../login.html';
                return;
            }
            var session = sessionRes.data.session;

            var { data: admin, error } = await window.supabase
                .from('admin_users')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (error || !admin) {
                window.location.href = '../index.html';
            }
        } catch (e) {
            console.error('Auth error:', e);
            window.location.href = '../login.html';
        }
    });
})();