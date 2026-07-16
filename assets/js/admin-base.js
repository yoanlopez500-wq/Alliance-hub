/**
 * admin-base.js - Funciones compartidas del panel de administracion
 *
 * Centraliza patrones repetidos en admin/*.html:
 *   - Carga de mapa de alianzas (loadAlliancesMap + getAlliance)
 *   - Carga de lista de alianzas (loadAlliancesList + getAllianceName)
 *   - Helpers de modal CRUD
 *   - Defensive guards para funciones que pueden fallar al cargar
 *
 * Depende de: base.js, auth-core.js (deben cargarse antes via loader.js)
 */
(function() {
    'use strict';

    // ===================== MAPA DE ALIANZAS =====================

    var allAlliances = [];

    /**
     * Carga todas las alianzas en una variable global cacheada.
     * Usa select simple sin FK joins (workaround para schema roto).
     */
    window.loadAlliancesMap = async function() {
        try {
            var { data, error } = await supabase.from('alliances').select('id, name, tag');
            if (error) throw error;
            allAlliances = data || [];
        } catch(e) { console.error('[Admin] Error cargando alliances:', e); allAlliances = []; }
    };

    /**
     * Obtiene una alianza del cache por ID.
     * @returns {Object|null} Alianza con id, name, tag o null
     */
    window.getAlliance = function(allianceId) {
        if (!allianceId || !allAlliances.length) return null;
        return allAlliances.find(function(a) { return a.id === allianceId; }) || null;
    };

    /**
     * Carga alianzas con descripcion (para paginas que necesitan mas datos).
     */
    window.loadAlliancesList = async function() {
        try {
            var { data, error } = await supabase.from('alliances').select('id, name, tag, description').order('name');
            if (error) throw error;
            allAlliances = data || [];
        } catch(e) { console.error('[Admin] Error cargando alliances:', e); allAlliances = []; }
    };

    /**
     * Obtiene nombre de alianza del cache por ID.
     * @returns {Object|null} Alianza con id, name, tag, description o null
     */
    window.getAllianceName = function(allianceId) {
        if (!allianceId || !allAlliances.length) return null;
        return allAlliances.find(function(x) { return x.id === allianceId; }) || null;
    };

    // ===================== MODAL CRUD HELPERS =====================

    /**
     * Abre un modal por ID.
     */
    window.openModalById = function(modalId) {
        var modal = document.getElementById(modalId);
        if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    };

    /**
     * Cierra un modal por ID.
     */
    window.closeModalById = function(modalId) {
        var modal = document.getElementById(modalId);
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    };

    /**
     * Limpia inputs dentro de un contenedor.
     */
    window.clearInputs = function(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('input, textarea').forEach(function(el) {
            if (el.type !== 'hidden') el.value = '';
        });
    };

    // ===================== DEFENSIVE GUARDS =====================

    // Guard para getStatusBadgePlayer (algunos admin HTML no cargan base.js correctamente)
    if (typeof window.getStatusBadgePlayer !== 'function') {
        window.getStatusBadgePlayer = function(status) {
            if (status === 'active') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-500">ACTIVO</span>';
            if (status === 'banned') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">BANEADO</span>';
            if (status === 'suspended') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">SUSPENDIDO</span>';
            return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-white/5 text-slate-400">' + (status || '?') + '</span>';
        };
    }

    // Guard para showToast
    if (typeof window.showToast !== 'function') {
        window.showToast = function(message, type) {
            console.log('[' + (type || 'info') + ']', message);
            alert(message);
        };
    }

    // Guard para formatDate
    if (typeof window.formatDate !== 'function') {
        window.formatDate = function(iso) {
            if (!iso) return '-';
            var d = new Date(iso);
            return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        };
    }

    // Guard para ahPath
    if (typeof window.ahPath !== 'function') {
        window.ahPath = function(relative) { return relative; };
    }

    console.log('[admin-base] Loaded. Alliances cache, modal helpers, and defensive guards ready.');
})();
