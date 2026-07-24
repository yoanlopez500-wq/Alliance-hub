/**
 * sanctions.js - Módulo central de sanciones para Alliance Hub
 *
 * Responsabilidad única: verificar, limpiar y reportar sanciones de jugadores.
 * Reutilizable en registro, credenciales, admin y rankings.
 */
(function() {
    'use strict';

    function isValidDate(d) {
        return d instanceof Date && !isNaN(d.getTime());
    }

    function parseDate(value) {
        if (!value) return null;
        var d = new Date(value);
        return isValidDate(d) ? d : null;
    }

    /**
     * Devuelve true si el jugador está baneado o suspendido con una fecha futura.
     */
    function isPlayerSanctioned(player) {
        if (!player) return false;
        var now = new Date();
        if (player.status === 'banned') {
            if (!player.banned_until) return true; // ban permanente
            var until = parseDate(player.banned_until);
            return until ? until > now : true;
        }
        if (player.status === 'suspended') {
            // Suspension sin fecha = activa (bloquea). Si tiene fecha, verificar vigencia.
            if (!player.suspended_until) return true;
            var until = parseDate(player.suspended_until);
            return until ? until > now : true;
        }
        return false;
    }

    /**
     * Calcula el tiempo restante legible de una sanción.
     */
    function getRemainingText(untilDate) {
        if (!untilDate) return 'permanente';
        var d = parseDate(untilDate);
        if (!d) return 'desconocido';
        var diff = d - new Date();
        if (diff <= 0) return 'expirado';
        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (days > 0) return days + ' dia(s) y ' + hours + ' hora(s)';
        if (hours > 0) return hours + ' hora(s) y ' + minutes + ' minuto(s)';
        return minutes + ' minuto(s)';
    }

    /**
     * Devuelve un resumen legible de la sanción del jugador.
     */
    function getSanctionSummary(player) {
        if (!player) {
            return { isSanctioned: false, type: null, remainingText: '', reason: '' };
        }
        if (player.status === 'banned') {
            return {
                isSanctioned: true,
                type: 'banned',
                remainingText: getRemainingText(player.banned_until),
                reason: player.suspension_reason || 'Cuenta baneada'
            };
        }
        if (player.status === 'suspended') {
            if (!player.suspended_until) {
                return {
                    isSanctioned: true,
                    type: 'suspended',
                    remainingText: 'permanente',
                    reason: player.suspension_reason || 'Cuenta suspendida'
                };
            }
            var until = parseDate(player.suspended_until);
            if (!until || until > new Date()) {
                return {
                    isSanctioned: true,
                    type: 'suspended',
                    remainingText: until ? getRemainingText(player.suspended_until) : 'permanente',
                    reason: player.suspension_reason || 'Cuenta suspendida'
                };
            }
        }
        return { isSanctioned: false, type: null, remainingText: '', reason: '' };
    }

    /**
     * Limpia sanciones expiradas en la tabla players.
     */
    async function checkAndClearExpiredSanctions(playerId) {
        if (!playerId) return;
        try {
            var { data: player, error } = await window.supabase
                .from('players')
                .select('status, banned_until, suspended_until')
                .eq('id', parseInt(playerId))
                .single();
            if (error || !player) return;
            var now = new Date();
            var updates = {};
            if (player.status === 'banned' && player.banned_until) {
                var until = parseDate(player.banned_until);
                if (until && until <= now) {
                    updates.status = 'active';
                    updates.banned_until = null;
                    updates.suspension_reason = null;
                }
            }
            if (player.status === 'suspended' && player.suspended_until) {
                var until = parseDate(player.suspended_until);
                if (until && until <= now) {
                    updates.status = 'active';
                    updates.suspended_until = null;
                    updates.suspension_reason = null;
                }
            }
            if (Object.keys(updates).length > 0) {
                await window.supabase.from('players').update(updates).eq('id', parseInt(playerId));
            }
        } catch(e) {
            console.error('[AHSanctions] Error clearing expired sanctions:', e);
        }
    }

    /**
     * Verifica que el jugador no esté sancionado. Si lo está, devuelve un error.
     * También limpia sanciones expiradas.
     */
    async function assertNoSanction(playerId) {
        if (!playerId) {
            return {
                ok: false,
                message: 'No se pudo identificar al jugador.',
                summary: null
            };
        }
        try {
            await checkAndClearExpiredSanctions(playerId);
            var { data: player, error } = await window.supabase
                .from('players')
                .select('status, banned_until, suspended_until, suspension_reason')
                .eq('id', parseInt(playerId))
                .single();
            if (error) {
                console.error('[AHSanctions] Error reading player:', error);
                return {
                    ok: false,
                    message: 'No se pudo verificar el estado de la cuenta. Intenta de nuevo.',
                    summary: null
                };
            }
            var summary = getSanctionSummary(player);
            if (summary.isSanctioned) {
                return {
                    ok: false,
                    message: 'Cuenta restringida: ' + summary.reason + '. Tiempo restante: ' + summary.remainingText,
                    summary: summary
                };
            }
            return { ok: true };
        } catch(e) {
            console.error('[AHSanctions] assertNoSanction error:', e);
            return {
                ok: false,
                message: 'Error de verificacion. Intenta de nuevo.',
                summary: null
            };
        }
    }

    window.AHSanctions = {
        isPlayerSanctioned: isPlayerSanctioned,
        getSanctionSummary: getSanctionSummary,
        getRemainingText: getRemainingText,
        checkAndClearExpiredSanctions: checkAndClearExpiredSanctions,
        assertNoSanction: assertNoSanction
    };
})();
