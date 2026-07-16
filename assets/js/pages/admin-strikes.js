var allStrikes = [];
var strikeTypesMap = {};
var playersMap = {};
var matchesMap = {};
var strikeEvidenceFiles = [];

// --- Evidence handlers for strike modal ---
function handleStrikeEvidence(files) {
    var statusEl = document.getElementById('evidence-status-strike');
    if (!files || files.length === 0) return;
    if (strikeEvidenceFiles.length + files.length > STORAGE_CONFIG.maxFilesPerUpload) {
        statusEl.textContent = 'Maximo ' + STORAGE_CONFIG.maxFilesPerUpload + ' archivos';
        statusEl.classList.remove('hidden');
        return;
    }
    for (var i = 0; i < files.length; i++) {
        if (strikeEvidenceFiles.length >= STORAGE_CONFIG.maxFilesPerUpload) break;
        strikeEvidenceFiles.push(files[i]);
    }
    renderStrikeEvidencePreviews();
    statusEl.textContent = strikeEvidenceFiles.length + ' archivo(s) seleccionado(s)';
    statusEl.classList.remove('hidden');
}

function renderStrikeEvidencePreviews() {
    var previewEl = document.getElementById('evidence-preview-strike');
    previewEl.innerHTML = strikeEvidenceFiles.map(function(file, idx) {
        var isVideo = file.type.startsWith('video/');
        var url = URL.createObjectURL(file);
        if (isVideo) {
            return '<div class="evidence-preview-item"><video src="' + url + '" class="w-full h-16 object-cover"></video><button type="button" class="remove-btn" onclick="removeStrikeEvidence(' + idx + ')">&#10005;</button></div>';
        }
        return '<div class="evidence-preview-item"><img src="' + url + '" class="w-full h-16 object-cover"><button type="button" class="remove-btn" onclick="removeStrikeEvidence(' + idx + ')">&#10005;</button></div>';
    }).join('');
}

function removeStrikeEvidence(idx) {
    strikeEvidenceFiles.splice(idx, 1);
    renderStrikeEvidencePreviews();
    var statusEl = document.getElementById('evidence-status-strike');
    if (strikeEvidenceFiles.length === 0) { statusEl.classList.add('hidden'); }
    else { statusEl.textContent = strikeEvidenceFiles.length + ' archivo(s) seleccionado(s)'; }
}

var strikeDropzone = document.getElementById('evidence-dropzone-strike');
strikeDropzone.addEventListener('dragover', function(e) { e.preventDefault(); strikeDropzone.classList.add('dragover'); });
strikeDropzone.addEventListener('dragleave', function() { strikeDropzone.classList.remove('dragover'); });
strikeDropzone.addEventListener('drop', function(e) { e.preventDefault(); strikeDropzone.classList.remove('dragover'); handleStrikeEvidence(e.dataTransfer.files); });

async function loadStrikes() {
    try {
        var typesRes = await window.supabase.from('strike_types').select('*').order('severity');
        strikeTypesMap = {};
        (typesRes.data || []).forEach(function(t) { strikeTypesMap[t.id] = t; });

        var { data: strikesData, error } = await window.supabase.from('player_strikes')
            .select('*, evidence_urls, players(id, current_username, current_alliance_id)')
            .order('applied_at', { ascending: false })
            .limit(100);
        if (error) throw error;

        var matchIds = (strikesData || []).map(function(s) { return s.match_id; }).filter(function(v) { return !!v; });
        matchesMap = {};
        if (matchIds.length > 0) {
            try {
                var uniqueMatchIds = matchIds.filter(function(v, i, a) { return a.indexOf(v) === i; });
                var mRes = await window.supabase.from('matches').select('id, name').in('id', uniqueMatchIds);
                (mRes.data || []).forEach(function(m) { matchesMap[m.id] = m; });
            } catch(e) {}
        }

        allStrikes = (strikesData || []).map(function(s) {
            s.strike_types = strikeTypesMap[s.strike_type_id] || null;
            s.matches = s.match_id ? (matchesMap[s.match_id] || null) : null;
            return s;
        });

        var counts = { leve: 0, medio: 0, grave: 0, nullifier: 0 };
        allStrikes.forEach(function(s) {
            if (s.strike_types) {
                var sev = s.strike_types.severity;
                if (sev === 1) counts.leve++;
                else if (sev === 2) counts.medio++;
                else if (sev === 3 && s.strike_types.nullifies_kills) counts.nullifier++;
                else if (sev === 3) counts.grave++;
            }
        });
        document.getElementById('stat-leve').textContent = counts.leve;
        document.getElementById('stat-medio').textContent = counts.medio;
        document.getElementById('stat-grave').textContent = counts.grave;
        document.getElementById('stat-nullifier').textContent = counts.nullifier;

        var list = document.getElementById('strikes-list');
        if (allStrikes.length === 0) { AhComponents.inject('empty-state', { message: 'No hay strikes registrados', icon: '&#9889;' }, 'strikes-list'); return; }
        renderStrikes(allStrikes);
    } catch(e) { console.error('[Strikes]', e); AhComponents.inject('error-state', { message: 'Error: ' + (e.message || e), retry: true, onRetry: 'loadStrikes()' }, 'strikes-list'); }
}

function renderStrikes(data) {
    var list = document.getElementById('strikes-list');
    list.innerHTML = data.map(function(s) {
        var type = s.strike_types || {};
        var sevColor = type.severity === 1 ? '#4caf50' : type.severity === 2 ? '#ff8f00' : '#ef5350';
        var sevLabel = type.severity === 1 ? 'LEVE' : type.severity === 2 ? 'MEDIO' : 'GRAVE';
        var isNullifier = type.nullifies_kills ? ' <span class="px-2 py-0.5 rounded text-xs font-bold bg-purple-400/10 text-purple-400">KILL NULLIFIER</span>' : '';
        var playerName = s.players ? s.players.current_username : 'Jugador ' + s.player_id;
        var matchName = s.matches ? s.matches.name : (s.match_id ? 'Partida ' + s.match_id : '-');
        var evBadge = (s.evidence_urls && s.evidence_urls.length > 0) ? ' <span class="px-2 py-0.5 rounded text-xs font-bold bg-orange-500/15 text-orange-500">&#128247; ' + s.evidence_urls.length + '</span>' : '';
        return '<div class="strike-card rounded-xl p-4 bg-slate-900 cursor-pointer" onclick="openViewModal(' + s.id + ')"><div class="flex items-start justify-between"><div class="flex-1"><div class="flex items-center gap-2 flex-wrap"><h3 class="font-bold">' + playerName + '</h3><span class="px-2 py-0.5 rounded text-xs font-bold" style="background:' + sevColor + '20;color:' + sevColor + ';">' + sevLabel + '</span>' + isNullifier + evBadge + '</div><p class="text-sm mt-1 text-slate-100">' + s.reason + '</p><p class="text-xs mt-1 text-slate-400">Partida: ' + matchName + ' | ' + window.formatDate(s.applied_at) + (s.strike_types ? ' | ' + s.strike_types.code + ': ' + s.strike_types.name : '') + '</p></div><button onclick="event.stopPropagation();removeStrike(' + s.id + ')" class="px-2 py-1 rounded text-xs bg-red-500/30 text-red-400 min-h-[28px]">Revocar</button></div></div>';
    }).join('');
}

function filterStrikes(query) {
    var q = query.toLowerCase();
    var filtered = allStrikes.filter(function(s) { var name = s.players ? s.players.current_username : ''; return name.toLowerCase().includes(q); });
    renderStrikes(filtered);
}

async function loadDropdowns() {
    try {
        var { data: types } = await window.supabase.from('strike_types').select('*').eq('is_active', true).order('severity');
        var typeSelect = document.getElementById('s-type');
        if (types) typeSelect.innerHTML = '<option value="">Seleccionar...</option>' + types.map(function(t) { return '<option value="' + t.id + '" data-severity="' + t.severity + '" data-legend="' + (t.legend || '') + '">' + t.name + '</option>'; }).join('');
        var { data: matches } = await window.supabase.from('matches').select('id, name').order('created_at', { ascending: false }).limit(50);
        var matchSelect = document.getElementById('s-match');
        if (matches) matchSelect.innerHTML = '<option value="">Seleccionar partida...</option>' + matches.map(function(m) { return '<option value="' + m.id + '">' + m.name + '</option>'; }).join('');
        var { data: rules } = await window.supabase.from('rule_sections').select('id, title').eq('is_active', true).order('order_index');
        var ruleSelect = document.getElementById('s-rule');
        if (rules) ruleSelect.innerHTML = '<option value="">Seleccionar seccion...</option>' + rules.map(function(r) { return '<option value="' + r.id + '">' + r.title + '</option>'; }).join('');
        var filterType = document.getElementById('filter-type');
        if (types) filterType.innerHTML = '<option value="">Todos los tipos</option>' + types.map(function(t) { return '<option value="' + t.id + '">' + t.name + '</option>'; }).join('');
    } catch(e) { console.error('[Dropdowns]', e); }
}

function showRuleHint() {
    var select = document.getElementById('s-type');
    var option = select.options[select.selectedIndex];
    var legend = option.dataset.legend;
    var hint = document.getElementById('rule-hint');
    if (legend) { hint.textContent = legend; hint.classList.remove('hidden'); } else { hint.classList.add('hidden'); }
}

function openModal() { document.getElementById('strike-modal').classList.remove('hidden'); loadDropdowns(); }
function closeModal() {
    document.getElementById('strike-modal').classList.add('hidden');
    strikeEvidenceFiles = [];
    document.getElementById('evidence-preview-strike').innerHTML = '';
    document.getElementById('evidence-status-strike').classList.add('hidden');
}

async function saveStrike() {
    var playerId = parseInt(document.getElementById('s-player-id').value);
    var matchId = document.getElementById('s-match').value || null;
    var typeId = document.getElementById('s-type').value;
    var ruleId = document.getElementById('s-rule').value || null;
    var reason = document.getElementById('s-reason').value.trim();
    var notes = document.getElementById('s-notes').value.trim() || null;
    if (!playerId || !typeId || !reason) { window.showToast('Jugador, tipo y razon son obligatorios', 'error'); return; }
    try {
        var { data: { session } } = await window.supabase.auth.getSession();

        // Upload evidence if any
        var evidenceUrls = [];
        if (strikeEvidenceFiles.length > 0) {
            var targetId = 'strike_' + Date.now();
            evidenceUrls = await compressAndUpload(strikeEvidenceFiles, 'strikes', targetId);
        }

        var insertPayload = {
            player_id: playerId,
            match_id: matchId,
            strike_type_id: typeId,
            reason: reason,
            notes: notes,
            rule_section_id: ruleId,
            applied_by: session.user.id
        };
        if (evidenceUrls.length > 0) {
            insertPayload.evidence_urls = evidenceUrls;
        }

        var { error } = await window.supabase.from('player_strikes').insert(insertPayload);
        if (error) throw error;

        try {
            var typeInfo = strikeTypesMap[typeId] || {};
            var sevLabel = typeInfo.severity === 1 ? 'Leve' : typeInfo.severity === 2 ? 'Medio' : 'Grave';
            await window.supabase.from('reports').insert({
                player_id: playerId,
                match_id: matchId,
                type: 'strike_' + sevLabel.toLowerCase(),
                reason: '[AUTO] Strike ' + sevLabel + ': ' + (typeInfo.name || '') + ' - ' + reason,
                status: 'resolved',
                reported_by: session.user.id
            });
        } catch(repErr) { console.log('[Strikes] No se pudo crear reporte automatico:', repErr.message); }

        window.showToast('Strike aplicado correctamente', 'success');
        closeModal();
        loadStrikes();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

async function removeStrike(id) {
    if (!confirm('Revocar este strike?')) return;
    try {
        var { error } = await window.supabase.from('player_strikes').delete().eq('id', id);
        if (error) throw error;
        window.showToast('Strike revocado', 'success');
        loadStrikes();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

// --- View modal for strike detail + evidence ---
function openViewModal(id) {
    var s = allStrikes.find(function(x) { return x.id === id; });
    if (!s) return;
    var type = s.strike_types || {};
    var sevColor = type.severity === 1 ? '#4caf50' : type.severity === 2 ? '#ff8f00' : '#ef5350';
    var sevLabel = type.severity === 1 ? 'LEVE' : type.severity === 2 ? 'MEDIO' : 'GRAVE';
    var playerName = s.players ? s.players.current_username : 'Jugador ' + s.player_id;
    var matchName = s.matches ? s.matches.name : (s.match_id ? 'Partida ' + s.match_id : '-');

    document.getElementById('v-title').textContent = 'Strike - ' + playerName;
    document.getElementById('v-content').innerHTML =
        '<div class="flex items-center gap-2 mb-3 flex-wrap">' +
        '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:' + sevColor + '20;color:' + sevColor + ';">' + sevLabel + '</span>' +
        (type.nullifies_kills ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-purple-400/10 text-purple-400">KILL NULLIFIER</span>' : '') +
        '<span class="text-xs text-slate-400">' + window.formatDate(s.applied_at) + '</span></div>' +
        '<p class="text-sm mb-2"><strong>Razon:</strong> ' + s.reason + '</p>' +
        '<p class="text-sm mb-2"><strong>Partida:</strong> ' + matchName + '</p>' +
        (s.notes ? '<p class="text-sm mb-2 text-slate-400"><strong>Notas:</strong> ' + s.notes + '</p>' : '');

    var evDiv = document.getElementById('v-evidence');
    if (s.evidence_urls && s.evidence_urls.length > 0) {
        evDiv.classList.remove('hidden');
        evDiv.innerHTML = '<h4 class="font-bold text-sm mb-2 text-amber-400">&#128247; Evidencia adjunta:</h4><div id="strike-evidence-grid"></div>';
        renderEvidenceGrid(s.evidence_urls, 'strike-evidence-grid');
    } else {
        evDiv.classList.add('hidden');
        evDiv.innerHTML = '';
    }

    document.getElementById('view-modal').classList.remove('hidden');
}

function closeViewModal() {
    document.getElementById('view-modal').classList.add('hidden');
}

// --- URL Prefill: open modal with prefill_player and prefill_match ---
var urlParamsStrikes = new URLSearchParams(window.location.search);
var prefillPlayer = urlParamsStrikes.get('prefill_player');
var prefillMatch = urlParamsStrikes.get('prefill_match');

async function applyPrefill() {
    if (!prefillPlayer && !prefillMatch) return;
    await loadDropdowns();
    if (prefillPlayer) {
        document.getElementById('s-player-id').value = prefillPlayer;
    }
    if (prefillMatch) {
        document.getElementById('s-match').value = prefillMatch;
    }
    document.getElementById('strike-modal').classList.remove('hidden');
}

window.requireAdmin();
loadStrikes();
applyPrefill();