/**
 * chat-channels.js - Modulo de canales del chat consolidado (window.ChatChannels)
 *
 * Carga los canales desde la tabla chat_channels y los filtra por el rol
 * del usuario usando la jerarquia unificada de roles-data.js:
 *   superadmin 5, event_admin 4, alliance_leader 3, moderator/co_leader 2, officer 1
 *
 * API:
 *   ChatChannels.roleLevel(role)            -> nivel numerico del rol
 *   ChatChannels.loadForRole(role)          -> Promise<Array<canal>> visibles para el rol
 *   ChatChannels.canPost(channel, role)     -> bool, si el rol puede escribir en el canal
 *
 * Scripts clasicos (sin ES modules). Requiere window.supabase y roles-data.js.
 */
(function() {
    'use strict';

    // Jerarquia de respaldo por si roles-data.js no cargo (no deberia pasar
    // porque loader.js la incluye en core). Debe coincidir con ROLE_HIERARCHY.
    var FALLBACK_HIERARCHY = {
        superadmin: 5,
        event_admin: 4,
        alliance_leader: 3,
        moderator: 2,
        co_leader: 2,
        officer: 1
    };

    // Cache en memoria de los canales activos para no consultar la BD en cada render.
    var cache = null;

    function roleLevel(role) {
        var h = window.ROLE_HIERARCHY || FALLBACK_HIERARCHY;
        return h[role] || 0;
    }

    // Un canal es visible para un rol si:
    //  - el rol esta en allowed_roles (si el array existe y no esta vacio), y
    //  - el nivel del rol >= min_level del canal (si min_level esta definido).
    function canSee(channel, role) {
        if (!channel || channel.is_active === false) return false;
        var allowed = channel.allowed_roles;
        if (allowed && allowed.length && allowed.indexOf(role) === -1) return false;
        if (channel.min_level != null && roleLevel(role) < channel.min_level) return false;
        return true;
    }

    // Poder escribir = poder ver (la RLS de chat_messages exige is_admin()).
    function canPost(channel, role) {
        return canSee(channel, role);
    }

    async function loadAll() {
        if (cache) return cache;
        try {
            var { data, error } = await window.supabase
                .from('chat_channels')
                .select('*')
                .eq('is_active', true)
                .order('name', { ascending: true });
            if (error) throw error;
            cache = data || [];
        } catch (e) {
            console.error('[ChatChannels] Error cargando canales:', e);
            cache = [];
        }
        return cache;
    }

    async function loadForRole(role) {
        var all = await loadAll();
        return all.filter(function(ch) { return canSee(ch, role); });
    }

    // Invalida el cache (por si se editan canales en caliente).
    function invalidate() { cache = null; }

    window.ChatChannels = {
        roleLevel: roleLevel,
        loadForRole: loadForRole,
        canPost: canPost,
        canSee: canSee,
        invalidate: invalidate
    };
})();
