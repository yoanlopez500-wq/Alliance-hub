/**
 * game.js - Logica de la pagina de partida (game.html)
 *
 * Extraido de game.html como parte de la refactorizacion.
 * Funciones: carga de partida, ganadores, chat, registros, resultados.
 *
 * v2: ganadores via public_match_winners_view y lookup de usernames via
 * public_players_view. La partida (loadMatch), el gate csv_imported, los
 * resultados (badge "no registrado") y el chat siguen leyendo tablas base.
 */
(function() {
    'use strict';

    var urlParams = new URLSearchParams(window.location.search);
    var matchId = urlParams.get('id');
    var shareToken = urlParams.get('token');
    var playerData = (typeof window.getPlayerData === 'function') ? window.getPlayerData() : {};

    if (!matchId) {
        location.href = 'index.html';
        return;
    }

    // ============================================================
    // REDIRECT FLUJO: Si no hay sesion, guardar URL y ir a login
    // ============================================================
    window.goToRegister = function(matchId) {
        var hasSession = playerData && playerData.playerId;
        if (!hasSession) {
            localStorage.setItem('ah_redirect_after_login', window.location.href);
            window.location.href = 'login-player.html';
        } else {
            window.location.href = 'register/index.html?match=' + matchId;
        }
    };

    // ============================================================
    // CARGAR PARTIDA
    // ============================================================
    async function loadMatch() {
        try {
            var { data: match, error } = await window.supabase.from('matches').select('*').eq('id', matchId).single();
            if (error || !match) {
                var header = document.getElementById('match-header');
                if (header) header.innerHTML = '<div class="text-center py-8 text-red-400">Partida no encontrada</div>';
                return;
            }

            var allianceA = null, allianceB = null, allianceMain = null;
            if (match.alliance_id) {
                var { data: am } = await window.supabase.from('alliances').select('name, tag').eq('id', match.alliance_id).single();
                allianceMain = am;
            }
            if (match.alliance_a_id) {
                var { data: aa } = await window.supabase.from('alliances').select('name, tag').eq('id', match.alliance_a_id).single();
                allianceA = aa;
            }
            if (match.alliance_b_id) {
                var { data: ab } = await window.supabase.from('alliances').select('name, tag').eq('id', match.alliance_b_id).single();
                allianceB = ab;
            }

            if (match.is_private && match.share_token !== shareToken) {
                var header = document.getElementById('match-header');
                if (header) {
                    header.innerHTML = '<div class="text-center text-xl text-red-400">&#128274; Partida Privada</div><p class="text-center mt-2 text-slate-400">Necesitas un enlace de invitacion.</p><div class="text-center mt-4"><a href="index.html" class="font-bold text-amber-400">&larr; Volver</a></div>';
                }
                return;
            }

            if (match.winners_declared) loadWinners(matchId);

            var allianceLabel = '';
            if (match.match_type === 'internal' && allianceMain) {
                allianceLabel = '&#127988; ' + allianceMain.name + ' [' + allianceMain.tag + ']';
            } else if (match.match_type === 'duel' && allianceA && allianceB) {
                allianceLabel = '&#9876;&#65039; ' + allianceA.name + ' vs ' + allianceB.name;
            } else {
                allianceLabel = '&#127758; Global';
            }

            var isRegistered = false, regStatus = null;
            var currentPlayer = null;
            if (playerData && playerData.playerId) {
                var [{ data: reg }, { data: player }] = await Promise.all([
                    window.supabase.from('match_registrations').select('status').eq('match_id', matchId).eq('player_id', playerData.playerId).maybeSingle(),
                    window.supabase.from('players').select('status, banned_until, suspended_until, suspension_reason').eq('id', playerData.playerId).maybeSingle()
                ]);
                isRegistered = !!reg;
                regStatus = reg ? reg.status : null;
                currentPlayer = player;
                if (currentPlayer) await checkAndClearExpiredBan(parseInt(playerData.playerId));
            }

            var isBanned = isPlayerBanned(currentPlayer);

            if (isRegistered && (regStatus === 'confirmed' || regStatus === 'approved') && !isBanned) {
                var reportSection = document.getElementById('report-section');
                var reportLink = document.getElementById('report-link');
                if (reportSection) reportSection.classList.remove('hidden');
                if (reportLink) reportLink.href = 'report.html?match_id=' + matchId;
            }

            var showCredentials = false, showWaiting = false, showBan = false;
            if (isBanned) {
                showBan = true;
            } else if (match.requires_approval) {
                if (regStatus === 'confirmed' || regStatus === 'approved') showCredentials = true;
                else if (regStatus === 'pending') showWaiting = true;
            } else {
                if (isRegistered) showCredentials = true;
            }

            if (showCredentials) {
                var creds = document.getElementById('match-credentials');
                var credGameId = document.getElementById('cred-game-id');
                var credPassword = document.getElementById('cred-password');
                if (creds) creds.classList.remove('hidden');
                if (credGameId) credGameId.textContent = match.game_id || '---';
                if (credPassword) credPassword.textContent = match.game_password || match.password || '---';
            }
            if (showWaiting) {
                var waitingBanner = document.getElementById('waiting-approval-banner');
                if (waitingBanner) waitingBanner.classList.remove('hidden');
            }
            if (showBan) {
                var banBanner = document.getElementById('ban-banner');
                if (banBanner) {
                    banBanner.classList.remove('hidden');
                    banBanner.innerHTML =
                        '<div class="text-4xl mb-3">&#128683;</div>' +
                        '<h2 class="font-bold text-red-400">Cuenta restringida</h2>' +
                        '<p class="text-sm mt-2 text-ah-muted">' + (currentPlayer.suspension_reason || 'Has recibido una sancion.') + '</p>' +
                        '<p class="text-sm mt-1 text-amber-400">Tiempo restante: ' + getBanRemainingText(currentPlayer) + '</p>';
                }
            }

            var regBadge = '';
            if (isRegistered && (regStatus === 'confirmed' || regStatus === 'approved')) {
                regBadge = '<div class="mt-4"><span class="px-4 py-2 rounded-lg font-bold bg-green-500/10 text-green-500 border border-green-500/20">&#10003; Registrado</span></div>';
            } else if (isRegistered && regStatus === 'pending') {
                regBadge = '<div class="mt-4"><span class="px-4 py-2 rounded-lg font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">&#9203; Esperando aprobacion</span></div>';
            }

            var actionHtml = '';
            if (match.status === 'open' && !isRegistered) {
                actionHtml = '<div class="mt-4"><button onclick="goToRegister(\'' + match.id + '\')" class="px-6 py-3 rounded-lg font-bold transition active:scale-[0.98] min-h-[48px] bg-gradient-to-r from-orange-600 to-amber-500 text-white">Registrarme</button></div>';
            } else {
                actionHtml = regBadge;
            }

            var lockBadge = (match.password || match.game_password) ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-400">&#128274;</span>' : '';
            var approvalBadge = match.requires_approval ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-400">&#128065; Con Aprobacion</span>' : '';
            var winnersBadge = match.winners_declared ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-yellow-400/10 text-yellow-400">&#127942; Ganadores</span>' : '';

            var header = document.getElementById('match-header');
            if (header) {
                header.innerHTML =
                    '<div class="flex items-center gap-2 mb-2 flex-wrap">' + window.getStatusBadge(match.status) + ' ' + window.getTypeBadge(match.match_type) + lockBadge + approvalBadge + winnersBadge + '</div>' +
                    '<h1 class="text-3xl font-bold text-slate-100">' + match.name + '</h1>' +
                    '<p class="mt-1 text-sm text-slate-400">' + (match.description || '') + '</p>' +
                    '<div class="flex flex-wrap gap-4 mt-3 text-sm text-slate-400"><span>&#128197; ' + window.formatDate(match.created_at) + '</span><span>' + allianceLabel + '</span><span>&#128101; Max ' + match.max_players + '</span></div>' + actionHtml;
            }

            var rulesLink = document.getElementById('rules-link-section');
            if (rulesLink) rulesLink.classList.remove('hidden');

            if (match.match_type === 'duel') {
                var chatSection = document.getElementById('chat-section');
                if (chatSection) chatSection.classList.remove('hidden');
                loadChat();
            }

            loadRegistrations();
            loadResults();
        } catch(e) {
            console.error('[Game] Error:', e);
            var header = document.getElementById('match-header');
            if (header) header.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando partida: ' + e.message + '</div>';
        }
    }

    // ============================================================
    // CARGAR GANADORES
    // ============================================================
    async function loadWinners(matchId) {
        try {
            var [{ data: winners }, { data: regs }] = await Promise.all([
                window.supabase.from('public_match_winners_view').select('*').eq('match_id', matchId).order('position', { ascending: true }),
                window.supabase.from('match_registrations').select('player_id').eq('match_id', matchId)
            ]);
            if (!winners || winners.length === 0) return;
            // La vista no filtra por registro: conservar la validacion por match_registrations.
            var validPlayerIds = {};
            (regs || []).forEach(function(r) { validPlayerIds[r.player_id] = true; });
            winners = winners.filter(function(w) { return validPlayerIds[w.player_id]; });
            if (winners.length === 0) return;
            var display = document.getElementById('winners-display');
            var podium = document.getElementById('winners-podium');
            if (display) display.classList.remove('hidden');
            if (podium) {
                var medals = ['&#129351;', '&#129352;', '&#129353;'];
                var styles = ['bg-yellow-400/10 border border-yellow-400/20', 'bg-white/[0.03] border border-indigo-900', 'bg-orange-500/10 border border-orange-500/15'];
                podium.innerHTML = winners.map(function(w, i) {
                    return '<div class="rounded-lg p-4 text-center ' + styles[i] + '"><div class="text-3xl mb-2">' + medals[i] + '</div><p class="text-xs uppercase font-bold text-slate-400">' + (i+1) + ' Lugar</p><p class="font-bold text-slate-100">' + (w.current_username || 'Jugador ' + w.player_id) + '</p></div>';
                }).join('');
            }
        } catch(e) { console.error('[Winners]', e); }
    }

    // ============================================================
    // CHAT
    // ============================================================
    async function loadChat() {
        try {
            var { data: messages } = await window.supabase.from('chat_messages').select('*').eq('channel', matchId).order('created_at', { ascending: true }).limit(50);
            var container = document.getElementById('chat-messages');
            if (!container) return;
            if (!messages || messages.length === 0) {
                container.innerHTML = '<div class="text-center text-sm text-slate-400">Sin mensajes. Se el primero!</div>';
                return;
            }
            container.innerHTML = messages.map(function(m) {
                var isMine = m.sender_name === (playerData ? playerData.displayName : '');
                return '<div class="mb-2 ' + (isMine ? 'text-right' : 'text-left') + '"><div class="inline-block px-3 py-2 rounded-lg ' + (isMine ? 'bg-indigo-900' : 'bg-white/5') + '"><div class="text-xs font-bold ' + (isMine ? 'text-amber-400' : 'text-slate-400') + ';">' + (m.sender_name || 'Admin') + '</div><div class="text-sm text-slate-100">' + m.message + '</div></div></div>';
            }).join('');
            container.scrollTop = container.scrollHeight;
        } catch(e) { console.error('[Chat]', e); }
    }

    window.sendChatMessage = async function() {
        var input = document.getElementById('chat-input');
        var message = input.value.trim();
        if (!message) return;
        if (!playerData || (!playerData.playerId && !playerData.displayName)) {
            window.showToast('Debes entrar como jugador para usar el chat', 'warning');
            return;
        }
        try {
            var { error } = await window.supabase.from('chat_messages').insert({
                channel: matchId,
                sender_admin_id: null,
                sender_name: playerData.displayName || 'Jugador ' + playerData.playerId,
                sender_role: 'player',
                message: message
            });
            if (error) window.showToast('Error: ' + error.message, 'error');
            else { input.value = ''; loadChat(); }
        } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
    };

    // ============================================================
    // REGISTRADOS
    // ============================================================
    async function loadRegistrations() {
        try {
            var { data: regs } = await window.supabase.from('match_registrations').select('*').eq('match_id', matchId).eq('status', 'confirmed').order('registered_at', { ascending: false });
            var section = document.getElementById('registrations-section');
            if (!regs || regs.length === 0) {
                if (section) section.classList.add('hidden');
                return;
            }
            var playerIds = regs.map(function(r) { return r.player_id; }).filter(function(v, i, a) { return a.indexOf(v) === i; });
            var { data: players } = await window.supabase.from('players').select('id, current_username').in('id', playerIds);
            var playersMap = {};
            (players || []).forEach(function(p) { playersMap[p.id] = p; });
            if (section) section.classList.remove('hidden');
            var list = document.getElementById('registrations-list');
            if (list) {
                list.innerHTML = '<table class="w-full text-sm min-w-full"><thead><tr class="bg-slate-950"><th class="text-left p-2 text-slate-400">Jugador</th><th class="text-left p-2 text-slate-400">Nacion</th></tr></thead><tbody>' + regs.map(function(r) {
                    var p = playersMap[r.player_id] || {};
                    return '<tr class="border-b border-indigo-900"><td class="p-2 font-medium text-slate-100">' + (p.current_username || r.username || 'Jugador ' + r.player_id) + '</td><td class="p-2 text-slate-400">' + (r.nation || '-') + '</td></tr>';
                }).join('') + '</tbody></table>';
            }
        } catch(e) { console.error('[Registrations]', e); }
    }

    // ============================================================
    // RESULTADOS
    // ============================================================
    async function loadResults() {
        try {
            var { data: matchCheck } = await window.supabase.from('matches').select('csv_imported').eq('id', matchId).single();
            if (!matchCheck || !matchCheck.csv_imported) {
                var noResults = document.getElementById('no-results');
                if (noResults) noResults.classList.remove('hidden');
                return;
            }
            var [{ data: results }, { data: regs }] = await Promise.all([
                window.supabase.from('match_results').select('*').eq('match_id', matchId).order('kd_ratio', { ascending: false }),
                window.supabase.from('match_registrations').select('player_id').eq('match_id', matchId)
            ]);
            if (!results || results.length === 0) {
                var noResults = document.getElementById('no-results');
                if (noResults) noResults.classList.remove('hidden');
                return;
            }
            var validPlayerIds = {};
            (regs || []).forEach(function(r) { validPlayerIds[r.player_id] = true; });
            var playerIds = results.map(function(r) { return r.player_id; }).filter(function(v, i, a) { return a.indexOf(v) === i; });
            var { data: players } = await window.supabase.from('public_players_view').select('id, current_username').in('id', playerIds);
            var playersMap = {};
            (players || []).forEach(function(p) { playersMap[p.id] = p; });
            var resultsSection = document.getElementById('results-section');
            var resultsTbody = document.getElementById('results-tbody');
            if (resultsSection) resultsSection.classList.remove('hidden');
            if (resultsTbody) {
                resultsTbody.innerHTML = results.map(function(r, i) {
                    var isValid = validPlayerIds[r.player_id];
                    var p = playersMap[r.player_id] || {};
                    var rowClass = isValid ? '' : 'opacity-60 bg-slate-950/30';
                    var badge = isValid ? '' : '<span class="ml-2 text-[10px] px-1 py-0.5 rounded font-bold bg-slate-500/20 text-slate-400">no registrado</span>';
                    return '<tr class="border-b border-indigo-900 ' + rowClass + '"><td class="p-3 font-bold ' + (i < 3 ? 'text-yellow-400' : 'text-slate-400') + ';">' + (i + 1) + '</td><td class="p-3 text-slate-100">' + (r.nation || '-') + '</td><td class="p-3 font-medium"><a href="player.html?id=' + r.player_id + '" class="text-amber-400">' + (p.current_username || '?') + '</a>' + badge + '</td><td class="p-3 text-right font-bold text-green-500">' + (r.kills || 0).toLocaleString() + '</td><td class="p-3 text-right text-red-400">' + (r.deaths || 0).toLocaleString() + '</td><td class="p-3 text-right font-bold ' + ((r.kd_ratio || 0) >= 1 ? 'text-green-500' : 'text-amber-400') + ';">' + (r.kd_ratio || 0) + '</td></tr>';
                }).join('');
            }
        } catch(e) {
            console.error('[Results]', e);
            var noResults = document.getElementById('no-results');
            if (noResults) noResults.classList.remove('hidden');
        }
    }

    // ============================================================
    // INICIALIZAR
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadMatch);
    } else {
        loadMatch();
    }
})();
