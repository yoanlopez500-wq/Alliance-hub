var currentGameId = null;
var currentGame = null;
var allAlliances = [];

async function loadAlliancesDropdown() {
    try { var { data } = await window.supabase.from('alliances').select('id, name').order('name'); allAlliances = data || []; var select = document.getElementById('g-alliance'); select.innerHTML = '<option value="">Seleccionar...</option>' + allAlliances.map(function(a) { return '<option value="' + a.id + '">' + a.name + '</option>'; }).join(''); if (currentGame) document.getElementById('g-alliance').value = currentGame.alliance_id || ''; } catch(e) { console.error('[GameDetail] Error cargando alliances:', e); }
}

function getAllianceName(allianceId) {
    if (!allianceId || !allAlliances.length) return null;
    return allAlliances.find(function(x) { return x.id === allianceId; });
}

async function loadGame() {
    var params = new URLSearchParams(window.location.search);
    var gameId = params.get('id');
    var action = params.get('action');
    if (action === 'new') { showCreateForm(); return; }
    if (!gameId) { document.getElementById('game-header').innerHTML = '<div class="text-center py-8 text-red-400">ID no especificado</div>'; return; }
    currentGameId = gameId;
    try {
        var { data, error } = await window.supabase.from('matches').select('*').eq('id', gameId).single();
        if (error) throw error;
        currentGame = data;
        var alliance = getAllianceName(data.alliance_id);
        document.getElementById('game-header').innerHTML = '<div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold">&#127918; ' + (data.name || 'Game') + '</h1><p class="text-sm" style="color:#9fa8da;">' + (alliance ? alliance.name : 'Sin alianza') + ' | ' + window.getTypeBadge(data.match_type) + ' ' + window.getStatusBadge(data.status) + '</p></div><button onclick="showEditForm()" class="px-3 py-1.5 rounded-lg text-xs font-bold" style="background:#1a237e;color:#e8eaf6;">Editar</button></div>';
        document.getElementById('game-form').classList.add('hidden');
        loadAlliancesDropdown();
    } catch(e) { console.error('[GameDetail]', e); document.getElementById('game-header').innerHTML = '<div class="text-center py-8 text-red-400">Error: ' + e.message + '</div>'; }
}

function showCreateForm() { document.getElementById('game-header').innerHTML = '<h1 class="text-2xl font-bold">&#10133; Nuevo Game</h1>'; document.getElementById('game-form').classList.remove('hidden'); loadAlliancesDropdown(); }
function showEditForm() { if (!currentGame) return; document.getElementById('game-form').classList.remove('hidden'); document.getElementById('g-name').value = currentGame.name || ''; document.getElementById('g-status').value = currentGame.status || 'draft'; document.getElementById('g-type').value = currentGame.match_type || 'internal'; document.getElementById('g-rules-url').value = currentGame.rules_url || ''; }
function cancelEdit() { document.getElementById('game-form').classList.add('hidden'); }
async function saveGame() {
    var name = document.getElementById('g-name').value.trim();
    var allianceId = document.getElementById('g-alliance').value || null;
    var status = document.getElementById('g-status').value;
    var type = document.getElementById('g-type').value;
    var rulesUrl = document.getElementById('g-rules-url').value.trim() || null;
    if (!name) { window.showToast('Nombre obligatorio', 'error'); return; }
    try { if (currentGameId) { var { error } = await window.supabase.from('matches').update({ name, alliance_id: allianceId, status, match_type: type, rules_url: rulesUrl }).eq('id', currentGameId); } else { var { data: newGame, error } = await window.supabase.from('matches').insert({ name, alliance_id: allianceId, status, match_type: type, rules_url: rulesUrl }).select('id').single(); if (newGame) currentGameId = newGame.id; } if (error) throw error; window.showToast('Guardado', 'success'); if (!currentGame) window.location.href = 'game-detail.html?id=' + currentGameId; else { cancelEdit(); loadGame(); } } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}
window.requireAdmin();
loadGame();