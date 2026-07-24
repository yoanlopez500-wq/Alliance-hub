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

    function getUserRoleForRules() {
        if (typeof window.resolveUserVisibilityRole === 'function') {
            try { return window.resolveUserVisibilityRole(); } catch(e) {}
        }
        return 'public';
    }

    function canShowSection(section) {
        if (typeof window.canSeeRuleSection === 'function') {
            try { return window.canSeeRuleSection(getUserRoleForRules(), section.visibility || 'public'); } catch(e) {}
        }
        return (section.visibility || 'public') === 'public';
    }

    function compareSectionNumber(a, b) {
        var partsA = String(a.section_number || a.order_index || '0').split('.').map(Number);
        var partsB = String(b.section_number || b.order_index || '0').split('.').map(Number);
        var maxLen = Math.max(partsA.length, partsB.length);
        for (var i = 0; i < maxLen; i++) {
            var valA = partsA[i] || 0;
            var valB = partsB[i] || 0;
            if (valA !== valB) return valA - valB;
        }
        return 0;
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
    var landingSectionsCache = [];
    var allSectionsMap = {};
    async function loadLandingRules() {
        try {
            var { data, error } = await window.supabase
                .from('rule_sections')
                .select('*')
                .eq('is_active', true)
                .is('parent_id', null)
                .order('order_index');
            if (error) throw error;
            var visible = (data || []).filter(canShowSection);
            visible.sort(compareSectionNumber);
            var topSix = visible.slice(0, 6);

            // Guardar mapa de todas las secciones visibles (incluyendo subsecciones) para enlaces de precedentes
            var { data: allSections } = await window.supabase
                .from('rule_sections')
                .select('*')
                .eq('is_active', true)
                .order('order_index');
            allSectionsMap = {};
            (allSections || []).filter(canShowSection).forEach(function(s) { allSectionsMap[s.id] = s; });

            var container = document.getElementById('landing-rules');
            if (!container) return;
            if (topSix.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">No hay reglas configuradas.</div>';
                return;
            }
            landingSectionsCache = topSix;
            container.innerHTML = topSix.map(function(s) {
                var num = s.section_number || String(s.order_index + 1);
                return '<div class="rounded-xl p-4 fade-in bg-ah-card border border-indigo-900"><h3 class="font-bold text-sm mb-1 text-ah-accent">' + num + '. ' + s.title + '</h3><p class="text-sm text-ah-muted">' + (s.content || '').substring(0, 150) + ((s.content || '').length > 150 ? '...' : '') + '</p></div>';
            }).join('');
        } catch(e) {
            console.error('[LandingRules]', e);
            var container = document.getElementById('landing-rules');
            if (container) container.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando reglamento: ' + e.message + '</div>';
        }
    }

    // Cargar precedentes en la landing (lazy, colapsable)
    function renderPrecedentSeverity(severity) {
        var map = { high: ['#ef5350', 'ALTO'], medium: ['#ff8f00', 'MEDIO'], low: ['#66bb6a', 'LEVE'], minor: ['#66bb6a', 'LEVE'] };
        var pair = map[severity] || ['#9fa8da', 'LEVE'];
        return '<span class="text-[10px] px-1.5 py-0.5 rounded font-bold" style="background:' + pair[0] + '20;color:' + pair[0] + ';">' + pair[1] + '</span>';
    }
    function findSectionName(sectionId) {
        var sec = allSectionsMap[sectionId];
        return sec ? (sec.section_number || '') + ' ' + sec.title : null;
    }
    async function loadLandingPrecedents() {
        try {
            var container = document.getElementById('landing-precedents');
            if (!container) return;
            container.innerHTML = '<button id="landing-precedents-toggle" class="w-full flex items-center justify-between rounded-lg p-3 text-left bg-ah-card border border-indigo-900"><span class="font-bold text-sm text-ah-accent">&#9878;&#65039; Ver precedentes y jurisprudencia</span><span id="landing-precedents-chevron" class="text-xs text-ah-muted">&#9660;</span></button><div id="landing-precedents-content" class="hidden grid md:grid-cols-2 gap-3 mt-3"></div>';
            document.getElementById('landing-precedents-toggle').addEventListener('click', async function() {
                var content = document.getElementById('landing-precedents-content');
                var chevron = document.getElementById('landing-precedents-chevron');
                if (!content.classList.contains('hidden')) {
                    content.classList.add('hidden');
                    chevron.textContent = '\u25BC';
                    return;
                }
                content.innerHTML = '<div class="col-span-2 text-center py-4 text-sm text-ah-muted">Cargando...</div>';
                content.classList.remove('hidden');
                chevron.textContent = '\u25B2';
                try {
                    var { data, error } = await window.supabase.from('rule_precedents').select('*').order('created_at', { ascending: false }).limit(8);
                    if (error) throw error;
                    if (!data || data.length === 0) {
                        content.innerHTML = '<div class="col-span-2 text-center py-4 text-sm text-ah-muted">No hay precedentes registrados aun.</div>';
                        return;
                    }
                    content.innerHTML = data.map(function(p) {
                        var sectionName = findSectionName(p.rule_section_id);
                        var sectionLink = sectionName ? '<a href="rules.html#section-' + p.rule_section_id + '" class="text-[10px] underline text-ah-accent">' + sectionName + '</a>' : '<span class="text-[10px] text-ah-muted">Sin seccion asignada</span>';
                        return '<div class="rounded-lg p-3 fade-in bg-ah-card border border-indigo-900"><div class="flex items-start justify-between gap-2 mb-1"><h4 class="font-bold text-sm text-ah-accent">' + p.title + '</h4>' + renderPrecedentSeverity(p.severity) + '</div><p class="text-xs mb-2 text-ah-text">' + (p.description || '').substring(0, 120) + ((p.description || '').length > 120 ? '...' : '') + '</p><div class="flex items-center justify-between">' + sectionLink + '<a href="rules.html#precedent-' + p.id + '" class="text-[10px] text-ah-muted hover:text-ah-accent">Ver mas &#8594;</a></div></div>';
                    }).join('');
                } catch(e) {
                    console.error('[LandingPrecedents]', e);
                    content.innerHTML = '<div class="col-span-2 text-center py-4 text-red-400">Error cargando precedentes: ' + e.message + '</div>';
                }
            });
        } catch(e) {
            console.error('[LandingPrecedents]', e);
        }
    }

    // Inicializar cuando el DOM este listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            waitForSupabase(function() {
                loadStats();
                loadLandingRules();
                loadLandingPrecedents();
            });
        });
    } else {
        waitForSupabase(function() {
            loadStats();
            loadLandingRules();
            loadLandingPrecedents();
        });
    }
})();
