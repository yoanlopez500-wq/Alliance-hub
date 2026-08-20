// assets/js/pages/admin-audit-log.js - Visor del admin_audit_log (SOLO superadmins)
// La RLS en la BD ya lo restringe a superadmin; aqui ademas se oculta la UI.

var AUDIT_TABLES = [
    'rule_sections', 'rule_precedents', 'strike_types', 'player_strikes',
    'player_sanctions', 'player_reports', 'chat_reports', 'matches',
    'alliances', 'admin_users', 'match_results'
];
var TABLE_LABELS = {
    rule_sections: '&#128220; Reglamento',
    rule_precedents: '&#9878;&#65039; Precedentes',
    strike_types: '&#9889; Tipos de strike',
    player_strikes: '&#9889; Strikes',
    player_sanctions: '&#128683; Sanciones',
    player_reports: '&#128680; Reportes',
    chat_reports: '&#128172; Reportes chat',
    matches: '&#127918; Partidas',
    alliances: '&#127988; Alianzas',
    admin_users: '&#128101; Admins',
    match_results: '&#127942; Resultados'
};

var __auditOffset = 0;
var AUDIT_PAGE = 50;
var __auditTimer = null;

function debouncedLoad() {
    clearTimeout(__auditTimer);
    __auditTimer = setTimeout(function() { loadAudit(false); }, 350);
}

function actionBadge(action) {
    if (action === 'INSERT') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-400">CREADO</span>';
    if (action === 'UPDATE') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">EDITADO</span>';
    if (action === 'DELETE') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">BORRADO</span>';
    return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-500/15 text-slate-400">' + escHtml(action) + '</span>';
}

// Diff simple: campos que cambiaron entre old y new
function renderChanges(oldData, newData, action) {
    if (action === 'INSERT') return '<pre class="diff mt-2 p-2 rounded bg-slate-900/60 text-green-300/80">' + escHtml(JSON.stringify(newData, null, 1)) + '</pre>';
    if (action === 'DELETE') return '<pre class="diff mt-2 p-2 rounded bg-slate-900/60 text-red-300/80">' + escHtml(JSON.stringify(oldData, null, 1)) + '</pre>';
    var changed = [];
    var keys = {};
    var k;
    if (oldData) for (k in oldData) keys[k] = true;
    if (newData) for (k in newData) keys[k] = true;
    for (k in keys) {
        var ov = oldData ? oldData[k] : undefined;
        var nv = newData ? newData[k] : undefined;
        if (JSON.stringify(ov) !== JSON.stringify(nv)) {
            changed.push({ field: k, before: ov, after: nv });
        }
    }
    if (changed.length === 0) return '<p class="text-xs text-slate-500 mt-2">Sin cambios de contenido (mismo valores).</p>';
    return changed.map(function(c) {
        return '<div class="mt-2 p-2 rounded bg-slate-900/60">' +
            '<p class="text-xs font-bold text-ah-accent">' + escHtml(c.field) + '</p>' +
            '<p class="text-xs text-red-300/80 line-through">' + escHtml(JSON.stringify(c.before)) + '</p>' +
            '<p class="text-xs text-green-300/90">' + escHtml(JSON.stringify(c.after)) + '</p></div>';
    }).join('');
}

async function loadAudit(append) {
    var list = document.getElementById('audit-list');
    var btnMore = document.getElementById('load-more');
    if (!append) { __auditOffset = 0; list.innerHTML = 'Cargando...'; }

    try {
        var query = window.supabase.from('admin_audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .range(__auditOffset, __auditOffset + AUDIT_PAGE - 1);

        var table = document.getElementById('filter-table').value;
        var action = document.getElementById('filter-action').value;
        var actor = document.getElementById('filter-actor').value.trim();
        if (table) query = query.eq('table_name', table);
        if (action) query = query.eq('action', action);
        if (actor) query = query.ilike('actor_name', '%' + actor + '%');

        var { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            if (!append) list.innerHTML = '<div class="text-center py-8 rounded-xl" style="background:#11183a;border:1px solid #1a237e;color:#9fa8da;">Sin registros con esos filtros</div>';
            btnMore.classList.add('hidden');
            return;
        }

        var html = data.map(function(r) {
            var label = TABLE_LABELS[r.table_name] || r.table_name;
            var fecha = window.formatDateTime ? window.formatDateTime(r.created_at) : r.created_at;
            return '<div class="rounded-xl p-4 mb-3" style="background:#11183a;border:1px solid #1a237e;">' +
                '<div class="flex flex-wrap items-center gap-2 mb-1">' +
                    actionBadge(r.action) +
                    '<span class="text-sm font-bold">' + label + '</span>' +
                    '<span class="text-xs text-slate-400">fila: ' + escHtml(r.row_id || '-') + '</span>' +
                '</div>' +
                '<p class="text-sm" style="color:#9fa8da;">Por: <strong class="text-slate-100">' + escHtml(r.actor_name || 'desconocido') + '</strong> &middot; ' + escHtml(fecha) + '</p>' +
                '<details class="mt-1"><summary class="text-xs cursor-pointer text-ah-accent hover:underline">Ver valores (antes / despues)</summary>' +
                renderChanges(r.old_data, r.new_data, r.action) +
                '</details></div>';
        }).join('');

        if (append) { list.insertAdjacentHTML('beforeend', html); } else { list.innerHTML = html; }
        __auditOffset += data.length;
        btnMore.classList.toggle('hidden', data.length < AUDIT_PAGE);
    } catch (e) {
        console.error('[Audit]', e);
        list.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando auditoria (¿no eres superadmin?): ' + escHtml(e.message) + '</div>';
        btnMore.classList.add('hidden');
    }
}

async function initAuditPage() {
    // Guardia de UI (la RLS es la seguridad real)
    var admin = await window.getAdminRole();
    if (!admin || admin.role !== 'superadmin') {
        document.getElementById('audit-list').innerHTML =
            '<div class="text-center py-12 rounded-xl" style="background:#11183a;border:1px solid #1a237e;">' +
            '<p class="text-4xl mb-3">&#128274;</p>' +
            '<p class="font-bold">Solo superadmins</p>' +
            '<p class="text-sm text-slate-400 mt-1">La auditoria de acciones administrativas es exclusiva del superadmin.</p></div>';
        return;
    }

    var sel = document.getElementById('filter-table');
    AUDIT_TABLES.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        sel.appendChild(opt);
    });

    loadAudit(false);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuditPage);
} else {
    initAuditPage();
}
