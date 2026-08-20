/**
 * ranking-score.js - Motor compartido de ordenamiento de rankings (window.AHRankingScore)
 *
 * Unifica el criterio aprobado para TODAS las vistas de ranking y resultados:
 *
 *  1) Score Bayesiano (constante de confianza C=3) para rankings de jugadores:
 *       score = (kills_efectivas + C*priorK) / (muertes + C*priorD)
 *     con priors = promedios globales por partida de TODA la poblacion rankeada.
 *     Mitiga el sesgo de muestras pequenas (pocas partidas -> score hacia la media).
 *
 *  2) Desempate determinista de 5 niveles (rankings):
 *       score -> mas partidas -> menos muertes -> mas kills efectivas -> alfabetico
 *
 *  3) Desempate determinista de resultados de partida (tablas de resultados):
 *       kd_ratio -> mas kills -> menos muertes -> alfabetico
 *
 *  4) fetchAllRows: paginador PostgREST (defensa ante el limite ~1000 filas).
 *
 * API:
 *   AHRankingScore.BAYES_C                                  -> 3
 *   AHRankingScore.fetchAllRows(queryFn, pageSize?, cap?)   -> Promise<Array>
 *     queryFn(from, toInclusive) debe devolver Promise<{data, error}> (ej. .range(from, to))
 *   AHRankingScore.makeBayesScorer(players, acc)            -> { priorK, priorD, C, score(p) }
 *     acc = { eff(p), deaths(p), games(p) }  (eff = kills efectivas o crudas segun la vista)
 *   AHRankingScore.compareRankedPlayers(acc)                -> comparator(a, b)
 *     acc = { score(p), games(p), deaths(p), eff(p), name(p) }
 *   AHRankingScore.compareMatchResults(nameOf)              -> comparator(a, b)
 *     nameOf(row) -> string (username del jugador de esa fila)
 *   AHRankingScore.SORT_MODES                               -> [{id, label}] modos de orden
 *   AHRankingScore.compareBy(modeId, acc)                   -> comparator(a, b)
 *     Primario segun el modo + desempate final de 5 niveles (determinismo total).
 *     'score' (default) es IDENTICO a compareRankedPlayers: cero cambio visible.
 *   AHRankingScore.getSavedSortMode() / saveSortMode(id)    -> persistencia localStorage
 *
 * Scripts clasicos (sin ES modules). Cargado en SCRIPTS.core via loader.js.
 * No modifica la base de datos; solo encapsula el calculo comun.
 */
(function() {
    'use strict';

    var BAYES_C = 3;

    function safeNum(v) {
        return (typeof v === 'number' && isFinite(v)) ? v : 0;
    }

    /**
     * Paginador generico PostgREST. Garantiza la poblacion completa aunque
     * supere el limite de filas por request del servidor (~1000 por defecto).
     */
    async function fetchAllRows(queryFn, pageSize, hardCap) {
        var PAGE = pageSize || 1000;
        var CAP = hardCap || 50000;
        var out = [];
        for (var from = 0; ; from += PAGE) {
            var res = await queryFn(from, from + PAGE - 1);
            if (res && res.error) throw res.error;
            var rows = (res && res.data) || [];
            out = out.concat(rows);
            if (rows.length < PAGE || out.length >= CAP) break;
        }
        return out;
    }

    /**
     * Crea el scorer bayesiano sobre una poblacion ya mapeada.
     * Los priors usan la MISMA metrica de kills que el numerador (acc.eff),
     * para que el promedio global sea consistente con lo que se puntua.
     */
    function makeBayesScorer(players, acc) {
        var sumK = 0, sumD = 0, sumG = 0;
        (players || []).forEach(function(p) {
            sumK += safeNum(acc.eff(p));
            sumD += safeNum(acc.deaths(p));
            sumG += safeNum(acc.games(p));
        });
        var priorK = sumG > 0 ? sumK / sumG : 0;
        var priorD = sumG > 0 ? sumD / sumG : 0;
        return {
            priorK: priorK,
            priorD: priorD,
            C: BAYES_C,
            score: function(p) {
                var denom = safeNum(acc.deaths(p)) + BAYES_C * priorD;
                if (denom <= 0) denom = 1; // guardia: poblacion sin muertes
                return (safeNum(acc.eff(p)) + BAYES_C * priorK) / denom;
            }
        };
    }

    /**
     * Comparador determinista de 5 niveles para rankings de jugadores.
     * Total y estable: empates absolutos caen en orden alfabetico.
     */
    function compareRankedPlayers(acc) {
        return function(a, b) {
            var s = acc.score(b) - acc.score(a);
            if (isNaN(s)) s = 0; // guardia: dato corrupto nunca rompe el orden
            if (s !== 0) return s;
            var g = safeNum(acc.games(b)) - safeNum(acc.games(a));
            if (g !== 0) return g;
            var d = safeNum(acc.deaths(a)) - safeNum(acc.deaths(b));
            if (d !== 0) return d;
            var k = safeNum(acc.eff(b)) - safeNum(acc.eff(a));
            if (k !== 0) return k;
            var na = (acc.name(a) || '').toLowerCase();
            var nb = (acc.name(b) || '').toLowerCase();
            if (na < nb) return -1;
            if (na > nb) return 1;
            return 0;
        };
    }

    /**
     * Comparador determinista para tablas de resultados de una partida.
     * 1) kd_ratio del partido 2) mas kills 3) menos muertes 4) alfabetico.
     */
    function compareMatchResults(nameOf) {
        return function(a, b) {
            var kd = safeNum(b.kd_ratio) - safeNum(a.kd_ratio);
            if (kd !== 0) return kd;
            var k = safeNum(b.kills) - safeNum(a.kills);
            if (k !== 0) return k;
            var d = safeNum(a.deaths) - safeNum(b.deaths);
            if (d !== 0) return d;
            var na = (nameOf(a) || '').toLowerCase();
            var nb = (nameOf(b) || '').toLowerCase();
            if (na < nb) return -1;
            if (na > nb) return 1;
            return 0;
        };
    }

    /**
     * Modos de ordenacion de rankings (SOLO visualizacion; mismos datos).
     *  - 'score': KD ajustado Bayes C=3 (orden por defecto, identico al historico)
     *  - 'eff':   kills validas/efectivas desc (quien hizo mas kills aunque su KD sea menor)
     *  - 'games': partidas desc (actividad)
     *  - 'avg':   kills efectivas POR PARTIDA desc (consistencia, no volumen)
     * compareBy() SIEMPRE cierra con el desempate de 5 niveles como tiebreak
     * final, por lo que TODOS los modos son totales y deterministicos.
     */
    var SORT_MODES = [
        { id: 'score', label: 'KD ajustado' },
        { id: 'eff', label: 'Kills validas' },
        { id: 'games', label: 'Partidas' },
        { id: 'avg', label: 'Kills por partida' }
    ];

    var SORT_STORAGE_KEY = 'ah_ranking_sort';

    function isValidSortMode(id) {
        return SORT_MODES.some(function(m) { return m.id === id; });
    }

    function compareBy(modeId, acc) {
        var tiebreak = compareRankedPlayers(acc); // default 'score' + desempate final
        if (modeId === 'eff') {
            return function(a, b) {
                var k = safeNum(acc.eff(b)) - safeNum(acc.eff(a));
                return k !== 0 ? k : tiebreak(a, b);
            };
        }
        if (modeId === 'avg') {
            function avg(p) {
                var g = safeNum(acc.games(p));
                return g > 0 ? safeNum(acc.eff(p)) / g : 0;
            }
            return function(a, b) {
                var d = avg(b) - avg(a);
                return d !== 0 ? d : tiebreak(a, b);
            };
        }
        if (modeId === 'games') {
            return function(a, b) {
                var g = safeNum(acc.games(b)) - safeNum(acc.games(a));
                return g !== 0 ? g : tiebreak(a, b);
            };
        }
        return tiebreak; // 'score' y cualquier modo desconocido
    }

    function getSavedSortMode() {
        try {
            var v = (typeof localStorage !== 'undefined') ? localStorage.getItem(SORT_STORAGE_KEY) : null;
            return isValidSortMode(v) ? v : 'score';
        } catch(e) { return 'score'; }
    }

    function saveSortMode(id) {
        if (!isValidSortMode(id)) return;
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(SORT_STORAGE_KEY, id);
        } catch(e) {}
    }

    window.AHRankingScore = {
        BAYES_C: BAYES_C,
        fetchAllRows: fetchAllRows,
        makeBayesScorer: makeBayesScorer,
        compareRankedPlayers: compareRankedPlayers,
        compareMatchResults: compareMatchResults,
        SORT_MODES: SORT_MODES,
        compareBy: compareBy,
        isValidSortMode: isValidSortMode,
        getSavedSortMode: getSavedSortMode,
        saveSortMode: saveSortMode
    };
})();
