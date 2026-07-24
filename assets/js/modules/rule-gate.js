/**
 * rule-gate.js - Gate de reglamento para registro a partidas
 *
 * Muestra el reglamento de Alliance Hub y exige aceptación explícita
 * antes de revelar el ID y la contraseña de una partida.
 */
(function() {
    'use strict';

    var MODAL_ID = 'ah-rule-gate-modal';
    var STORAGE_KEY_PREFIX = 'ah_rule_consent_';
    // Sal simple para dificultar la manipulacion casual del consentimiento en localStorage.
    var CONSENT_SALT = 'AH_RULES_2026';

    function getConsentKey(playerId, matchId) {
        return STORAGE_KEY_PREFIX + playerId + '_' + matchId;
    }

    // Hash rapido no criptografico (djb2) para vincular el consentimiento a player+match.
    function computeConsentHash(playerId, matchId) {
        var str = CONSENT_SALT + '|' + playerId + '|' + matchId;
        var hash = 5381;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return (hash >>> 0).toString(36);
    }

    function hasRuleConsent(playerId, matchId) {
        try {
            return localStorage.getItem(getConsentKey(playerId, matchId)) === 'accepted:' + computeConsentHash(playerId, matchId);
        } catch(e) {
            return false;
        }
    }

    function setRuleConsent(playerId, matchId) {
        try {
            localStorage.setItem(getConsentKey(playerId, matchId), 'accepted:' + computeConsentHash(playerId, matchId));
        } catch(e) {}
    }

    function clearRuleConsent(playerId, matchId) {
        try {
            localStorage.removeItem(getConsentKey(playerId, matchId));
        } catch(e) {}
    }

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    function renderSection(section, level) {
        var indent = level > 0 ? 'ml-4 pl-4 border-l-2 border-indigo-900/50' : '';
        var num = section.section_number || (section.order_index + 1);
        var titleClass = level === 0 ? 'text-amber-400 text-base font-bold' : 'text-slate-200 text-sm font-bold';
        var contentClass = level === 0 ? 'text-slate-300' : 'text-slate-400';
        return '<div class="mb-4 ' + indent + '">' +
            '<h4 class="' + titleClass + '">' + escapeHtml(num + '. ' + section.title) + '</h4>' +
            '<p class="text-sm ' + contentClass + ' mt-1">' + escapeHtml(section.content || '').replace(/\n/g, '<br>') + '</p>' +
        '</div>';
    }

    async function loadRuleSections() {
        try {
            var { data, error } = await window.supabase
                .from('rule_sections')
                .select('*')
                .eq('is_active', true)
                .order('order_index', { ascending: true });
            if (error) throw error;
            var sections = (data || []).filter(canShowSection);
            sections.sort(compareSectionNumber);
            return sections;
        } catch(e) {
            console.error('[AHRuleGate] Error cargando reglamento:', e);
            return [];
        }
    }

    function ensureModal() {
        var existing = document.getElementById(MODAL_ID);
        if (existing) return existing;

        var modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4';
        modal.innerHTML =
            '<div class="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-indigo-900 shadow-2xl">' +
                '<div class="p-5 border-b border-indigo-900 bg-gradient-to-br from-orange-600 to-amber-500 rounded-t-2xl">' +
                    '<h2 class="text-lg font-bold text-white">&#128220; Reglamento de Alliance Hub</h2>' +
                    '<p class="text-xs text-white/80 mt-1">Debes leer y aceptar el reglamento para obtener los datos de acceso.</p>' +
                '</div>' +
                '<div id="ah-rule-gate-content" class="flex-1 overflow-y-auto p-5 text-sm">' +
                    '<p class="text-center text-slate-400 py-8">Cargando reglamento...</p>' +
                '</div>' +
                '<div class="p-5 border-t border-indigo-900 bg-slate-950 rounded-b-2xl">' +
                    '<div class="flex items-start gap-3 mb-4">' +
                        '<input type="checkbox" id="ah-rule-gate-accept" disabled class="mt-1 w-5 h-5 rounded accent-amber-500 cursor-pointer disabled:opacity-30">' +
                        '<label for="ah-rule-gate-accept" id="ah-rule-gate-label" class="text-sm text-slate-500 cursor-pointer select-none">' +
                            'He leído y acepto el reglamento' +
                        '</label>' +
                    '</div>' +
                    '<p id="ah-rule-gate-scroll-hint" class="text-xs text-amber-400 mb-3">&#8595; Desplázate hasta el final para habilitar la aceptación</p>' +
                    '<div class="flex gap-3 justify-end">' +
                        '<button id="ah-rule-gate-cancel" class="px-4 py-2 rounded-lg font-bold text-sm bg-indigo-900 text-slate-100 hover:opacity-80 transition">Cancelar</button>' +
                        '<button id="ah-rule-gate-confirm" disabled class="px-4 py-2 rounded-lg font-bold text-sm bg-gradient-to-r from-orange-600 to-amber-500 text-white opacity-50 cursor-not-allowed">Aceptar y continuar</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        return modal;
    }

    async function openGate(playerId, matchId, onConsent) {
        var modal = ensureModal();
        var content = document.getElementById('ah-rule-gate-content');
        var checkbox = document.getElementById('ah-rule-gate-accept');
        var label = document.getElementById('ah-rule-gate-label');
        var confirmBtn = document.getElementById('ah-rule-gate-confirm');
        var cancelBtn = document.getElementById('ah-rule-gate-cancel');
        var scrollHint = document.getElementById('ah-rule-gate-scroll-hint');

        checkbox.checked = false;
        checkbox.disabled = true;
        confirmBtn.disabled = true;
        confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
        scrollHint.classList.remove('hidden');
        label.classList.add('text-slate-500');
        label.classList.remove('text-slate-200');
        modal.classList.remove('hidden');

        var sections = await loadRuleSections();

        if (!sections || sections.length === 0) {
            content.innerHTML = '<p class="text-center text-slate-400 py-8">No hay reglamento configurado. Puedes continuar.</p>';
            checkbox.disabled = false;
            scrollHint.classList.add('hidden');
            label.classList.remove('text-slate-500');
            label.classList.add('text-slate-200');
        } else {
            var sectionsById = {};
            sections.forEach(function(s) { sectionsById[s.id] = s; });
            var rootSections = sections.filter(function(s) { return !s.parent_id || !sectionsById[s.parent_id]; });
            rootSections.sort(compareSectionNumber);
            content.innerHTML = rootSections.map(function(s) {
                var children = sections.filter(function(c) { return c.parent_id === s.id; });
                children.sort(compareSectionNumber);
                return renderSection(s, 0) + children.map(function(c) { return renderSection(c, 1); }).join('');
            }).join('');
        }

        function checkScrolled() {
            if (!sections || sections.length === 0) return true;
            var tolerance = 20;
            return content.scrollTop + content.clientHeight >= content.scrollHeight - tolerance;
        }

        function updateCheckboxState() {
            if (checkScrolled()) {
                checkbox.disabled = false;
                scrollHint.classList.add('hidden');
                label.classList.remove('text-slate-500');
                label.classList.add('text-slate-200');
            }
        }

        function updateConfirmState() {
            if (checkbox.checked) {
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                confirmBtn.disabled = true;
                confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }

        function onScroll() { updateCheckboxState(); }
        function onCheckboxChange() { updateConfirmState(); }
        function onConfirm() {
            setRuleConsent(playerId, matchId);
            closeGate();
            if (typeof onConsent === 'function') onConsent();
        }
        function onCancel() {
            closeGate();
        }
        function onClose(e) {
            if (e.target === modal) onCancel();
        }

        function closeGate() {
            modal.classList.add('hidden');
            content.removeEventListener('scroll', onScroll);
            checkbox.removeEventListener('change', onCheckboxChange);
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onClose);
        }

        content.addEventListener('scroll', onScroll);
        checkbox.addEventListener('change', onCheckboxChange);
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onClose);

        // Por si el contenido es corto, verificar inmediatamente
        setTimeout(updateCheckboxState, 100);
    }

    function requireRuleConsent(playerId, matchId, onConsent) {
        if (hasRuleConsent(playerId, matchId)) {
            if (typeof onConsent === 'function') onConsent();
            return;
        }
        openGate(playerId, matchId, onConsent);
    }

    window.AHRuleGate = {
        requireConsent: requireRuleConsent,
        hasConsent: hasRuleConsent,
        clearConsent: clearRuleConsent
    };
})();
