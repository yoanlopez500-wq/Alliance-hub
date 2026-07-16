/**
 * admin-alliances.js - Logica de gestion de alianzas (admin/alliances.html)
 *
 * Extraido de admin/alliances.html como parte de la refactorizacion.
 * Depende de: admin-base.js (showToast)
 */
(function() {
    'use strict';

    async function loadAlliances() {
        try {
            var { data: alliances, error } = await window.supabase.from('alliances').select('id, name, tag, description').order('name');
            if (error) throw error;

            var memberCounts = {};
            try {
                var { data: memberships } = await window.supabase.from('alliance_memberships').select('alliance_id').eq('status', 'approved');
                if (memberships) {
                    memberships.forEach(function(m) { memberCounts[m.alliance_id] = (memberCounts[m.alliance_id] || 0) + 1; });
                }
            } catch(mcErr) { console.warn('[Alliances] Error contando miembros:', mcErr); }

            var container = document.getElementById('alliances-list');
            if (!container) return;
            if (!alliances || alliances.length === 0) {
                container.innerHTML = '<div class="text-center py-8 rounded-xl bg-ah-card border border-indigo-900 text-ah-muted">No hay alianzas registradas</div>';
                return;
            }

            container.innerHTML = alliances.map(function(a) {
                var count = memberCounts[a.id] || 0;
                return '<div class="rounded-xl p-4 bg-ah-card border border-indigo-900"><div class="flex items-center justify-between flex-wrap gap-2"><div><h3 class="font-bold">' + a.name + ' <span class="text-ah-muted">[' + (a.tag || '-') + ']</span></h3><p class="text-xs text-ah-muted">' + (a.description || 'Sin descripcion') + '</p><p class="text-xs mt-1 text-ah-muted">' + count + ' miembros</p></div><div class="flex gap-2"><button onclick="adminAlliances.edit(\'' + a.id + '\')" class="px-3 py-1 rounded text-xs font-bold bg-indigo-900 text-slate-100">Editar</button><button onclick="adminAlliances.del(\'' + a.id + '\')" class="px-3 py-1 rounded text-xs font-bold bg-red-500/20 text-red-400">Eliminar</button></div></div></div>';
            }).join('');
        } catch(e) {
            console.error('[Alliances]', e);
            var container = document.getElementById('alliances-list');
            if (container) container.innerHTML = '<div class="text-center py-8 text-red-400">Error: ' + e.message + '</div>';
        }
    }

    window.openModal = function() {
        window.openModalById('alliance-modal');
        var titleEl = document.getElementById('modal-title');
        var editId = document.getElementById('edit-id');
        if (titleEl) titleEl.textContent = 'Nueva Alianza';
        if (editId) editId.value = '';
        window.clearInputs('alliance-modal');
    };

    window.closeModal = function() {
        window.closeModalById('alliance-modal');
    };

    window.adminAlliances = {
        edit: async function(id) {
            try {
                var { data: a } = await window.supabase.from('alliances').select('*').eq('id', id).single();
                if (!a) return;
                window.openModalById('alliance-modal');
                var titleEl = document.getElementById('modal-title');
                var editId = document.getElementById('edit-id');
                var nameEl = document.getElementById('alliance-name');
                var tagEl = document.getElementById('alliance-tag');
                var descEl = document.getElementById('alliance-desc');
                if (titleEl) titleEl.textContent = 'Editar Alianza';
                if (editId) editId.value = a.id;
                if (nameEl) nameEl.value = a.name;
                if (tagEl) tagEl.value = a.tag;
                if (descEl) descEl.value = a.description || '';
            } catch(e) { console.error('[Alliances] Error edit:', e); }
        },

        del: async function(id) {
            if (!confirm('Eliminar esta alianza?')) return;
            try {
                var { error } = await window.supabase.from('alliances').delete().eq('id', id);
                if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
                window.showToast('Alianza eliminada', 'success');
                loadAlliances();
            } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
        }
    };

    window.saveAlliance = async function() {
        var id = document.getElementById('edit-id').value;
        var name = document.getElementById('alliance-name').value.trim();
        var tag = document.getElementById('alliance-tag').value.trim();
        var desc = document.getElementById('alliance-desc').value.trim();
        if (!name || !tag) { window.showToast('Nombre y tag son requeridos', 'error'); return; }
        if (tag.length < 2 || tag.length > 10) { window.showToast('Tag debe tener 2-10 caracteres', 'error'); return; }
        var data = { name: name, tag: tag, description: desc || null };
        try {
            var result = id ? await window.supabase.from('alliances').update(data).eq('id', id) : await window.supabase.from('alliances').insert([data]);
            if (result.error) { window.showToast('Error: ' + result.error.message, 'error'); return; }
            window.showToast('Alianza guardada', 'success');
            closeModal();
            loadAlliances();
        } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
    };

    window.requireAdmin();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAlliances);
    } else {
        loadAlliances();
    }
})();