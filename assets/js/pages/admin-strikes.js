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

        allStrikes = (strikesData || []).filter(function(s) { return s.status !== 'removed'; }).map(function(s) {
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
        var removedBadge = s.status === 'removed' ? ' <span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-500/20 text-slate-400">REMOVIDO</span>' : '';
        var revokeBtn = s.status === 'removed' ? '' : '<button onclick="event.stopPropagation();removeStrike(\'' + s.id + '\')" class="px-2 py-1 rounded text-xs bg-red-500/30 text-red-400 min-h-[28px]">Revocar</button>';
        return '<div class="strike-card rounded-xl p-4 bg-slate-900 cursor-pointer" onclick="openViewModal(\'' + s.id + '\')"><div class="flex items-start justify-between"><div class="flex-1"><div class="flex items-center gap-2 flex-wrap"><h3 class="font-bold">' + playerName + '</h3><span class="px-2 py-0.5 rounded text-xs font-bold" style="background:' + sevColor + '20;color:' + sevColor + ';">' + sevLabel + '</span>' + isNullifier + evBadge + removedBadge + '</div><p class="text-sm mt-1 text-slate-100">' + s.reason + '</p><p class="text-xs mt-1 text-slate-400">Partida: ' + matchName + ' | ' + window.formatDate(s.applied_at) + (s.strike_types ? ' | ' + s.strike_types.code + ': ' + s.strike_types.name : '') + '</p></div>' + revokeBtn + '</div></div>';
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

        var typeInfo = strikeTypesMap[typeId] || {};
        var now = new Date();
        var expiresAt = null;
        if (typeInfo.is_ban && typeInfo.ban_duration_hours) {
            expiresAt = new Date(now.getTime() + typeInfo.ban_duration_hours * 60 * 60 * 1000).toISOString();
        }

        var insertPayload = {
            player_id: playerId,
            match_id: matchId,
            strike_type_id: typeId,
            reason: reason,
            notes: notes,
            rule_section_id: ruleId,
            report_id: prefillReport || null,
            applied_by: session.user.id,
            status: 'active',
            expires_at: expiresAt
        };
        if (evidenceUrls.length > 0) {
            insertPayload.evidence_urls = evidenceUrls;
        }

        var { data: newStrike, error } = await window.supabase.from('player_strikes').insert(insertPayload).select('id').single();
        if (error) throw error;

        // Apply ban side-effect if the strike type is a ban
        if (typeInfo.is_ban) {
            try {
                await window.supabase.from('players').update({
                    status: 'banned',
                    banned_until: expiresAt,
                    suspension_reason: reason
                }).eq('id', playerId);
            } catch(banErr) { console.error('[Strikes] No se pudo aplicar ban:', banErr.message); }
        }

        // Insert sanction snapshot
        try {
            // Calcular kills validas del jugador (partidas publicas con registro)
            var { data: results } = await window.supabase.from('match_results')
                .select('kills, match_id, matches!inner(match_type)')
                .eq('player_id', playerId)
                .neq('matches.match_type', 'internal');
            var matchIds = [];
            (results || []).forEach(function(r) {
                if (r.match_id && matchIds.indexOf(r.match_id) === -1) matchIds.push(r.match_id);
            });
            var validMatches = {};
            if (matchIds.length > 0) {
                var { data: regs } = await window.supabase.from('match_registrations')
                    .select('match_id')
                    .eq('player_id', playerId)
                    .in('match_id', matchIds);
                (regs || []).forEach(function(r) { validMatches[r.match_id] = true; });
            }
            var killsBefore = 0;
            (results || []).forEach(function(r) {
                if (validMatches[r.match_id]) killsBefore += (r.kills || 0);
            });

            var formula = parseStrikeFormula(typeInfo.legend);
            var penaltyPct = formula.penalty_pct || 0;
            var killsAfter = typeInfo.nullifies_kills ? 0 : Math.round(killsBefore * (1 - penaltyPct / 100));
            var { data: playerBefore } = await window.supabase.from('players').select('status').eq('id', playerId).single();
            await window.supabase.from('player_sanctions').insert({
                player_id: playerId,
                strike_id: newStrike ? newStrike.id : null,
                strike_type_id: typeId,
                kills_before: killsBefore,
                kills_after: killsAfter,
                status_before: playerBefore ? playerBefore.status : null,
                status_after: typeInfo.is_ban ? 'banned' : (playerBefore ? playerBefore.status : null),
                penalty_pct: penaltyPct,
                formula_used: typeInfo.legend || null
            });
        } catch(sancErr) { console.error('[Strikes] No se pudo guardar sancion:', sancErr.message); }

        // Mark originating report as resolved with strike applied
        if (prefillReport) {
            try {
                await window.supabase.from('player_reports').update({
                    status: 'resolved',
                    strike_applied: true,
                    strike_id: newStrike ? newStrike.id : null,
                    resolved_at: now.toISOString(),
                    resolved_by: session.user.id,
                    admin_response: '[AUTO] Strike aplicado: ' + (typeInfo.name || '')
                }).eq('id', prefillReport);
            } catch(repErr) { console.log('[Strikes] No se pudo actualizar reporte:', repErr.message); }
        } else {
            // Legacy auto-report creation when not prefilled
            try {
                var sevLabel = typeInfo.severity === 1 ? 'Leve' : typeInfo.severity === 2 ? 'Medio' : 'Grave';
                await window.supabase.from('player_reports').insert({
                    reported_player_id: playerId,
                    match_id: matchId,
                    report_type: 'strike_' + sevLabel.toLowerCase(),
                    description: '[AUTO] Strike ' + sevLabel + ': ' + (typeInfo.name || '') + ' - ' + reason,
                    status: 'resolved',
                    resolved_by: session.user.id,
                    resolved_at: now.toISOString(),
                    admin_response: 'Strike aplicado automaticamente'
                });
            } catch(repErr) { console.log('[Strikes] No se pudo crear reporte automatico:', repErr.message); }
        }

        window.showToast(typeInfo.is_ban ? 'Ban aplicado correctamente' : 'Strike aplicado correctamente', 'success');
        closeModal();
        loadStrikes();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

async function removeStrike(id) {
    if (!confirm('Revocar este strike?')) return;
    var reason = prompt('Razon de la revocacion (opcional):') || '';
    console.log('[removeStrike] id=', id, 'reason=', reason);
    try {
        var { data: { session } } = await window.supabase.auth.getSession();
        var { data, error, count } = await window.supabase.from('player_strikes').update({
            status: 'removed',
            removed_at: new Date().toISOString(),
            removed_by: session.user.id,
            removal_reason: reason
        }).eq('id', id).select();
        if (error) throw error;
        console.log('[removeStrike] updated data=', data, 'count=', count);
        if (!data || data.length === 0) {
            window.showToast('No se encontro el strike para revocar (id: ' + id + ')', 'error');
            return;
        }
        window.showToast('Strike revocado', 'success');
        loadStrikes();
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

function parseStrikeFormula(legend) {
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
        // Legacy text legend fallback
        var penaltyMatch = legend.match(/(\d+)%/);
        return {
            penalty_pct: penaltyMatch ? parseInt(penaltyMatch[1]) : 0,
            nullifies_kills: /nullif/i.test(legend),
            is_ban: /ban/i.test(legend),
            ban_duration_hours: null
        };
    }
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

// --- Player search with autocomplete ---
var playerSearchTimeout = null;

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n').replace(/\r/g, '\\r');
}

function initPlayerSearch() {
    var input = document.getElementById('s-player-search');
    var suggestions = document.getElementById('s-player-suggestions');
    if (!input) return;
    input.addEventListener('input', function(e) {
        var q = e.target.value.trim();
        if (playerSearchTimeout) clearTimeout(playerSearchTimeout);
        if (!q) { suggestions.classList.add('hidden'); return; }
        playerSearchTimeout = setTimeout(function() { searchPlayers(q); }, 300);
    });
    input.addEventListener('focus', function() { if (input.value.trim()) suggestions.classList.remove('hidden'); });
    document.addEventListener('click', function(e) {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) suggestions.classList.add('hidden');
    });
}

async function searchPlayers(q) {
    var suggestions = document.getElementById('s-player-suggestions');
    try {
        var isNumber = /^\d+$/.test(q);
        var query = window.supabase.from('players').select('id, current_username').limit(10);
        if (isNumber) {
            query = query.or('id.eq.' + parseInt(q) + ',current_username.ilike.%' + q + '%');
        } else {
            query = query.ilike('current_username', '%' + q + '%');
        }
        var { data, error } = await query;
        if (error) throw error;
        renderPlayerSuggestions(data || []);
    } catch(e) {
        console.error('[PlayerSearch]', e);
        suggestions.classList.add('hidden');
    }
}

function renderPlayerSuggestions(players) {
    var suggestions = document.getElementById('s-player-suggestions');
    if (!players.length) { suggestions.classList.add('hidden'); return; }
    suggestions.innerHTML = players.map(function(p) {
        return '<div class="px-3 py-2 cursor-pointer hover:bg-indigo-900 text-sm text-slate-200" onclick="selectPlayer(' + p.id + ', \'' + escapeAttr(p.current_username) + '\')">' +
            '<span class="font-bold">' + p.current_username + '</span>' +
            '<span class="text-xs text-slate-500 ml-2 font-mono">ID: ' + p.id + '</span>' +
            '</div>';
    }).join('');
    suggestions.classList.remove('hidden');
}

function selectPlayer(id, name) {
    document.getElementById('s-player-id').value = id;
    document.getElementById('s-player-search').value = name;
    document.getElementById('s-player-suggestions').classList.add('hidden');
    var selected = document.getElementById('s-player-selected');
    selected.textContent = 'Seleccionado: ' + name + ' (ID: ' + id + ')';
    selected.classList.remove('hidden');
}

// --- URL Prefill: open modal with prefill_player, prefill_match and prefill_report ---
var urlParamsStrikes = new URLSearchParams(window.location.search);
var prefillPlayer = urlParamsStrikes.get('prefill_player');
var prefillMatch = urlParamsStrikes.get('prefill_match');
var prefillReport = urlParamsStrikes.get('prefill_report');

async function applyPrefill() {
    if (!prefillPlayer && !prefillMatch && !prefillReport) return;
    await loadDropdowns();
    if (prefillPlayer) {
        document.getElementById('s-player-id').value = prefillPlayer;
        try {
            var { data: p } = await window.supabase.from('players').select('current_username').eq('id', parseInt(prefillPlayer)).maybeSingle();
            if (p) {
                document.getElementById('s-player-search').value = p.current_username;
                var selected = document.getElementById('s-player-selected');
                selected.textContent = 'Seleccionado: ' + p.current_username + ' (ID: ' + prefillPlayer + ')';
                selected.classList.remove('hidden');
            }
        } catch(e) { console.error('[Prefill]', e); }
    }
    if (prefillMatch) {
        document.getElementById('s-match').value = prefillMatch;
    }
    document.getElementById('strike-modal').classList.remove('hidden');
}

window.requireAdmin();
loadStrikes();
initPlayerSearch();
applyPrefill();