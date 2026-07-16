var currentReportId = null;
var ruleSectionsMap = {};

async function loadRuleSections() {
    try {
        var { data, error } = await window.supabase.from('rule_sections').select('id, title').order('order_index');
        if (error) throw error;
        ruleSectionsMap = {};
        var select = document.getElementById('filter-rule');
        select.innerHTML = '<option value="">Todas las reglas</option>';
        if (data) {
            data.forEach(function(r) { ruleSectionsMap[r.id] = r; select.innerHTML += '<option value="' + r.id + '">' + r.title + '</option>'; });
        }
    } catch(e) { console.error('[Reports] Error cargando reglas:', e); }
}

async function loadReports() {
    try {
        var ruleFilter = document.getElementById('filter-rule').value;
        var statusFilter = document.getElementById('filter-status').value;
        var q = window.supabase.from('player_reports').select('*, evidence_urls').order('created_at', { ascending: false }).limit(50);
        if (ruleFilter) q = q.eq('rule_section_id', ruleFilter);
        if (statusFilter !== 'all') q = q.eq('status', statusFilter);
        var { data, error } = await q;
        if (error) throw error;
        var list = document.getElementById('reports-list');
        if (!data || data.length === 0) {
            list.innerHTML = '';
            if (window.AhComponents) AhComponents.inject('empty-state', { message: 'No hay reportes' }, 'reports-list');
            else list.innerHTML = '<div class="text-center py-8 rounded-xl bg-slate-900 border border-indigo-900 text-slate-400">No hay reportes</div>';
            return;
        }
        list.innerHTML = data.map(function(r) {
            var statusBadge = r.status === 'open' ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">ABIERTO</span>' : r.status === 'resolved' ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-500">RESUELTO</span>' : '<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-500/15 text-slate-400">DESESTIMADO</span>';
            var ruleTitle = ruleSectionsMap[r.rule_section_id] ? ruleSectionsMap[r.rule_section_id].title : 'Regla #' + r.rule_section_id;
            var ruleBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold ml-2 bg-indigo-900 text-slate-400">' + ruleTitle + '</span>';
            var evBadge = (r.evidence_urls && r.evidence_urls.length > 0) ? '<span class="px-2 py-0.5 rounded text-xs font-bold ml-2 bg-orange-500/15 text-orange-500">&#128247; ' + r.evidence_urls.length + '</span>' : '';
            return '<div class="rounded-xl p-4 mb-3 cursor-pointer transition bg-slate-900 border border-indigo-900 hover:border-amber-500/50" onclick="openDetail(\'' + r.id + '\')"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div><h3 class="font-bold">Reporte contra jugador #' + r.reported_player_id + '</h3><p class="text-sm mt-1 text-slate-400">' + (r.description || '').substring(0, 120) + '...</p></div>' + statusBadge + '</div><div class="flex flex-wrap gap-2 mt-2">' + ruleBadge + evBadge + '<span class="text-xs text-slate-400">' + window.formatDate(r.created_at) + '</span></div></div>';
        }).join('');
    } catch(e) {
        console.error('[Reports]', e);
        document.getElementById('reports-list').innerHTML = '';
        if (window.AhComponents) AhComponents.inject('error-state', { message: 'Error cargando reportes: ' + e.message, onRetry: loadReports }, 'reports-list');
        else document.getElementById('reports-list').innerHTML = '<div class="text-center py-8 text-red-400">Error: ' + e.message + '</div>';
    }
}

async function openDetail(id) {
    currentReportId = id;
    try {
        var { data, error } = await window.supabase.from('player_reports').select('*').eq('id', id).single();
        if (error) throw error;
        document.getElementById('detail-modal').classList.remove('hidden');
        var ruleTitle = ruleSectionsMap[data.rule_section_id] ? ruleSectionsMap[data.rule_section_id].title : 'Regla #' + data.rule_section_id;
        document.getElementById('d-title').textContent = 'Reporte contra jugador #' + data.reported_player_id;
        document.getElementById('d-content').innerHTML = '<p class="text-sm mb-2"><strong>Descripcion:</strong> ' + data.description + '</p><p class="text-sm mb-2"><strong>Regla:</strong> ' + ruleTitle + '</p><p class="text-xs text-slate-400">Fecha: ' + window.formatDateTime(data.created_at) + '</p>';

        // Render evidence if present
        var evDiv = document.getElementById('d-evidence');
        if (data.evidence_urls && data.evidence_urls.length > 0) {
            evDiv.classList.remove('hidden');
            evDiv.innerHTML = '<h4 class="font-bold text-sm mb-2 text-amber-400">&#128247; Evidencia adjunta:</h4><div id="evidence-grid-container"></div>';
            renderEvidenceGrid(data.evidence_urls, 'evidence-grid-container');
        } else {
            evDiv.classList.add('hidden');
            evDiv.innerHTML = '';
        }

        loadPrecedentSuggestions(data.rule_section_id);
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

async function loadPrecedentSuggestions(ruleSectionId) {
    if (!ruleSectionId) { document.getElementById('d-precedents').classList.add('hidden'); return; }
    try {
        var { data } = await window.supabase.from('rule_precedents').select('*').eq('rule_section_id', ruleSectionId);
        var div = document.getElementById('d-precedents');
        if (data && data.length > 0) { div.classList.remove('hidden'); div.innerHTML = '<h4 class="font-bold text-sm mb-2 text-amber-400">&#9878;&#65039; Precedentes relacionados:</h4>' + data.map(function(p) { return '<p class="text-sm">&#8226; <strong>' + p.title + ':</strong> ' + p.description + '</p>'; }).join(''); }
        else { div.classList.add('hidden'); }
    } catch(e) { document.getElementById('d-precedents').classList.add('hidden'); }
}

function closeDetail() { document.getElementById('detail-modal').classList.add('hidden'); currentReportId = null; }

async function resolveReport() {
    if (!currentReportId) return;
    try {
        var { error } = await window.supabase.from('player_reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', currentReportId);
        if (error) throw error;
        window.showToast('Reporte resuelto', 'success'); closeDetail(); loadReports();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

async function dismissReport() {
    if (!currentReportId) return;
    try {
        var { error } = await window.supabase.from('player_reports').update({ status: 'dismissed', resolved_at: new Date().toISOString() }).eq('id', currentReportId);
        if (error) throw error;
        window.showToast('Reporte desestimado', 'info'); closeDetail(); loadReports();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

async function init() {
    await loadRuleSections();
    await loadReports();
}

window.requireAdmin();
init();