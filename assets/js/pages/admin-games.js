var allGames = [];
var allAlliances = [];

async function loadAlliances() {
    try {
        var { data, error } = await window.supabase.from('alliances').select('id,name').order('name');
        if (error) throw error;
        allAlliances = data || [];
        var sel = document.getElementById('game-alliance');
        sel.innerHTML = '<option value="">Ninguna</option>' + allAlliances.map(function(a){ return '<option value="'+a.id+'">'+a.name+'</option>'; }).join('');
    } catch(e) { console.error(e); }
}

async function loadGames() {
    try {
        var { data, error } = await window.supabase.from('matches').select('*').order('created_at', {ascending: false});
        if (error) throw error;
        allGames = data || [];
        renderGames(allGames);
    } catch(e) { console.error(e); document.getElementById('games-list').innerHTML = '<div class="text-red-400">Error: '+e.message+'</div>'; }
}

function renderGames(list) {
    var container = document.getElementById('games-list');
    if (!list || list.length === 0) { container.innerHTML = '<div class="text-center py-8 text-slate-400">No hay partidas</div>'; return; }
    container.innerHTML = list.map(function(g) {
        var typeLabel = {internal: 'Interna', duel: 'Duelo', tournament: 'Torneo'}[g.match_type] || g.match_type;
        var statusColor = {draft: 'bg-slate-600', open: 'bg-green-600', in_progress: 'bg-yellow-600', finished: 'bg-blue-600', archived: 'bg-slate-500'}[g.status] || 'bg-slate-600';
        return '<div class="bg-slate-800 rounded-lg p-4 border border-slate-700 flex items-center justify-between"><div><div class="flex items-center gap-2"><span class="px-2 py-0.5 rounded text-xs font-bold '+statusColor+' text-white">'+g.status+'</span><span class="text-sm text-slate-400">'+typeLabel+'</span></div><h3 class="font-bold text-white mt-1">'+g.name+'</h3><p class="text-xs text-slate-400">'+ (g.description || '') + '</p></div><div class="flex gap-2"><a href="game-detail.html?id='+g.id+'" class="px-3 py-1.5 rounded text-sm font-bold bg-blue-600 text-white">Ver</a><button onclick="editGame(\''+g.id+'\')" class="px-3 py-1.5 rounded text-sm font-bold bg-slate-600 text-white">Editar</button><button onclick="deleteGame(\''+g.id+'\')" class="px-3 py-1.5 rounded text-sm font-bold bg-red-600 text-white">Eliminar</button></div></div>';
    }).join('');
}

function filterGames(status) {
    document.querySelectorAll('.filter-btn').forEach(function(b) {
        b.style.background = b.dataset.filter === status ? '#1a237e' : 'transparent';
        b.style.border = b.dataset.filter === status ? 'none' : '1px solid #1a237e';
    });
    if (status === 'all') renderGames(allGames);
    else renderGames(allGames.filter(function(g) { return g.status === status; }));
}

function openGameModal() { document.getElementById('game-modal').classList.remove('hidden'); document.getElementById('modal-title').textContent = 'Nuevo Game'; document.getElementById('game-id').value = ''; }
function closeGameModal() { document.getElementById('game-modal').classList.add('hidden'); }

async function editGame(id) {
    var g = allGames.find(function(x) { return x.id === id; });
    if (!g) return;
    document.getElementById('game-modal').classList.remove('hidden');
    document.getElementById('modal-title').textContent = 'Editar Game';
    document.getElementById('game-id').value = g.id;
    document.getElementById('game-name').value = g.name || '';
    document.getElementById('game-desc').value = g.description || '';
    document.getElementById('game-type').value = g.match_type || 'internal';
    document.getElementById('game-max').value = g.max_players || 10;
    document.getElementById('game-alliance').value = g.alliance_id || '';
    document.getElementById('game-game-id').value = g.game_id || '';
    document.getElementById('game-password').value = g.password || '';
}

async function saveGame() {
    var id = document.getElementById('game-id').value;
    var payload = {
        name: document.getElementById('game-name').value,
        description: document.getElementById('game-desc').value,
        match_type: document.getElementById('game-type').value,
        max_players: parseInt(document.getElementById('game-max').value) || 10,
        alliance_id: document.getElementById('game-alliance').value || null,
        game_id: document.getElementById('game-game-id').value || null,
        password: document.getElementById('game-password').value || null
    };
    try {
        if (id) { var { error } = await window.supabase.from('matches').update(payload).eq('id', id); }
        else { payload.status = 'draft'; var { error } = await window.supabase.from('matches').insert(payload); }
        if (error) throw error;
        closeGameModal(); loadGames();
    } catch(e) { alert('Error: ' + e.message); }
}

async function deleteGame(id) {
    if (!confirm('Eliminar esta partida?')) return;
    try { var { error } = await window.supabase.from('matches').delete().eq('id', id); if (error) throw error; loadGames(); }
    catch(e) { alert('Error: ' + e.message); }
}

loadAlliances();
loadGames();
