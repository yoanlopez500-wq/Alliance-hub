/**
 * dashboard.js - Logica de la pagina de dashboard (dashboard.html)
 *
 * Extraido de dashboard.html como parte de la refactorizacion.
 * Funciones: carga de partidas, mapa de alianzas.
 *
 * v2: lista de partidas leida desde public_matches_view (game_id no se renderiza).
 * v3: si hay jugador identificado (localStorage ah_v2_player_id) con alianza,
 *     se anaden al final las partidas de SU alianza (incluidas internas/privadas)
 *     con badge "DE TU ALIANZA". Las de alianza van AL FINAL para conservar
 *     el orden actual de las publicas (decision: append, lo mas simple).
 * v4: badge de categoria ("COMUNIDAD BATALLON") y chips de filtro
 *     Todas/Alliance Hub/Batallon, persistidos en localStorage ah_match_filter.
 */
(function() {
    'use strict';

    var allAlliances = [];

    // ---- Filtro por categoria (persistente) ----
    var FILTER_KEY = 'ah_match_filter';
    var FILTERS = [
        { value: 'all', label: 'Todas' },
        { value: 'alliance_hub', label: 'Alliance Hub' },
        { value: 'batallon', label: 'Batallon' }
    ];

    function getCategoryFilter() {
        try {
            var v = localStorage.getItem(FILTER_KEY);
            return (v === 'alliance_hub' || v === 'batallon') ? v : 'all';
        } catch(e) { return 'all'; }
    }

    function renderCategoryChips() {
        var box = document.getElementById('match-category-filter');
        if (!box) return;
        var current = getCategoryFilter();
        box.innerHTML = FILTERS.map(function(f) {
            var active = f.value === current;
            var cls = active
                ? 'px-3 py-1.5 rounded-lg text-xs font-bold min-h-[32px] bg-gradient-to-r from-orange-600 to-amber-500 text-white'
                : 'px-3 py-1.5 rounded-lg text-xs font-bold min-h-[32px] bg-slate-900 border border-indigo-900 text-slate-400 hover:opacity-80 transition';
            return '<button onclick="window.setMatchFilter(\'' + f.value + '\')" class="' + cls + '">' + f.label + '</button>';
        }).join('');
    }

    window.setMatchFilter = function(value) {
        try { localStorage.setItem(FILTER_KEY, value); } catch(e) {}
        renderCategoryChips();
        loadMatches();
    };

    // Badge de categoria: solo se muestra para Batallon (Alliance Hub es el default)
    function getCategoryBadge(category) {
        if (category === 'batallon') {
            return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-purple-500/15 text-purple-400 ml-1">COMUNIDAD BATALLON</span>';
        }
        return '';
    }

    // Escapar HTML para datos renderizados con innerHTML
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Cargar mapa de alianzas
    async function loadAlliancesMap() {
        try {
            var { data, error } = await window.DB.from('alliances').select(window.DB.select('alliances', 'basic'));
            if (error) throw error;
            allAlliances = data || [];
        } catch(e) { console.error('[Dashboard] Error cargando alliances:', e); }
    }

    // Obtener alianza por ID
    function getAlliance(allianceId) {
        if (!allianceId || !allAlliances.length) return null;
        return allAlliances.find(function(a) { return a.id === allianceId; }) || null;
    }

    // Obtener partidas de la alianza del jugador identificado (si existe).
    // Devuelve [] ante cualquier fallo: nunca debe romper el listado publico.
    async function loadAllianceMatches() {
        try {
            var pid = localStorage.getItem('ah_v2_player_id');
            if (!pid) return [];
            var pc = window.DB.tableCols('publicPlayers');
            var { data: player, error: pErr } = await window.DB.from('publicPlayers')
                .select(pc.id + ', ' + pc.currentAllianceId)
                .eq(pc.id, pid)
                .maybeSingle();
            if (pErr) throw pErr;
            if (!player || !player[pc.currentAllianceId]) return [];
            var mc = window.DB.tableCols('matches');
            var { data, error } = await window.DB.from('matches')
                .select(window.DB.select('matches', 'list'))
                .eq(mc.allianceId, player[pc.currentAllianceId])
                .order(mc.createdAt, { ascending: false })
                .limit(50);
            if (error) throw error;
            return data || [];
        } catch(e) {
            // Fallo silencioso: se muestran solo las publicas
            console.warn('[Dashboard] No se pudieron cargar partidas de tu alianza:', e);
            return [];
        }
    }

    // Cargar lista de partidas
    async function loadMatches() {
        try {
            renderCategoryChips();
            await loadAlliancesMap();
            var mc = window.DB.tableCols('matches');
            var { data, error } = await window.DB.from('publicMatches')
                .select(window.DB.select('publicMatches', 'basic'))
                .order(window.DB.col('publicMatches', 'createdAt'), { ascending: false })
                .limit(50);
            if (error) throw error;

            data = data || [];

            // Anadir partidas de la alianza del jugador (sin duplicar por id).
            // Se marcan con _fromAlliance solo las que NO estan ya en la lista publica.
            var allianceMatches = await loadAllianceMatches();
            if (allianceMatches.length) {
                var seen = {};
                data.forEach(function(m) { seen[m[mc.id] || m.id] = true; });
                allianceMatches.forEach(function(m) {
                    var mid = m[mc.id] || m.id;
                    if (!seen[mid]) {
                        m._fromAlliance = true;
                        data.push(m);
                    }
                });
            }

            // Filtro por categoria (persistente en localStorage ah_match_filter);
            // se aplica tras fusionar publicas + alianza para que afecte a ambas.
            var catFilter = getCategoryFilter();
            if (catFilter !== 'all') {
                data = data.filter(function(m) {
                    return (m[mc.category] || 'alliance_hub') === catFilter;
                });
            }

            var container = document.getElementById('matches-list');
            if (!container) return;

            if (data.length === 0) {
                container.innerHTML = '<div class="text-center py-8 rounded-xl bg-slate-900 border border-indigo-900 text-slate-400">No hay partidas registradas</div>';
                return;
            }

            var ac = window.DB.tableCols('alliances');
            container.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' + data.map(function(m) {
                var alliance = getAlliance(m[mc.allianceId]);
                var allianceLabel = alliance ? ' [' + escapeHtml(alliance[ac.tag]) + ']' : '';
                var statusBadge;
                if (m[mc.status] === 'open') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-500">ABIERTA</span>';
                } else if (m[mc.status] === 'in_progress') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/15 text-blue-500">EN CURSO</span>';
                } else if (m[mc.status] === 'finished') {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-purple-500/15 text-purple-400">FINALIZADA</span>';
                } else {
                    statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">BORRADOR</span>';
                }
                var typeBadge = '';
                if (m[mc.matchType] === 'duel') {
                    typeBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400 ml-1">DUELO</span>';
                } else if (m[mc.matchType] === 'internal') {
                    typeBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/15 text-blue-500 ml-1">INTERNA</span>';
                }
                var categoryBadge = getCategoryBadge(m[mc.category]);
                // Badge extra para partidas que vienen solo de la alianza del jugador
                var allianceBadge = '';
                if (m._fromAlliance) {
                    allianceBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-cyan-500/15 text-cyan-400 ml-1">DE TU ALIANZA</span>';
                }
                return '<a href="game.html?id=' + encodeURIComponent(m[mc.id] || m.id) + '" class="block rounded-xl p-4 transition hover:opacity-90 bg-slate-900 border border-indigo-900"><div class="flex items-center justify-between mb-2"><div>' + statusBadge + typeBadge + categoryBadge + allianceBadge + '</div></div><h3 class="font-bold text-lg text-slate-100">' + escapeHtml(m[mc.name] || 'Partida') + allianceLabel + '</h3><p class="text-xs mt-1 text-slate-400">' + window.formatDate(m[mc.createdAt]) + ' | Max: ' + escapeHtml(m[mc.maxPlayers] || '-') + '</p></a>';
            }).join('') + '</div>';
        } catch(e) {
            console.error('[Dashboard]', e);
            var container = document.getElementById('matches-list');
            if (container) {
                container.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando partidas: ' + escapeHtml(e.message) + '<br><button onclick="window.loadMatches()" class="mt-3 px-4 py-2 rounded-lg text-sm font-bold bg-indigo-900 text-slate-100 min-h-[44px]">Reintentar</button></div>';
            }
        }
    }

    // Exponer globalmente para el boton de reintentar
    window.loadMatches = loadMatches;

    // Inicializar cuando el DOM este listo y los scripts cargados
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // Esperar a que DB (db-schema.js) este cargado
            if (typeof window.DB !== 'undefined') {
                loadMatches();
            } else {
                window.addEventListener('ah:loaded', function() { loadMatches(); });
            }
        });
    } else {
        if (typeof window.DB !== 'undefined') {
            loadMatches();
        } else {
            window.addEventListener('ah:loaded', function() { loadMatches(); });
        }
    }
})();
