var formulasCache = [];
async function loadFormulas() {
    try {
        var { data, error } = await window.supabase.from('strike_types').select('*').order('severity');
        if (error) throw error;
        formulasCache = data || [];
        var list = document.getElementById('formulas-list');
        document.getElementById('stat-active').textContent = data ? data.length : 0;
        if (!data || data.length === 0) { list.innerHTML = '<div class="text-center py-8" style="color:#9fa8da;">No hay formulas. Crea la primera.</div>'; return; }
        list.innerHTML = '<div class="grid md:grid-cols-2 gap-3">' + data.map(function(f) {
            var sevColor = f.severity === 1 ? '#4caf50' : f.severity === 2 ? '#ff8f00' : '#ef5350';
            var sevLabel = f.severity === 1 ? 'LEVE' : f.severity === 2 ? 'MEDIO' : 'GRAVE';
            return '<div class="formula-card rounded-xl p-4" style="background:#11183a;border:1px solid #1a237e;"><div class="flex items-center justify-between mb-2"><h3 class="font-bold">' + f.name + '</h3><span class="px-2 py-0.5 rounded text-xs font-bold" style="background:' + sevColor + '20;color:' + sevColor + ';">' + sevLabel + '</span></div><p class="text-sm mb-2" style="color:#9fa8da;">' + (f.description || 'Sin descripcion') + '</p><p class="text-xs" style="color:#9fa8da;"><strong style="color:#ff8f00;">Penalizacion:</strong> ' + (f.legend || '-') + '</p><div class="flex gap-2 mt-3"><button onclick="editFormula(\'' + f.id + '\')" class="px-2 py-1 rounded text-xs font-bold" style="background:#1a237e;color:#fff;">Editar</button></div></div>';
        }).join('') + '</div>';
        loadSanctionsStats();
    } catch(e) { console.error('[SanctionsEngine]', e); }
}
async function loadSanctionsStats() {
    try { var { data, error } = await window.supabase.from('player_sanctions').select('*'); if (error) throw error; document.getElementById('stat-applied').textContent = data ? data.length : 0; var total = 0; if (data) data.forEach(function(s) { total += s.penalty_pct || 0; }); document.getElementById('stat-total').textContent = total + '%'; } catch(e) { console.error('[SanctionsStats]', e); }
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
function openModal() { document.getElementById('formula-modal').classList.remove('hidden'); document.getElementById('modal-title').textContent = 'Nueva Formula'; document.getElementById('formula-id').value = ''; document.getElementById('f-name').value = ''; document.getElementById('f-desc').value = ''; document.getElementById('f-strikes').value = ''; document.getElementById('f-penalty').value = ''; }
function closeModal() { document.getElementById('formula-modal').classList.add('hidden'); }
async function editFormula(id) { try { var { data, error } = await window.supabase.from('strike_types').select('*').eq('id', id).single(); if (error) throw error; document.getElementById('formula-modal').classList.remove('hidden'); document.getElementById('modal-title').textContent = 'Editar Formula'; document.getElementById('formula-id').value = data.id; document.getElementById('f-name').value = data.name; document.getElementById('f-desc').value = data.description || ''; document.getElementById('f-strikes').value = data.severity; document.getElementById('f-penalty').value = data.severity * 10; } catch(e) { window.showToast('Error: ' + e.message, 'error'); } }
async function saveFormula() { var id = document.getElementById('formula-id').value; var name = document.getElementById('f-name').value.trim(); var desc = document.getElementById('f-desc').value.trim(); var severity = parseInt(document.getElementById('f-strikes').value) || 1; var penalty = parseInt(document.getElementById('f-penalty').value) || 0; if (!name) { window.showToast('Nombre obligatorio', 'error'); return; } try { if (id) { var { error } = await window.supabase.from('strike_types').update({ name, description: desc, severity, legend: '-' + penalty + '% kills' }).eq('id', id); } else { var { error } = await window.supabase.from('strike_types').insert({ name, description: desc, severity, code: 'custom_' + Date.now(), legend: '-' + penalty + '% kills', nullifies_kills: penalty >= 50 }); } if (error) throw error; window.showToast('Guardado', 'success'); closeModal(); loadFormulas(); } catch(e) { window.showToast('Error: ' + e.message, 'error'); } }
window.requireAdmin();
loadFormulas();
