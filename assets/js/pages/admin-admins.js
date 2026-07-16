window.requireAdmin();

var alliancesMap = {};

async function loadAdmins() {
    try {
        // v18 FIX: Cargar alliances por separado, sin FK join que falla
        var aRes = await window.supabase.from('alliances').select('id, name, tag');
        alliancesMap = {};
        (aRes.data || []).forEach(function(a) { alliancesMap[a.id] = a; });

        var { data: admins, error } = await window.supabase.from('admin_users').select('*').order('created_at', { ascending: false });
        var container = document.getElementById('admins-list');
        if (error) { AhComponents.inject('error-state', { message: 'Error: ' + error.message }, 'admins-list'); return; }
        if (!admins || admins.length === 0) { AhComponents.inject('empty-state', { message: 'No hay admins registrados', icon: '&#128101;' }, 'admins-list'); return; }

        container.innerHTML = admins.map(function(a) {
            var alli = a.alliance_id ? alliancesMap[a.alliance_id] : null;
            var roleBadge = a.role === 'superadmin' ? '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(198,40,40,0.2);color:#ef5350;">SUPERADMIN</span>' :
                            a.role === 'event_admin' ? '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(156,39,176,0.2);color:#ce93d8;">EVENT ADMIN</span>' :
                            a.role === 'alliance_leader' ? '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(76,175,80,0.2);color:#4caf50;">LIDER</span>' :
                            '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(255,255,255,0.05);color:#9fa8da;">' + a.role + '</span>';
            var statusBadge = a.status === 'active' ? '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(76,175,80,0.15);color:#4caf50;">ACTIVO</span>' :
                              a.status === 'suspended' ? '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(198,40,40,0.15);color:#ef5350;">SUSPENDIDO</span>' :
                              '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(255,255,255,0.05);color:#9fa8da;">' + (a.status || '?') + '</span>';

            return '<div class="rounded-xl p-4" style="background:#11183a;border:1px solid #1a237e;"><div class="flex items-center justify-between flex-wrap gap-2"><div><h3 class="font-bold">' + (a.display_name || 'Admin') + '</h3><p class="text-xs" style="color:#9fa8da;">' + (alli ? alli.name + ' [' + alli.tag + ']' : 'Sin alianza') + ' | ' + roleBadge + ' ' + statusBadge + '</p></div><div class="flex gap-2"><button onclick="changeRole(\'' + a.id + '\', \'' + a.role + '\')" class="px-3 py-1 rounded text-xs font-bold" style="background:#1a237e;color:#e8eaf6;">Cambiar rol</button><button onclick="toggleStatus(\'' + a.id + '\', \'' + a.status + '\')" class="px-3 py-1 rounded text-xs font-bold" style="background:rgba(198,40,40,0.2);color:#ef5350;">' + (a.status === 'active' ? 'Suspender' : 'Activar') + '</button></div></div></div>';
        }).join('');
    } catch(e) { AhComponents.inject('error-state', { message: 'Error: ' + e.message }, 'admins-list'); }
}

async function changeRole(adminId, currentRole) {
    var roles = ['superadmin', 'event_admin', 'alliance_leader', 'moderator'];
    var newRole = prompt('Nuevo rol (' + roles.join(', ') + '):', currentRole);
    if (!newRole || newRole === currentRole) return;
    if (roles.indexOf(newRole) === -1) { window.showToast('Rol invalido', 'error'); return; }
    var { error } = await window.supabase.from('admin_users').update({ role: newRole }).eq('id', adminId);
    if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
    window.showToast('Rol actualizado', 'success');
    loadAdmins();
}

async function toggleStatus(adminId, currentStatus) {
    var newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    if (!confirm((newStatus === 'active' ? 'Activar' : 'Suspender') + ' este administrador?')) return;
    var { error } = await window.supabase.from('admin_users').update({ status: newStatus }).eq('id', adminId);
    if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
    window.showToast('Estado actualizado', 'success');
    loadAdmins();
}

loadAdmins();