(async function init() {
    await window.requireAdmin();
    await window.requireMinRole('event_admin');
    loadInvites();
})();

async function loadInvites() {
    try {
        var { data: invites, error } = await window.supabase.from('admin_invites').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        var container = document.getElementById('invites-list');
        if (!invites || invites.length === 0) {
            container.innerHTML = '<div class="text-center py-8" style="color:#9fa8da;">Sin codigos generados</div>';
            return;
        }

        container.innerHTML = '<table class="w-full text-sm"><thead><tr style="background:rgba(255,255,255,0.03);"><th class="text-left p-3" style="color:#9fa8da;">Codigo</th><th class="text-left p-3" style="color:#9fa8da;">Rol</th><th class="text-left p-3" style="color:#9fa8da;">Estado</th><th class="text-left p-3" style="color:#9fa8da;">Creado</th><th class="text-left p-3" style="color:#9fa8da;">Expira</th></tr></thead><tbody>' +
            invites.map(function(inv) {
                var statusBadge = inv.used
                    ? '<span class="px-2 py-1 rounded text-xs font-bold" style="background:rgba(76,175,80,0.15);color:#4caf50;">Usado</span>'
                    : new Date(inv.expires_at) < new Date()
                        ? '<span class="px-2 py-1 rounded text-xs font-bold" style="background:rgba(198,40,40,0.15);color:#ef5350;">Expirado</span>'
                        : '<span class="px-2 py-1 rounded text-xs font-bold" style="background:rgba(255,143,0,0.15);color:#ff8f00;">Activo</span>';

                return '<tr style="border-bottom:1px solid #1a237e;">' +
                    '<td class="p-3 font-mono font-bold" style="color:#ff8f00;">' + inv.code + '</td>' +
                    '<td class="p-3">' + inv.role + '</td>' +
                    '<td class="p-3">' + statusBadge + '</td>' +
                    '<td class="p-3 text-xs" style="color:#9fa8da;">' + window.formatDate(inv.created_at) + '</td>' +
                    '<td class="p-3 text-xs" style="color:#9fa8da;">' + window.formatDate(inv.expires_at) + '</td>' +
                '</tr>';
            }).join('') + '</tbody></table>';
    } catch(e) { console.error('[Invites]', e); document.getElementById('invites-list').innerHTML = '<div class="text-center py-8 text-red-400">Error: ' + e.message + '</div>'; }
}

async function generateInvite() {
    var role = document.getElementById('invite-role').value;
    try {
        // Validar sesion
        var { data: { session } } = await window.supabase.auth.getSession();
        if (!session) { window.showToast('Debes iniciar sesion como admin', 'error'); return; }

        // Validar jerarquia de roles: solo puede generar invites para roles IGUAL o INFERIOR al suyo
        if (typeof ROLE_HIERARCHY !== 'undefined') {
            var myRole = await getAdminRole();
            if (!myRole) { window.showToast('No se pudo verificar tu rol', 'error'); return; }
            if (ROLE_HIERARCHY[myRole.role] < ROLE_HIERARCHY[role]) {
                window.showToast('No puedes generar un codigo para un rol superior al tuyo', 'error'); return;
            }
        }

        // Generar codigo unico verificando duplicados (max 10 intentos)
        var code, exists, attempts = 0;
        do {
            code = 'AH' + Math.random().toString(36).substring(2, 8).toUpperCase();
            var { data: dup } = await window.supabase.from('admin_invites').select('id').eq('code', code).maybeSingle();
            exists = !!dup;
            attempts++;
        } while (exists && attempts < 10);
        if (exists) { window.showToast('Error generando codigo unico. Reintenta.', 'error'); return; }

        var expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        var { error } = await window.supabase.from('admin_invites').insert({
            code: code,
            role: role,
            created_by: session.user.id,
            expires_at: expiresAt.toISOString(),
            used: false
        });
        if (error) throw error;
        window.showToast('Codigo generado: ' + code, 'success');
        loadInvites();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}