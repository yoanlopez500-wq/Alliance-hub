/**
 * ranking-utils.js - Utilidades compartidas para calcular stats de ranking validas.
 *
 * Un resultado solo cuenta para rankings si el jugador esta registrado en la partida
 * (existe fila en match_registrations con match_id + player_id).
 * No modifica la base de datos ni agrega columnas; solo encapsula el calculo comun.
 */
(function() {
    'use strict';

    /**
     * Calcula kills, deaths y partidas validas para los jugadores solicitados.
     *
     * @param {Object} opts
     * @param {number[]} [opts.playerIds] - Si se omite, se calcula para todos los resultados.
     * @param {boolean} [opts.excludeInternal=true] - Excluye partidas de tipo 'internal'.
     * @param {string} [opts.excludeMatchType='internal'] - Tipo de partida a excluir.
     * @returns {Promise<Object>} Mapa player_id -> { kills, deaths, games }
     */
    async function getValidPlayerStats(opts) {
        opts = opts || {};
        var playerIds = opts.playerIds || null;
        var excludeInternal = opts.excludeInternal !== false;
        var excludeMatchType = opts.excludeMatchType || 'internal';

        var q = window.supabase.from('match_results')
            .select('player_id, kills, deaths, match_id, matches!inner(match_type, alliance_id)');
        if (excludeInternal) q = q.neq('matches.match_type', excludeMatchType);
        if (playerIds && playerIds.length > 0) q = q.in('player_id', playerIds);

        var res = await q;
        if (res.error) throw res.error;
        var results = res.data || [];

        var matchIds = [];
        results.forEach(function(r) {
            if (r.match_id && matchIds.indexOf(r.match_id) === -1) matchIds.push(r.match_id);
        });

        var validRegistrations = {};
        if (matchIds.length > 0) {
            var mrc = window.DB.tableCols('matchRegistrations');
            var regRes = await window.DB.from('matchRegistrations')
                .select([mrc.matchId, mrc.playerId].join(', '))
                .in(mrc.matchId, matchIds);
            if (regRes.error) throw regRes.error;
            (regRes.data || []).forEach(function(r) {
                validRegistrations[r[mrc.matchId] + ':' + r[mrc.playerId]] = true;
            });
        }

        var stats = {};
        results.forEach(function(r) {
            if (!validRegistrations[r.match_id + ':' + r.player_id]) return;
            var pid = r.player_id;
            if (!stats[pid]) stats[pid] = { kills: 0, deaths: 0, games: 0 };
            stats[pid].kills += (r.kills || 0);
            stats[pid].deaths += (r.deaths || 0);
            stats[pid].games += 1;
        });
        return stats;
    }

    window.RankingUtils = {
        getValidPlayerStats: getValidPlayerStats
    };
})();
