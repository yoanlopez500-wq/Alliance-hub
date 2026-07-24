/**
 * admin-duel-manager.js - Logica del panel de duelos de alianzas
 *
 * Permite a un lider preparar un equipo de hasta 5 jugadores y:
 *  - Crear un duelo abierto (cualquier alianza puede aceptarlo).
 *  - Crear un desafio dirigido a una alianza rival concreta.
 *  - Aceptar duelos abiertos de otras alianzas.
 *  - Ver sus duelos con estado y ganador.
 *
 * Estados de duelo: awaiting_opponent -> open -> in_progress -> finished.
 * El ganador se recalcula automaticamente en matches.winner_alliance_id
 * por un trigger sobre match_results (kills agregadas por bando).
 */
(function() {
    'use strict';

    var selectedPlayers = [];
    var myAllianceId = null;
    var myAllianceData = null;
    var allAlliances = [];

    function init() {
        window.requireAdmin();
        loadAdminAlliance().then(function() {
            loadAlliances();
            renderTeam();
            bindEvents();
            loadOpenDuels();
            loadMyDuels();
        });
    }

    async function loadAdminAlliance() {
        try {
            var admin = await window.getAdminRole();
            if (admin && admin.alliance_id) {
                myAllianceId = admin.alliance_id;
                var { data, error } = await window.supabase.from('alliances').select('id, name, tag').eq('id', myAllianceId).single();
                if (error) throw error;
                myAllianceData = data;

                var mySelect = document.getElementById('my-alliance');
                if (mySelect && myAllianceData) {
                    mySelect.innerHTML = '<option value="' + myAllianceData.id + '">' + myAllianceData.name + '</option>';
                    mySelect.disabled = true;
                }
                loadMyPlayers();
            }
        } catch(e) {
            console.error('[DuelManager] Error cargando alianza del admin:', e);
        }
    }

    async function loadAlliances() {
        try {
            var { data, error } = await window.supabase.from('alliances').select('id, name, tag').eq('status', 'active').order('name');
            if (error) throw error;
            allAlliances = data || [];

            var rivalSelect = document.getElementById('rival-alliance');
            if (rivalSelect) {
                var opts = '<option value="">Seleccionar rival...</option>' +
                    allAlliances.filter(function(a) { return a.id !== myAllianceId; }).map(function(a) {
                        return '<option value="' + a.id + '">' + a.name + ' [' + (a.tag || '-') + ']</option>';
                    }).join('');
                rivalSelect.innerHTML = opts;
            }
        } catch(e) {
            console.error('[DuelManager] Error cargando alianzas:', e);
            if (typeof window.showToast === 'function') window.showToast('Error cargando alianzas', 'error');
        }
    }

    function allianceName(aid) {
        if (!aid) return 'Por definir';
        if (myAllianceData && aid === myAllianceId) return myAllianceData.name;
        var a = allAlliances.find(function(x) { return x.id === aid; });
        return a ? a.name + (a.tag ? ' [' + a.tag + ']' : '') : 'Alianza';
    }

    async function loadMyPlayers() {
        if (!myAllianceId) return;
        try {
            var { data, error } = await window.supabase.from('players')
                .select('id, current_username')
                .eq('current_alliance_id', myAllianceId)
                .eq('status', 'active');
            if (error) throw error;

            var list = document.getElementById('my-players');
            if (!list) return;
            if (!data || data.length === 0) {
                list.innerHTML = '<div class="text-center py-4 text-sm text-ah-muted">Sin jugadores en tu alianza</div>';
                return;
            }

            var playerIds = data.map(function(p) { return p.id; });
            var stats = await window.RankingUtils.getValidPlayerStats({ playerIds: playerIds });

            var sorted = data.map(function(p) {
                var s = stats[p.id] || { kills: 0, deaths: 0, games: 0 };
                return { player: p, kills: s.kills, deaths: s.deaths, games: s.games };
            }).sort(function(a, b) { return b.kills - a.kills; });

            list.innerHTML = sorted.map(function(item) {
                var p = item.player;
                var isSelected = selectedPlayers.findIndex(function(x) { return x.id === p.id; }) !== -1;
                var borderClass = isSelected ? 'border-ah-accent' : 'border-ah-border';
                var bgClass = isSelected ? 'bg-ah-accent/10' : 'bg-ah-card';
                return '<div class="rounded-lg border p-3 cursor-pointer transition hover:opacity-90 ' + borderClass + ' ' + bgClass + '" data-player-id="' + p.id + '" data-player-name="' + (p.current_username || '').replace(/"/g, '&quot;') + '">' +
                    '<div class="font-medium text-ah-text">' + p.current_username + '</div>' +
                    '<div class="text-xs text-ah-muted">Kills: ' + (item.kills || 0) + ' | Muertes: ' + (item.deaths || 0) + ' | ' + (item.games || 0) + ' partidas validas</div>' +
                    '</div>';
            }).join('');

            // Bind clicks on cards
            list.querySelectorAll('[data-player-id]').forEach(function(el) {
                el.addEventListener('click', function() {
                    var pid = parseInt(el.getAttribute('data-player-id'));
                    var pname = el.getAttribute('data-player-name');
                    togglePlayerSelection(pid, pname);
                });
            });
        } catch(e) {
            console.error('[DuelManager] Error cargando jugadores:', e);
        }
    }

    function togglePlayerSelection(playerId, playerName) {
        var idx = selectedPlayers.findIndex(function(p) { return p.id === playerId; });
        if (idx !== -1) {
            selectedPlayers.splice(idx, 1);
        } else {
            if (selectedPlayers.length >= 5) {
                if (typeof window.showToast === 'function') window.showToast('Maximo 5 jugadores', 'warning');
                return;
            }
            selectedPlayers.push({ id: playerId, name: playerName });
        }
        renderTeam();
        loadMyPlayers();
    }

    function renderTeam() {
        var countEl = document.getElementById('team-count');
        var teamEl = document.getElementById('selected-team');
        if (countEl) countEl.textContent = selectedPlayers.length;
        if (teamEl) {
            if (selectedPlayers.length === 0) {
                teamEl.innerHTML = '<span class="text-sm text-ah-muted">Ningun jugador seleccionado</span>';
                return;
            }
            teamEl.innerHTML = selectedPlayers.map(function(p) {
                return '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-ah-accent/20 text-ah-accent border border-ah-accent/30">' +
                    (p.name || p.id) +
                    '<button type="button" class="remove-player text-ah-accent hover:text-white" data-id="' + p.id + '">&times;</button>' +
                    '</span>';
            }).join('');

            teamEl.querySelectorAll('.remove-player').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var pid = parseInt(btn.getAttribute('data-id'));
                    var p = selectedPlayers.find(function(x) { return x.id === pid; });
                    togglePlayerSelection(pid, p ? p.name : '');
                });
            });
        }
    }

    function bindEvents() {
        var createBtn = document.getElementById('create-duel-btn');
        if (createBtn) createBtn.addEventListener('click', createDuel);

        // Cambio de modo: habilitar/deshabilitar el selector de rival
        document.querySelectorAll('input[name="duel-mode"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                var rivalSelect = document.getElementById('rival-alliance');
                if (rivalSelect) rivalSelect.disabled = radio.value !== 'directed' || !radio.checked;
                if (radio.value === 'open' && rivalSelect) rivalSelect.value = '';
            });
        });
    }

    function getDuelMode() {
        var checked = document.querySelector('input[name="duel-mode"]:checked');
        return checked ? checked.value : 'open';
    }

    async function createDuel() {
        if (!myAllianceId || !myAllianceData) {
            if (typeof window.showToast === 'function') window.showToast('No se pudo determinar tu alianza', 'error');
            return;
        }

        var mode = getDuelMode();
        var rivalSelect = document.getElementById('rival-alliance');
        var rivalId = rivalSelect ? rivalSelect.value : '';

        if (mode === 'directed' && !rivalId) {
            if (typeof window.showToast === 'function') window.showToast('Selecciona una alianza rival', 'error');
            return;
        }
        if (selectedPlayers.length === 0) {
            if (typeof window.showToast === 'function') window.showToast('Selecciona al menos 1 jugador', 'error');
            return;
        }

        var myTag = myAllianceData.tag || myAllianceData.name;
        var duelName;
        if (mode === 'directed') {
            var rival = allAlliances.find(function(a) { return a.id === rivalId; });
            var rivalTag = rival ? (rival.tag || rival.name) : 'Rival';
            duelName = 'Duelo: ' + myTag + ' vs ' + rivalTag;
        } else {
            duelName = 'Duelo abierto: ' + myTag;
        }

        try {
            var insertData = {
                alliance_id: myAllianceId,
                alliance_a_id: myAllianceId,
                alliance_b_id: mode === 'directed' ? rivalId : null,
                match_type: 'duel',
                name: duelName,
                status: 'awaiting_opponent',
                max_players: 5,
                requires_approval: true,
                created_at: new Date().toISOString()
            };
            var { data: duel, error } = await window.supabase.from('matches').insert(insertData).select('id').single();

            if (error) throw error;
            if (!duel || !duel.id) throw new Error('No se pudo crear el duelo');

            // Registrar jugadores seleccionados en el duelo
            var registrations = selectedPlayers.map(function(p) {
                return {
                    match_id: duel.id,
                    player_id: p.id,
                    status: 'confirmed',
                    registered_at: new Date().toISOString()
                };
            });
            var { error: regError } = await window.supabase.from('match_registrations').insert(registrations);
            if (regError) {
                console.error('[DuelManager] Error registrando equipo:', regError);
                if (typeof window.showToast === 'function') window.showToast('Duelo creado pero error guardando equipo', 'warning');
            } else {
                if (typeof window.showToast === 'function') window.showToast('Duelo creado exitosamente', 'success');
            }

            // Limpiar seleccion
            selectedPlayers = [];
            renderTeam();
            loadMyPlayers();
            if (rivalSelect) rivalSelect.value = '';
            loadOpenDuels();
            loadMyDuels();
        } catch(e) {
            console.error('[DuelManager] Error creando duelo:', e);
            if (typeof window.showToast === 'function') window.showToast('Error: ' + e.message, 'error');
        }
    }

    function statusBadge(status) {
        if (status === 'finished') return '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-green-500/20 text-green-500">FINALIZADO</span>';
        if (status === 'in_progress') return '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-blue-500/20 text-blue-500">EN CURSO</span>';
        if (status === 'open') return '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400">ABIERTO</span>';
        return '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-purple-500/20 text-purple-400">ESPERANDO OPONENTE</span>';
    }

    async function loadOpenDuels() {
        var c = document.getElementById('open-duels-list');
        if (!c) return;
        try {
            var { data, error } = await window.supabase.from('matches')
                .select('id, name, status, alliance_a_id, alliance_b_id, created_at')
                .eq('match_type', 'duel')
                .eq('status', 'awaiting_opponent')
                .order('created_at', { ascending: false });
            if (error) throw error;

            // Solo duelos ABIERTOS (alliance_b_id NULL) o dirigidos a MI alianza;
            // excluir los creados por mi propia alianza y los dirigidos a terceros
            var duels = (data || []).filter(function(d) {
                if (d.alliance_a_id === myAllianceId) return false;
                return d.alliance_b_id === null || d.alliance_b_id === myAllianceId;
            });
            if (duels.length === 0) {
                c.innerHTML = '<div class="rounded-xl p-5 bg-ah-card border border-ah-border text-center text-sm text-ah-muted">No hay duelos abiertos de otras alianzas</div>';
                return;
            }

            c.innerHTML = duels.map(function(d) {
                return '<div class="rounded-xl p-4 bg-ah-card border border-ah-border flex items-center justify-between gap-3">' +
                    '<div>' +
                    '<div class="font-bold text-sm">' + (d.name || 'Duelo') + '</div>' +
                    '<div class="text-xs text-ah-muted">Retador: ' + allianceName(d.alliance_a_id) + '</div>' +
                    '</div>' +
                    '<button class="accept-duel-btn px-4 py-2 rounded-lg text-sm font-bold gradient-btn" data-id="' + d.id + '">Aceptar</button>' +
                    '</div>';
            }).join('');

            c.querySelectorAll('.accept-duel-btn').forEach(function(btn) {
                btn.addEventListener('click', function() { acceptDuel(btn.getAttribute('data-id')); });
            });
        } catch(e) {
            console.error('[DuelManager] Error cargando duelos abiertos:', e);
            c.innerHTML = '<div class="text-center py-4 text-sm text-red-400">Error cargando duelos abiertos</div>';
        }
    }

    async function acceptDuel(matchId) {
        if (!myAllianceId || !myAllianceData) {
            if (typeof window.showToast === 'function') window.showToast('No se pudo determinar tu alianza', 'error');
            return;
        }
        if (!matchId) return;
        if (selectedPlayers.length === 0) {
            if (typeof window.showToast === 'function') window.showToast('Selecciona tu equipo (hasta 5 jugadores) antes de aceptar', 'warning');
            return;
        }

        try {
            // Validar que el duelo siga disponible y no sea propio
            var { data: duel, error: fetchError } = await window.supabase.from('matches')
                .select('id, status, alliance_a_id, alliance_b_id')
                .eq('id', matchId)
                .single();
            if (fetchError) throw fetchError;
            if (!duel) throw new Error('Duelo no encontrado');
            if (duel.alliance_a_id === myAllianceId) {
                if (typeof window.showToast === 'function') window.showToast('No puedes aceptar tu propio duelo', 'error');
                return;
            }
            if (duel.status !== 'awaiting_opponent') {
                if (typeof window.showToast === 'function') window.showToast('Este duelo ya fue aceptado por otra alianza', 'warning');
                loadOpenDuels();
                return;
            }
            // Desafío dirigido a otra alianza: no se puede aceptar
            if (duel.alliance_b_id && duel.alliance_b_id !== myAllianceId) {
                if (typeof window.showToast === 'function') window.showToast('Este desafío está dirigido a otra alianza', 'error');
                loadOpenDuels();
                return;
            }

            // Unirse como bando B y pasar a estado abierto
            var { error: updError } = await window.supabase.from('matches')
                .update({ alliance_b_id: myAllianceId, status: 'open' })
                .eq('id', matchId)
                .eq('status', 'awaiting_opponent');
            if (updError) throw updError;

            // Registrar mis jugadores en el duelo
            var registrations = selectedPlayers.map(function(p) {
                return {
                    match_id: matchId,
                    player_id: p.id,
                    status: 'confirmed',
                    registered_at: new Date().toISOString()
                };
            });
            var { error: regError } = await window.supabase.from('match_registrations').insert(registrations);
            if (regError) {
                console.error('[DuelManager] Error registrando equipo al aceptar:', regError);
                if (typeof window.showToast === 'function') window.showToast('Duelo aceptado pero error guardando equipo', 'warning');
            } else {
                if (typeof window.showToast === 'function') window.showToast('Duelo aceptado. Equipo registrado.', 'success');
            }

            selectedPlayers = [];
            renderTeam();
            loadMyPlayers();
            loadOpenDuels();
            loadMyDuels();
        } catch(e) {
            console.error('[DuelManager] Error aceptando duelo:', e);
            if (typeof window.showToast === 'function') window.showToast('Error: ' + e.message, 'error');
        }
    }

    async function loadMyDuels() {
        var c = document.getElementById('my-duels-list');
        if (!c || !myAllianceId) return;
        try {
            // Lectura directa de matches para obtener winner_alliance_id (soy admin)
            var { data, error } = await window.supabase.from('matches')
                .select('id, name, status, alliance_a_id, alliance_b_id, winner_alliance_id, created_at')
                .eq('match_type', 'duel')
                .or('alliance_a_id.eq.' + myAllianceId + ',alliance_b_id.eq.' + myAllianceId)
                .order('created_at', { ascending: false });
            if (error) throw error;

            if (!data || data.length === 0) {
                c.innerHTML = '<div class="rounded-xl p-5 bg-ah-card border border-ah-border text-center text-sm text-ah-muted">Aun no tienes duelos</div>';
                return;
            }

            c.innerHTML = data.map(function(d) {
                var rivalId = d.alliance_a_id === myAllianceId ? d.alliance_b_id : d.alliance_a_id;
                var resultHtml = '';
                if (d.status === 'finished') {
                    if (!d.winner_alliance_id) {
                        resultHtml = '<span class="text-xs font-bold text-amber-400">Empate</span>';
                    } else if (d.winner_alliance_id === myAllianceId) {
                        resultHtml = '<span class="text-xs font-bold text-green-500">Victoria</span>';
                    } else {
                        resultHtml = '<span class="text-xs font-bold text-red-400">Derrota</span>';
                    }
                }
                return '<div class="rounded-xl p-4 bg-ah-card border border-ah-border">' +
                    '<div class="flex items-center justify-between gap-3 mb-1">' +
                    '<div class="font-bold text-sm">' + (d.name || 'Duelo') + '</div>' +
                    statusBadge(d.status) +
                    '</div>' +
                    '<div class="text-xs text-ah-muted flex items-center justify-between">' +
                    '<span>Rival: ' + allianceName(rivalId) + '</span>' +
                    resultHtml +
                    '</div>' +
                    '</div>';
            }).join('');
        } catch(e) {
            console.error('[DuelManager] Error cargando mis duelos:', e);
            c.innerHTML = '<div class="text-center py-4 text-sm text-red-400">Error cargando mis duelos</div>';
        }
    }

    // Exponer funciones necesarias para el HTML
    window.createDuel = createDuel;
    window.acceptDuel = acceptDuel;

    // Inicializacion robusta (con guardia contra doble init: evita listeners duplicados)
    var _inited = false;
    var _init = init;
    init = function() {
        if (_inited) return;
        _inited = true;
        _init();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('ah:dom-ready', init);
    window.addEventListener('ah:loaded', init);
})();
