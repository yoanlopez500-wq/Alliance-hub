// assets/js/base.js v15 - Alliance Hub utilities
// FIX v15: supabase → window.supabase en todas las funciones async
//          generatePlayerToken → window.generatePlayerToken (strict mode compat)
// NOTA: Funciones de autenticacion viven en auth-core.js (single source of truth).

window.__AH_BASE_PATH = (function() {
    var parts = window.location.pathname.split('/').filter(function(p) { return p.length > 0; });
    if (parts.length >= 1 && (parts[0] === 'admin' || parts[0] === 'chat' || parts[0] === 'register')) {
        return '/';
    }
    if (parts.length >= 1) {
        var knownPages = ['index.html','login.html','login-player.html','rankings.html','game.html','player.html','dashboard.html','reset-password.html','chat.html','404.html','manifest.json','assets','register','service-worker.js','course','landing.html','leader-dashboard.html','alliance-panel.html'];
        if (knownPages.indexOf(parts[0]) === -1) return '/' + parts[0] + '/';
    }
    if (parts.length >= 2) return '/' + parts[0] + '/';
    return '/';
})();

function ahPath(relative) { var base = window.__AH_BASE_PATH; if (!base.endsWith('/')) base += '/'; return base + relative.replace(/^\//, ''); }

function showToast(message, type) {
    var toast = document.createElement('div');
    var bg = type === 'error' ? 'rgba(198,40,40,0.9)' : type === 'warning' ? 'rgba(255,143,0,0.9)' : type === 'info' ? 'rgba(33,150,243,0.9)' : 'rgba(46,125,50,0.9)';
    var textColor = type === 'warning' ? '#1a1a2e' : '#fff';
    toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;padding:12px 20px;border-radius:12px;font-weight:700;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.3);animation:fadeIn 0.3s ease-out;background:' + bg + ';color:' + textColor + ';';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.5s'; setTimeout(function(){toast.remove()}, 500); }, 3000);
}

function formatDate(iso) { if (!iso) return '-'; var d = new Date(iso); var now = new Date(); var diff = now - d; if (diff < 60000) return 'hace un momento'; if (diff < 3600000) return 'hace ' + Math.floor(diff / 60000) + ' min'; if (diff < 86400000) return 'hace ' + Math.floor(diff / 3600000) + ' h'; return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }
function formatDateTime(iso) { if (!iso) return '-'; return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function showLoading(containerId, message) { var c = document.getElementById(containerId); if (c) c.innerHTML = '<div class="text-center py-8" style="color:#9fa8da;">' + (message || 'Cargando...') + '</div>'; }
function confirmAction(message) { return confirm(message || 'Estas seguro?'); }

function getStatusBadge(status) {
    var badges = { draft: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(255,255,255,0.05);color:#9fa8da">BORRADOR</span>', open: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(76,175,80,0.15);color:#4caf50">ABIERTA</span>', in_progress: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(33,150,243,0.15);color:#2196f3">EN CURSO</span>', finished: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(156,39,176,0.15);color:#ce93d8">FINALIZADA</span>', archived: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(255,255,255,0.05);color:#9fa8da">ARCHIVADA</span>', cancelled: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(198,40,40,0.15);color:#ef5350">CANCELADA</span>' };
    return badges[status] || '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(255,255,255,0.05);color:#9fa8da">' + (status || '?') + '</span>';
}

function getStatusBadgePlayer(status) {
    if (status === 'active') return '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(46,125,50,0.15);color:#4caf50">ACTIVO</span>';
    if (status === 'banned') return '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(198,40,40,0.15);color:#ef5350">BANEADO</span>';
    if (status === 'suspended') return '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(255,143,0,0.15);color:#ff8f00">SUSPENDIDO</span>';
    return '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(255,255,255,0.05);color:#9fa8da">' + (status || '?') + '</span>';
}

function getTypeBadge(type) {
    var badges = { internal: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(255,143,0,0.1);color:#ff8f00">INTERNA</span>', duel: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(239,83,80,0.1);color:#ef5350">DUELO</span>', public_31: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(33,150,243,0.1);color:#4fc3f7">PUBLICA 31</span>', public_500: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(156,39,176,0.1);color:#ce93d8">EVENTO 500</span>', public_quick: '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(76,175,80,0.1);color:#81c784">RAPIDA</span>' };
    return badges[type] || '<span class="px-2 py-0.5 rounded text-xs font-bold" style="background:rgba(255,255,255,0.05);color:#9fa8da">' + (type || '?') + '</span>';
}

// FIX v15: window.supabase para compatibilidad strict mode
async function removeRegistration(regId, playerName) { if (!confirm('Quitar a ' + (playerName || 'este jugador') + ' de la partida?')) return; try { var { error } = await window.supabase.from('match_registrations').delete().eq('id', regId); if (error) { showToast('Error: ' + error.message, 'error'); return; } showToast('Jugador quitado de la partida', 'success'); setTimeout(function() { location.reload(); }, 500); } catch(e) { showToast('Error: ' + e.message, 'error'); } }

function openSuspendModal(playerId, playerName) { if (!confirm('Suspender a ' + (playerName || 'este jugador') + '?')) return; suspendPlayer(playerId); }
async function suspendPlayer(playerId) { try { var { error } = await window.supabase.from('players').update({ status: 'suspended' }).eq('id', playerId); if (error) { showToast('Error: ' + error.message, 'error'); return; } showToast('Jugador suspendido', 'success'); setTimeout(function(){location.reload()},500); } catch(e) { showToast('Error: ' + e.message, 'error'); } }
async function reactivatePlayer(playerId) { try { var { error } = await window.supabase.from('players').update({ status: 'active', suspension_reason: null }).eq('id', playerId); if (error) { showToast('Error: ' + error.message, 'error'); return; } showToast('Jugador reactivado', 'success'); setTimeout(function(){location.reload()},500); } catch(e) { showToast('Error: ' + e.message, 'error'); } }

// Player session helpers
function getPlayerData() { try { var pid = localStorage.getItem('ah_v2_player_id'); var name = localStorage.getItem('ah_v2_player_name'); var token = localStorage.getItem('ah_v2_player_token'); if (!pid || !token) return null; return { playerId: pid, displayName: name, token: token }; } catch(e) { return null; } }
function setPlayerData(playerId, displayName, token) { localStorage.setItem('ah_v2_player_id', playerId); localStorage.setItem('ah_v2_player_name', displayName); localStorage.setItem('ah_v2_player_token', token); }
function clearPlayerData() { localStorage.removeItem('ah_v2_player_id'); localStorage.removeItem('ah_v2_player_name'); localStorage.removeItem('ah_v2_player_token'); }
function requirePlayer() { var pd = getPlayerData(); if (!pd) { showToast('Debes iniciar sesion como jugador primero', 'error'); return false; } return pd; }

// FIX v15: window.generatePlayerToken (strict mode compat)
async function savePlayerSession(playerId, displayName) {
    var result = await window.generatePlayerToken(playerId, displayName);
    if (result && result.success) {
        setPlayerData(playerId, displayName, result.token);
        return true;
    }
    console.error('savePlayerSession failed:', result ? result.message : 'no result');
    return false;
}

// Player logout
function logoutPlayer() {
    clearPlayerData();
    showToast('Sesion de jugador cerrada', 'success');
    setTimeout(function() { window.location.href = 'index.html'; }, 500);
}
