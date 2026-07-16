/**
 * landing.js - Logica de la pagina de inicio (index.html)
 *
 * Extraido de index.html como parte de la refactorizacion.
 * Funciones: carga de estadisticas, reglamento y precedentes en la landing.
 */
(function() {
    'use strict';

    // Esperar a que Supabase este disponible
    function waitForSupabase(callback, attempts) {
        attempts = attempts || 0;
        if (typeof window.supabase !== 'undefined' && typeof window.supabase.from === 'function') {
            callback();
            return;
        }
        if (attempts < 50) {
            setTimeout(function() { waitForSupabase(callback, attempts + 1); }, 100);
        } else {
            console.error('[Landing] Supabase no disponible despues de 5 segundos');
            var rulesEl = document.getElementById('landing-rules');
            var precEl = document.getElementById('landing-precedents');
            if (rulesEl) rulesEl.innerHTML = '<div class="col-span-2 text-center py-8 text-red-400">Error de conexion con el servidor</div>';
            if (precEl) precEl.innerHTML = '<div class="col-span-2 text-center py-8 text-red-400">Error de conexion</div>';
        }
    }

    // Cargar estadisticas globales
    async function loadStats() {
        try {
            var p = await window.supabase.from('players').select('*', { count: 'exact', head: true });
            var elPlayers = document.getElementById('stat-players');
            if (elPlayers) elPlayers.textContent = p.count || 0;

            var a = await window.supabase.from('alliances').select('*', { count: 'exact', head: true });
            var elAlliances = document.getElementById('stat-alliances');
            if (elAlliances) elAlliances.textContent = a.count || 0;

            var m = await window.supabase.from('matches').select('*', { count: 'exact', head: true });
            var elMatches = document.getElementById('stat-matches');
            if (elMatches) elMatches.textContent = m.count || 0;

            var k = await window.supabase.from('match_results').select('kills', { count: 'exact' });
            var totalKills = 0;
            if (k.data) k.data.forEach(function(r) { totalKills += r.kills || 0; });
            var elKills = document.getElementById('stat-kills');
            if (elKills) elKills.textContent = totalKills.toLocaleString();
        } catch(e) { console.error('[Stats]', e); }
    }

    // Cargar reglas en la landing
    async function loadLandingRules() {
        try {
            var { data, error } = await window.supabase.from('rule_sections').select('*').order('order_index').limit(6);
            if (error) throw error;
            var container = document.getElementById('landing-rules');
            if (!container) return;
            if (!data || data.length === 0) {
                container.innerHTML = '<div class="text-center py-8" style="color:#9fa8da;">No hay reglas configuradas.</div>';
                return;
            }
            container.innerHTML = data.map(function(s) {
                return '<div class="rounded-xl p-4 fade-in" style="background:#0a0e27;border:1px solid #1a237e;"><h3 class="font-bold text-sm mb-1" style="color:#ff8f00;">' + (s.order_index + 1) + '. ' + s.title + '</h3><p class="text-sm" style="color:#9fa8da;">' + (s.content || '').substring(0, 150) + ((s.content || '').length > 150 ? '...' : '') + '</p></div>';
            }).join('');
            loadLandingPrecedents();
        } catch(e) {
            console.error('[LandingRules]', e);
            var container = document.getElementById('landing-rules');
            if (container) container.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando reglamento: ' + e.message + '</div>';
        }
    }

    // Cargar precedentes en la landing
    async function loadLandingPrecedents() {
        try {
            var { data, error } = await window.supabase.from('rule_precedents').select('*').order('created_at', { ascending: false }).limit(4);
            if (error) throw error;
            var container = document.getElementById('landing-precedents');
            if (!container) return;
            if (!data || data.length === 0) {
                container.innerHTML = '<div class="text-center py-4 text-sm" style="color:#9fa8da;">No hay precedentes registrados aun.</div>';
                return;
            }
            container.innerHTML = data.map(function(p) {
                return '<div class="rounded-lg p-3 fade-in" style="background:#0a0e27;border:1px solid #1a237e;"><div class="flex items-start gap-2"><span class="text-lg">&#9878;&#65039;</span><div><h4 class="font-bold text-sm" style="color:#ff8f00;">' + p.title + '</h4><p class="text-xs" style="color:#e8eaf6;">' + p.description + '</p></div></div></div>';
            }).join('');
        } catch(e) {
            console.error('[LandingPrecedents]', e);
            var container = document.getElementById('landing-precedents');
            if (container) container.innerHTML = '<div class="text-center py-4 text-red-400">Error cargando precedentes: ' + e.message + '</div>';
        }
    }

    // Inicializar cuando el DOM este listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            waitForSupabase(function() {
                loadStats();
                loadLandingRules();
            });
        });
    } else {
        waitForSupabase(function() {
            loadStats();
            loadLandingRules();
        });
    }
})();