// assets/js/training.js v1 - Capacitacion por cargo
// Depende de: auth-core.js, base.js

var __ahTrainingShown = false;

async function checkTrainingRequired() {
    if (__ahTrainingShown) return;
    var admin = await getAdminRole();
    if (!admin) return;

    var trainingKey = 'ah_training_' + admin.role + '_' + admin.id;
    if (localStorage.getItem(trainingKey) === 'completed') return;

    try {
        var { data: sections } = await supabase.from('rule_sections')
            .select('id, title, section_number')
            .eq('is_active', true)
            .eq('training_for', admin.role === 'alliance_leader' ? 'leader' : admin.role)
            .order('order_index');

        if (!sections || sections.length === 0) return;

        var { data: completed } = await supabase.from('training_progress')
            .select('section_id')
            .eq('admin_id', admin.id);

        var completedIds = (completed || []).map(function(c) { return c.section_id; });
        var pending = sections.filter(function(s) { return completedIds.indexOf(s.id) === -1; });

        if (pending.length === 0) {
            localStorage.setItem(trainingKey, 'completed');
            return;
        }

        __ahTrainingShown = true;
        showTrainingModal(pending, admin.role, trainingKey);
    } catch(e) {
        console.error('[Training] Error:', e);
    }
}

function showTrainingModal(pendingSections, role, storageKey) {
    var roleLabel = { leader: 'Lider de Alianza', officer: 'Oficial', admin: 'Administrador', moderator: 'Moderador', superadmin: 'Super Admin' };
    var title = '&#128218; Capacitacion para ' + (roleLabel[role] || role);

    var modal = document.createElement('div');
    modal.id = 'training-modal';
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4';
    modal.style.cssText = 'background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);';

    modal.innerHTML =
        '<div class="bg-slate-800 rounded-2xl border border-indigo-900/50 max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl">' +
            '<div class="p-5 border-b border-slate-700">' +
                '<h2 class="text-xl font-bold text-white">' + title + '</h2>' +
                '<p class="text-sm text-slate-400 mt-1">Debes completar las siguientes lecturas para tu cargo.</p>' +
            '</div>' +
            '<div class="p-5 overflow-y-auto max-h-[50vh] space-y-3">' +
                pendingSections.map(function(s) {
                    return '<div class="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50 border border-slate-600">' +
                        '<span class="text-2xl">&#128214;</span>' +
                        '<div class="flex-1">' +
                            '<p class="text-sm font-bold text-white">' + (s.section_number ? s.section_number + ' ' : '') + s.title + '</p>' +
                        '</div>' +
                        '<a href="' + ahPath('rules.html?section=' + s.id) + '" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white transition">Leer</a>' +
                    '</div>';
                }).join('') +
            '</div>' +
            '<div class="p-5 border-t border-slate-700 flex gap-3">' +
                '<button onclick="dismissTrainingModal(\'' + storageKey + '\')" class="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold bg-slate-600 hover:bg-slate-500 text-white transition">Ver mas tarde</button>' +
                '<a href="' + ahPath('rules.html?training=' + role) + '" class="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold bg-orange-500 hover:bg-orange-400 text-white transition text-center">&#128229; Descargar PDF</a>' +
            '</div>' +
        '</div>';

    document.body.appendChild(modal);
}

function dismissTrainingModal(storageKey) {
    var modal = document.getElementById('training-modal');
    if (modal) modal.remove();
}

function completeTraining(storageKey) {
    localStorage.setItem(storageKey, 'completed');
    dismissTrainingModal();
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        checkTrainingRequired().catch(function(){});
    }, 3000);
});

window.checkTrainingRequired = checkTrainingRequired;
window.showTrainingModal = showTrainingModal;
window.dismissTrainingModal = dismissTrainingModal;
window.completeTraining = completeTraining;
