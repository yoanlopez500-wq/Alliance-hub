/**
 * rules.js - Logica de la pagina de reglamento (rules.html)
 *
 * Extraido de rules.html como parte de la refactorizacion.
 * Funciones: carga de reglas jerarquicas y precedentes/jurisprudencia.
 */
(function() {
    'use strict';

    var sectionsData = [];

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

    // Cargar reglas del reglamento (jerarquia: padres -> subsecciones)
    async function loadRules() {
        try {
            var { data, error } = await window.supabase.from('rule_sections').select('*').order('order_index');
            if (error) throw error;
            sectionsData = (data || []).filter(canShowSection);
            sectionsData.sort(compareSectionNumber);
            var container = document.getElementById('rules-content');
            if (!container) return;
            if (sectionsData.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">No hay reglas configuradas.</div>';
                return;
            }

            var sectionsById = {};
            var rootSections = [];
            sectionsData.forEach(function(s) { sectionsById[s.id] = s; });

            sectionsData.forEach(function(s) {
                if (!s.parent_id || !sectionsById[s.parent_id]) { rootSections.push(s); }
            });
            rootSections.sort(compareSectionNumber);

            function renderSection(s, level) {
                var indentClass = level > 0 ? 'rule-subsection' : '';
                var num = s.section_number || (s.order_index + 1);
                var sevClass = s.severity === 'high' ? 'severity-high' : s.severity === 'medium' ? 'severity-medium' : 'severity-low';
                var sevLabel = s.severity === 'high' ? 'GRAVE' : s.severity === 'medium' ? 'MEDIO' : 'LEVE';

                var html = '<div id="section-' + s.id + '" class="rounded-xl p-5 ' + indentClass + ' bg-ah-card border border-indigo-900"><div class="flex items-start justify-between gap-3"><div class="flex-1"><h3 class="font-bold text-sm text-ah-accent">' + num + '. ' + s.title + '</h3><p class="text-sm mt-1 text-ah-text">' + (s.content || '').replace(/\n/g, '<br>') + '</p></div><span class="text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ' + sevClass + '">' + sevLabel + '</span></div></div>';

                var children = sectionsData.filter(function(c) { return c.parent_id === s.id; });
                if (children.length > 0) {
                    children.sort(compareSectionNumber);
                    html += '<div class="rule-children">' + children.map(function(c) { return renderSection(c, level + 1); }).join('') + '</div>';
                }
                return html;
            }

            container.innerHTML = rootSections.map(function(s) { return renderSection(s, 0); }).join('');
        } catch(e) {
            console.error('[Rules]', e);
            var container = document.getElementById('rules-content');
            if (container) container.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando reglamento: ' + e.message + '</div>';
        }
    }

    // Cargar precedentes y jurisprudencia (colapsable, lazy)
    function findSectionName(sectionId) {
        if (!sectionsData) return null;
        var sec = sectionsData.find(function(s) { return s.id === sectionId; });
        return sec ? (sec.section_number || '') + ' ' + sec.title : null;
    }

    function renderPrecedentSeverity(sev) {
        var map = { high: ['severity-high', 'GRAVE'], medium: ['severity-medium', 'MEDIO'], low: ['severity-low', 'LEVE'], minor: ['severity-low', 'LEVE'] };
        var pair = map[sev] || ['severity-low', 'LEVE'];
        return { className: pair[0], label: pair[1] };
    }

    function renderPrecedentSeverityBadge(sev) {
        var info = renderPrecedentSeverity(sev);
        return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + info.className + '">' + info.label + '</span>';
    }

    function loadPrecedents() {
        var container = document.getElementById('precedents-content');
        if (!container) return;
        container.innerHTML = '<button id="precedents-toggle" class="w-full flex items-center justify-between rounded-xl p-4 bg-ah-card border border-indigo-900 hover:opacity-80 transition"><span class="font-bold text-sm text-ah-accent">&#9878;&#65039; Ver precedentes y jurisprudencia</span><span id="precedents-chevron" class="text-xs text-ah-muted">&#9660;</span></button><div id="precedents-list" class="hidden grid md:grid-cols-2 gap-3 mt-3"></div>';
        document.getElementById('precedents-toggle').addEventListener('click', async function() {
            var list = document.getElementById('precedents-list');
            var chevron = document.getElementById('precedents-chevron');
            if (!list.classList.contains('hidden')) {
                list.classList.add('hidden');
                chevron.textContent = '&#9660;';
                return;
            }
            list.classList.remove('hidden');
            chevron.textContent = '&#9650;';
            if (list.dataset.loaded) return;
            list.innerHTML = '<div class="col-span-2 text-center py-4 text-sm text-ah-muted">Cargando...</div>';
            try {
                var { data, error } = await window.supabase.from('rule_precedents').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                if (!data || data.length === 0) {
                    list.innerHTML = '<div class="col-span-2 text-center py-4 text-sm text-ah-muted">No hay precedentes registrados aun.</div>';
                    return;
                }
                list.innerHTML = data.map(function(p) {
                    var sectionName = findSectionName(p.rule_section_id);
                    var sectionLink = sectionName ? '<a href="#section-' + p.rule_section_id + '" class="text-[10px] underline text-ah-accent">' + sectionName + '</a>' : '<span class="text-[10px] text-ah-muted">Sin seccion asignada</span>';
                    var sevInfo = renderPrecedentSeverity(p.severity);
                    return '<div id="precedent-' + p.id + '" class="precedent-card rounded-lg p-4 bg-ah-card border border-indigo-900"><div class="flex items-start justify-between gap-2 mb-2"><h4 class="font-bold text-sm text-ah-accent">' + p.title + '</h4>' + renderPrecedentSeverityBadge(p.severity) + '</div><p class="text-xs text-ah-text">' + (p.description || '') + '</p>' + (p.sanction ? '<p class="text-[10px] mt-2 px-2 py-0.5 rounded inline-block ' + sevInfo.className + '">Sancion: ' + p.sanction + '</p>' : '') + '<div class="mt-2">' + sectionLink + '</div></div>';
                }).join('');
                list.dataset.loaded = 'true';
            } catch(e) {
                console.error('[Precedents]', e);
                list.innerHTML = '<div class="col-span-2 text-center py-4 text-red-400">Error: ' + e.message + '</div>';
            }
        });
    }

    // Inicializar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async function() {
            await loadRules();
            loadPrecedents();
        });
    } else {
        (async function() {
            await loadRules();
            loadPrecedents();
        })();
    }
})();
