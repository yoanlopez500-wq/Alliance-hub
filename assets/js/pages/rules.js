/**
 * rules.js - Logica de la pagina de reglamento (rules.html)
 *
 * Extraido de rules.html como parte de la refactorizacion.
 * Funciones: carga de reglas jerarquicas y precedentes/jurisprudencia.
 */
(function() {
    'use strict';

    // Cargar reglas del reglamento (jerarquia: padres -> subsecciones)
    async function loadRules() {
        try {
            var { data, error } = await window.supabase.from('rule_sections').select('*').order('order_index');
            if (error) throw error;
            var container = document.getElementById('rules-content');
            if (!container) return;
            if (!data || data.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-ah-muted">No hay reglas configuradas.</div>';
                return;
            }

            var sectionsById = {};
            var rootSections = [];
            data.forEach(function(s) { sectionsById[s.id] = s; });

            data.forEach(function(s) {
                if (!s.parent_id || !sectionsById[s.parent_id]) { rootSections.push(s); }
            });

            function renderSection(s, level) {
                var indentClass = level > 0 ? 'rule-subsection' : '';
                var num = s.section_number || (s.order_index + 1);
                var sevClass = s.severity === 'high' ? 'severity-high' : s.severity === 'medium' ? 'severity-medium' : 'severity-low';
                var sevLabel = s.severity === 'high' ? 'GRAVE' : s.severity === 'medium' ? 'MEDIO' : 'LEVE';

                var html = '<div class="rounded-xl p-5 ' + indentClass + ' bg-ah-card border border-indigo-900"><div class="flex items-start justify-between gap-3"><div class="flex-1"><h3 class="font-bold text-sm text-ah-accent">' + num + '. ' + s.title + '</h3><p class="text-sm mt-1 text-ah-text">' + (s.content || '').replace(/\n/g, '<br>') + '</p></div><span class="text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ' + sevClass + '">' + sevLabel + '</span></div></div>';

                var children = data.filter(function(c) { return c.parent_id === s.id; });
                if (children.length > 0) {
                    html += '<div class="rule-children">' + children.sort(function(a, b) {
                        return (a.section_number || '') > (b.section_number || '') ? 1 : -1;
                    }).map(function(c) { return renderSection(c, level + 1); }).join('') + '</div>';
                }
                return html;
            }

            container.innerHTML = rootSections.sort(function(a, b) {
                return (a.section_number || '') > (b.section_number || '') ? 1 : -1;
            }).map(function(s) { return renderSection(s, 0); }).join('');
        } catch(e) {
            console.error('[Rules]', e);
            var container = document.getElementById('rules-content');
            if (container) container.innerHTML = '<div class="text-center py-8 text-red-400">Error cargando reglamento: ' + e.message + '</div>';
        }
    }

    // Cargar precedentes y jurisprudencia
    async function loadPrecedents() {
        try {
            var { data, error } = await window.supabase.from('rule_precedents').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            var container = document.getElementById('precedents-content');
            if (!container) return;
            if (!data || data.length === 0) {
                container.innerHTML = '<div class="text-center py-4 text-sm text-ah-muted">No hay precedentes registrados aun.</div>';
                return;
            }
            container.innerHTML = data.map(function(p) {
                var sevClass = p.severity === 'high' ? 'severity-high' : p.severity === 'medium' ? 'severity-medium' : 'severity-low';
                return '<div class="precedent-card rounded-lg p-4 bg-ah-card border border-indigo-900"><div class="flex items-start gap-2"><span class="text-lg">&#9878;&#65039;</span><div class="flex-1"><h4 class="font-bold text-sm text-ah-accent">' + p.title + '</h4><p class="text-xs mt-1 text-ah-text">' + p.description + '</p>' + (p.sanction ? '<p class="text-[10px] mt-2 px-2 py-0.5 rounded inline-block ' + sevClass + '">Sancion: ' + p.sanction + '</p>' : '') + '</div></div></div>';
            }).join('');
        } catch(e) {
            console.error('[Precedents]', e);
            var container = document.getElementById('precedents-content');
            if (container) container.innerHTML = '<div class="text-center py-4 text-red-400">Error: ' + e.message + '</div>';
        }
    }

    // Inicializar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            loadRules();
            loadPrecedents();
        });
    } else {
        loadRules();
        loadPrecedents();
    }
})();