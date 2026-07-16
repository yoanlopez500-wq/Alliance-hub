/**
 * dashboard.js - Logica de la pagina de dashboard (dashboard.html)
 *
 * Extraido de dashboard.html como parte de la refactorizacion.
 * Funciones: carga de partidas, mapa de alianzas.
 */
(function() {
    'use strict';

    var allAlliances = [];

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

    // Cargar lista de partidas
    async function loadMatches() {
        try {
            await loadAlliancesMap();
            var mc = window.DB.tableCols('matches');
            var { data, error } = await window.DB.from('matches')
                .select(window.DB.select('matches', 'basic'))
                .order(window.DB.col('matches', 'createdAt'), { ascending: false })
                .limit(50);
            if (error) throw error;

            var container = document.getElementById('matches-list');
            if (!container) return;

            if (!data || data.length === 0) {
                container.innerHTML = '<div class="text-center py-8 rounded-xl bg-slate-900 border border-indigo-900 text-slate-400">No hay partidas registradas</div>';
                return;
            }

            var ac = window.DB.tableCols('alliances');
            container.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' + data.map(function(m) {
                var alliance = getAlliance(m[mc.allianceId]);
                var allianceLabel = alliance ? ' [' + alliance[ac.tag] + ']' : '';
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
                return '<a href="game.html?id=' + (m[mc.id] || m.id) + '" class="block rounded-xl p-4 transition hover:opacity-90 bg-slate-900 border border-indigo-900"><div class="flex items-center justify-between mb-2"><div>' + statusBadge + typeBadge + '</div></div><h3 class="font-bold text-lg text-slate-100">' + (m[mc.name] || 'Partida') + allianceLabel + '</h3><p class="text-xs mt-1 text-slate-400">' + window.formatDate(m[mc.createdAt]) + ' | Max: ' + (m[mc.maxPlayers] || '-') + '</p></a>';
            }).join('') + '</div>';
        } catch(e) {
            console.error('[Dashboard]', e);
            var container = document.getElementById('matches-list');
            if (container) {
                container.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando partidas: ' + e.message + '<br><button onclick="window.loadMatches()" class="mt-3 px-4 py-2 rounded-lg text-sm font-bold bg-indigo-900 text-slate-100 min-h-[44px]">Reintentar</button></div>';
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