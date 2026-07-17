var formulasCache = [];
var ruleSectionsMap = {};

function parseFormulaLegend(legend) {
    if (!legend) return { penalty_pct: 0, nullifies_kills: false, is_ban: false, ban_duration_hours: null };
    try {
        var parsed = JSON.parse(legend);
        return {
            penalty_pct: parseFloat(parsed.penalty_pct) || 0,
            nullifies_kills: !!parsed.nullifies_kills,
            is_ban: !!parsed.is_ban,
            ban_duration_hours: parsed.ban_duration_hours || null
        };
    } catch(e) {
        var penaltyMatch = legend.match(/(\d+)%/);
        return {
            penalty_pct: penaltyMatch ? parseInt(penaltyMatch[1]) : 0,
            nullifies_kills: /nullif/i.test(legend),
            is_ban: /ban/i.test(legend),
            ban_duration_hours: null
        };
    }
}

function buildFormulaLegend(penalty, nullifies, isBan, banDuration, ruleId) {
    return JSON.stringify({
        penalty_pct: parseFloat(penalty) || 0,
        nullifies_kills: !!nullifies,
        is_ban: !!isBan,
        ban_duration_hours: isBan ? (banDuration ? parseInt(banDuration) : null) : null,
        rule_section_id: ruleId || null
    });
}

async function loadRuleSectionsSelect() {
    try {
        var { data, error } = await window.supabase.from('rule_sections').select('id, title').eq('is_active', true).order('order_index');
        if (error) throw error;
        ruleSectionsMap = {};
        var select = document.getElementById('f-rule');
        select.innerHTML = '<option value="">Sin relacion</option>';
        if (data) {
            data.forEach(function(r) {
                ruleSectionsMap[r.id] = r;
                select.innerHTML += '<option value="' + r.id + '">' + r.title + '</option>';
            });
        }
    } catch(e) { console.error('[SanctionsEngine] Error cargando reglas:', e); }
}

async function loadFormulas() {
    try {
        var { data, error } = await window.supabase.from('strike_types').select('*').order('severity');
        if (error) throw error;
        formulasCache = data || [];
        var list = document.getElementById('formulas-list');
        document.getElementById('stat-active').textContent = data ? data.length : 0;
        if (!data || data.length === 0) { list.innerHTML = '<div class="text-center py-8" style="color:#9fa8da;">No hay formulas. Crea la primera.</div>'; return; }
        list.innerHTML = '<div class="grid md:grid-cols-2 gap-3">' + data.map(function(f) {
            var formula = parseFormulaLegend(f.legend);
            var sevColor = f.severity === 1 ? '#4caf50' : f.severity === 2 ? '#ff8f00' : '#ef5350';
            var sevLabel = f.severity === 1 ? 'LEVE' : f.severity === 2 ? 'MEDIO' : 'GRAVE';
            var banBadge = formula.is_ban ? '<span class="px-2 py-0.5 rounded text-xs font-bold ml-2 bg-red-500/15 text-red-400">BAN</span>' : '';
            var nullBadge = formula.nullifies_kills ? '<span class="px-2 py-0.5 rounded text-xs font-bold ml-2 bg-purple-400/10 text-purple-400">NULLIFIER</span>' : '';
            var durationText = formula.is_ban ? (formula.ban_duration_hours ? formula.ban_duration_hours + 'h' : 'Permanente') : '';
            var ruleText = formula.rule_section_id && ruleSectionsMap[formula.rule_section_id] ? '<p class="text-xs mt-1" style="color:#9fa8da;">Regla: ' + ruleSectionsMap[formula.rule_section_id].title + '</p>' : '';
            return '<div class="formula-card rounded-xl p-4" style="background:#11183a;border:1px solid #1a237e;"><div class="flex items-center justify-between mb-2"><h3 class="font-bold">' + f.name + '</h3><span class="px-2 py-0.5 rounded text-xs font-bold" style="background:' + sevColor + '20;color:' + sevColor + ';">' + sevLabel + '</span></div><p class="text-sm mb-2" style="color:#9fa8da;">' + (f.description || 'Sin descripcion') + '</p><p class="text-xs" style="color:#9fa8da;"><strong style="color:#ff8f00;">Penalizacion:</strong> ' + formula.penalty_pct + '% kills</p>' + ruleText + '<p class="text-xs mt-1" style="color:#9fa8da;">' + (formula.is_ban ? '<strong>Ban:</strong> ' + durationText : '') + '</p><div class="flex gap-2 mt-3 flex-wrap">' + banBadge + nullBadge + '<button onclick="editFormula(\'' + f.id + '\')" class="px-2 py-1 rounded text-xs font-bold" style="background:#1a237e;color:#fff;">Editar</button></div></div>';
        }).join('') + '</div>';
        loadSanctionsStats();
    } catch(e) { console.error('[SanctionsEngine]', e); }
}

async function loadSanctionsStats() {
    try {
        var { data, error } = await window.supabase.from('player_sanctions').select('*');
        if (error) throw error;
        document.getElementById('stat-applied').textContent = data ? data.length : 0;
        var total = 0;
        if (data) data.forEach(function(s) { total += parseFloat(s.penalty_pct) || 0; });
        document.getElementById('stat-total').textContent = total + '%';
    } catch(e) { console.error('[SanctionsStats]', e); }
}

function runSimulator() {
    var kills = parseInt(document.getElementById('sim-kills').value) || 0;
    var strikes = parseInt(document.getElementById('sim-strikes').value) || 0;
    var nullified = parseInt(document.getElementById('sim-nullified').value) || 0;
    if (kills <= 0) { document.getElementById('sim-result').classList.add('hidden'); return; }
    var killsWN = Math.max(0, kills - nullified);
    var penalty = 0;
    if (strikes === 1) penalty = 10;
    else if (strikes === 2) penalty = 30;
    else if (strikes >= 3) penalty = 50;
    var effKills = Math.round(killsWN * (1 - penalty / 100));
    var resultDiv = document.getElementById('sim-result');
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center"><div><div class="text-xs" style="color:#9fa8da;">Kills originales</div><div class="text-xl font-bold">' + kills + '</div></div><div><div class="text-xs" style="color:#9fa8da;">Kills anuladas</div><div class="text-xl font-bold text-red-400">-' + nullified + '</div></div><div><div class="text-xs" style="color:#9fa8da;">Penalizacion</div><div class="text-xl font-bold text-orange-400">-' + penalty + '%</div></div><div><div class="text-xs" style="color:#9fa8da;">Kills efectivas</div><div class="text-xl font-bold text-green-400">' + effKills + '</div></div></div>';
}

function openModal() {
    document.getElementById('formula-modal').classList.remove('hidden');
    document.getElementById('modal-title').textContent = 'Nueva Formula';
    document.getElementById('formula-id').value = '';
    document.getElementById('f-name').value = '';
    document.getElementById('f-desc').value = '';
    document.getElementById('f-strikes').value = '';
    document.getElementById('f-penalty').value = '';
    document.getElementById('f-rule').value = '';
    document.getElementById('f-nullifies').checked = false;
    document.getElementById('f-is-ban').checked = false;
    document.getElementById('f-ban-duration').value = '';
    document.getElementById('f-ban-duration').disabled = true;
}

function closeModal() { document.getElementById('formula-modal').classList.add('hidden'); }

async function editFormula(id) {
    try {
        var { data, error } = await window.supabase.from('strike_types').select('*').eq('id', id).single();
        if (error) throw error;
        var formula = parseFormulaLegend(data.legend);
        document.getElementById('formula-modal').classList.remove('hidden');
        document.getElementById('modal-title').textContent = 'Editar Formula';
        document.getElementById('formula-id').value = data.id;
        document.getElementById('f-name').value = data.name;
        document.getElementById('f-desc').value = data.description || '';
        document.getElementById('f-strikes').value = data.severity;
        document.getElementById('f-penalty').value = formula.penalty_pct;
        document.getElementById('f-rule').value = formula.rule_section_id || '';
        document.getElementById('f-nullifies').checked = formula.nullifies_kills;
        document.getElementById('f-is-ban').checked = formula.is_ban;
        document.getElementById('f-ban-duration').value = formula.ban_duration_hours || '';
        document.getElementById('f-ban-duration').disabled = !formula.is_ban;
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

async function saveFormula() {
    var id = document.getElementById('formula-id').value;
    var name = document.getElementById('f-name').value.trim();
    var desc = document.getElementById('f-desc').value.trim();
    var severity = parseInt(document.getElementById('f-strikes').value) || 1;
    var penalty = parseFloat(document.getElementById('f-penalty').value) || 0;
    var ruleId = document.getElementById('f-rule').value || null;
    var nullifies = document.getElementById('f-nullifies').checked;
    var isBan = document.getElementById('f-is-ban').checked;
    var banDuration = document.getElementById('f-ban-duration').value;
    if (!name) { window.showToast('Nombre obligatorio', 'error'); return; }
    if (severity < 1 || severity > 3) { window.showToast('Severidad debe ser 1, 2 o 3', 'error'); return; }
    try {
        var legend = buildFormulaLegend(penalty, nullifies, isBan, banDuration, ruleId);
        var payload = {
            name: name,
            description: desc,
            severity: severity,
            legend: legend,
            nullifies_kills: nullifies,
            is_ban: isBan,
            ban_duration_hours: isBan ? (banDuration ? parseInt(banDuration) : null) : null,
            rule_section_id: ruleId
        };
        if (id) {
            var { error } = await window.supabase.from('strike_types').update(payload).eq('id', id);
        } else {
            payload.code = 'custom_' + Date.now();
            payload.is_active = true;
            var { error } = await window.supabase.from('strike_types').insert(payload);
        }
        if (error) throw error;
        window.showToast('Guardado', 'success');
        closeModal();
        loadFormulas();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

window.requireAdmin();
loadRuleSectionsSelect().then(function() {
    loadFormulas();
});
