/**
 * admin-duel-manager.js - Logica del panel de duelos de alianzas
 *
 * Permite a un lider preparar un equipo de hasta 5 jugadores y desafiar a otra alianza.
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

    async function loadMyPlayers() {
        if (!myAllianceId) return;
        try {
            var { data, error } = await window.supabase.from('players')
                .select('id, current_username, total_kills, total_deaths')
                .eq('current_alliance_id', myAllianceId)
                .eq('status', 'active')
                .order('total_kills', { ascending: false });
            if (error) throw error;

            var list = document.getElementById('my-players');
            if (!list) return;
            if (!data || data.length === 0) {
                list.innerHTML = '<div class="text-center py-4 text-sm text-ah-muted">Sin jugadores en tu alianza</div>';
                return;
            }

            list.innerHTML = data.map(function(p) {
                var isSelected = selectedPlayers.indexOf(p.id) !== -1;
                var borderClass = isSelected ? 'border-ah-accent' : 'border-ah-border';
                var bgClass = isSelected ? 'bg-ah-accent/10' : 'bg-ah-card';
                return '<div class="rounded-lg border p-3 cursor-pointer transition hover:opacity-90 ' + borderClass + ' ' + bgClass + '" data-player-id="' + p.id + '" data-player-name="' + (p.current_username || '').replace(/"/g, '&quot;') + '">' +
                    '<div class="font-medium text-ah-text">' + p.current_username + '</div>' +
                    '<div class="text-xs text-ah-muted">Kills: ' + (p.total_kills || 0) + ' | Muertes: ' + (p.total_deaths || 0) + '</div>' +
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
        var saveBtn = document.getElementById('save-team-btn');
        if (countEl) countEl.textContent = selectedPlayers.length;
        if (saveBtn) saveBtn.disabled = selectedPlayers.length === 0;
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

        var saveBtn = document.getElementById('save-team-btn');
        if (saveBtn) saveBtn.addEventListener('click', saveTeam);
    }

    async function createDuel() {
        if (!myAllianceId || !myAllianceData) {
            if (typeof window.showToast === 'function') window.showToast('No se pudo determinar tu alianza', 'error');
            return;
        }

        var rivalSelect = document.getElementById('rival-alliance');
        var rivalId = rivalSelect ? rivalSelect.value : '';
        if (!rivalId) {
            if (typeof window.showToast === 'function') window.showToast('Selecciona una alianza rival', 'error');
            return;
        }
        if (selectedPlayers.length === 0) {
            if (typeof window.showToast === 'function') window.showToast('Selecciona al menos 1 jugador', 'error');
            return;
        }

        var rival = allAlliances.find(function(a) { return a.id === rivalId; });
        var rivalTag = rival ? (rival.tag || rival.name) : 'Rival';
        var myTag = myAllianceData.tag || myAllianceData.name;

        try {
            var { data: duel, error } = await window.supabase.from('matches').insert({
                alliance_id: myAllianceId,
                alliance_a_id: myAllianceId,
                alliance_b_id: rivalId,
                match_type: 'duel',
                name: 'Duelo: ' + myTag + ' vs ' + rivalTag,
                status: 'draft',
                max_players: 5,
                requires_approval: true,
                created_at: new Date().toISOString()
            }).select('id').single();

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
        } catch(e) {
            console.error('[DuelManager] Error creando duelo:', e);
            if (typeof window.showToast === 'function') window.showToast('Error: ' + e.message, 'error');
        }
    }

    function saveTeam() {
        if (selectedPlayers.length === 0) return;
        if (typeof window.showToast === 'function') window.showToast('Equipo listo (' + selectedPlayers.length + ' jugadores). Crea el duelo para guardarlo.', 'info');
    }

    // Exponer funciones necesarias para el HTML
    window.createDuel = createDuel;
    window.saveTeam = saveTeam;

    // Inicializacion robusta
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('ah:dom-ready', init);
    window.addEventListener('ah:loaded', init);
})();
