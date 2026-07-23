/**
 * register-index.js - Registro de jugador a partida (register/index.html)
 *
 * Extraido de register/index.html como parte de la refactorizacion al sistema de loader/cache-buster.
 */
(function() {
    'use strict';

    var urlParams = new URLSearchParams(window.location.search);
    var matchId = urlParams.get('match');
    var playerData = window.getPlayerData();

    if (!matchId) { window.location.href = '../index.html'; }
    if (!playerData || !playerData.playerId) { window.location.href = '../login-player.html'; }

    var currentMatch = null;
    var myRegistration = null;

    function calcRemainingText(untilDate) {
        var diff = untilDate - new Date();
        if (diff <= 0) return 'expirado';
        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (days > 0) return days + ' dia(s) y ' + hours + ' hora(s)';
        if (hours > 0) return hours + ' hora(s) y ' + minutes + ' minuto(s)';
        return minutes + ' minuto(s)';
    }

    async function init() {
        document.getElementById('reg-player-id').value = playerData.playerId;
        document.getElementById('display-username').textContent = playerData.displayName || 'Jugador ' + playerData.playerId;
        document.getElementById('display-player-id').textContent = 'ID: ' + playerData.playerId;

        var sanctionCheck = await window.AHSanctions.assertNoSanction(parseInt(playerData.playerId));
        if (!sanctionCheck.ok) {
            document.getElementById('ban-banner').innerHTML =
                '<div class="text-4xl mb-3">&#128683;</div>' +
                '<h2 class="font-bold text-red-400">Cuenta restringida</h2>' +
                '<p class="text-sm mt-2 text-slate-400">' + (sanctionCheck.summary.reason || 'Has recibido una sancion.') + '</p>' +
                '<p class="text-sm mt-1 text-amber-400">Tiempo restante: ' + sanctionCheck.summary.remainingText + '</p>';
            document.getElementById('ban-banner').classList.remove('hidden');
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('player-info-display').classList.add('hidden');
            return;
        }

        var { data: reg, error: regError } = await window.supabase
            .from('match_registrations')
            .select('*')
            .eq('match_id', matchId)
            .eq('player_id', parseInt(playerData.playerId))
            .maybeSingle();

        if (regError) { console.error('Error verificando registro:', regError); }
        myRegistration = reg;

        if (reg && (reg.status === 'confirmed' || reg.status === 'approved')) {
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('player-info-display').classList.add('hidden');
            document.getElementById('success-msg').textContent = '\u2713 Ya estas registrado en esta partida.';
            document.getElementById('success-msg').classList.remove('hidden');
            window.saveLastRegisteredMatch(matchId);
            showCredentialsIfApproved();
            return;
        }

        if (reg && reg.status === 'pending') {
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('player-info-display').classList.add('hidden');
            document.getElementById('waiting-approval-banner').classList.remove('hidden');
            return;
        }

        if (reg && reg.status === 'rejected') {
            document.getElementById('error-msg').textContent = '\u2716 Tu solicitud fue rechazada.';
            document.getElementById('error-msg').classList.remove('hidden');
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('player-info-display').classList.add('hidden');
            return;
        }

        var { data: match, error: matchError } = await window.supabase
            .from('matches')
            .select('*')
            .eq('id', matchId)
            .maybeSingle();

        if (matchError) console.error('Error cargando match:', matchError);
        if (!match) { document.getElementById('match-info').textContent = 'Partida no encontrada'; return; }
        currentMatch = match;

        var allianceName = '';
        if (match.alliance_id) {
            var { data: alliance } = await window.supabase.from('alliances').select('name').eq('id', match.alliance_id).maybeSingle();
            if (alliance) allianceName = alliance.name;
        }

        document.getElementById('match-info').innerHTML = window.getStatusBadge(match.status) + ' ' + window.getTypeBadge(match.match_type) + ' \u2022 ' + match.name + (allianceName ? ' (' + allianceName + ')' : '');

        if (match.status !== 'open') {
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('error-msg').textContent = '\u2716 Esta partida no esta abierta para registro.';
            document.getElementById('error-msg').classList.remove('hidden');
        }
    }

    async function showCredentialsIfApproved() {
        var { data: match } = await window.supabase
            .from('matches')
            .select('game_id, password, requires_approval')
            .eq('id', matchId)
            .maybeSingle();

        if (match) {
            currentMatch = match;
            if (!match.requires_approval || (myRegistration && myRegistration.status === 'approved')) {
                var sanctionCheck = await window.AHSanctions.assertNoSanction(parseInt(playerData.playerId));
                if (!sanctionCheck.ok) return;
                window.AHRuleGate.requireConsent(playerData.playerId, matchId, function() {
                    document.getElementById('match-credentials').classList.remove('hidden');
                    document.getElementById('cred-game-id').textContent = match.game_id || '---';
                    document.getElementById('cred-password').textContent = match.password || '---';
                });
            }
            if (match.requires_approval && myRegistration && myRegistration.status === 'pending') {
                document.getElementById('waiting-approval-banner').classList.remove('hidden');
            }
        }
    }

    document.getElementById('register-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var errorMsg = document.getElementById('error-msg');
        var successMsg = document.getElementById('success-msg');

        errorMsg.classList.add('hidden');
        successMsg.classList.add('hidden');

        var sanctionCheck = await window.AHSanctions.assertNoSanction(parseInt(playerData.playerId));
        if (!sanctionCheck.ok) {
            errorMsg.textContent = '\u2716 ' + sanctionCheck.message;
            errorMsg.classList.remove('hidden');
            return;
        }

        if (!currentMatch) {
            errorMsg.textContent = '\u2716 La informacion de la partida no esta lista.';
            errorMsg.classList.remove('hidden');
            return;
        }

        window.AHRuleGate.requireConsent(playerData.playerId, matchId, async function() {
            var { error } = await window.supabase.from('match_registrations').upsert({
                match_id: matchId,
                player_id: parseInt(playerData.playerId),
                status: currentMatch.requires_approval ? 'pending' : 'confirmed'
            }, { onConflict: 'match_id,player_id' });

            if (error) {
                errorMsg.textContent = '\u2716 Error: ' + error.message;
                errorMsg.classList.remove('hidden');
            } else {
                window.saveLastRegisteredMatch(matchId);
                if (currentMatch.requires_approval) {
                    successMsg.textContent = '\u2713 Solicitud enviada. Espera aprobacion del admin.';
                    successMsg.classList.remove('hidden');
                    document.getElementById('register-form').classList.add('hidden');
                    document.getElementById('waiting-approval-banner').classList.remove('hidden');
                } else {
                    successMsg.textContent = '\u2713 Registrado! Redirigiendo...';
                    successMsg.classList.remove('hidden');
                    setTimeout(function() { window.location.href = '../game.html?id=' + matchId; }, 1500);
                }
            }
        });
    });

    init();
})();
