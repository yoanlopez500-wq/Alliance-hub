/**
 * ranking.ts — Motor de ordenamiento de rankings (puerto TS de ranking-score.js v1).
 * Mismos criterios aprobados: score Bayesiano C=3, desempates deterministas,
 * AH Power Score y modos de ordenacion persistidos en localStorage.
 */

export const BAYES_C = 3;

function safeNum(v: unknown): number {
  return (typeof v === 'number' && isFinite(v)) ? v : 0;
}

/** Paginador PostgREST: garantiza la poblacion completa aunque supere el limite del servidor. */
export async function fetchAllRows<T>(
  queryFn: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  hardCap = 50000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const res = await queryFn(from, from + pageSize - 1);
    if (res.error) throw res.error;
    const rows = res.data || [];
    out.push(...rows);
    if (rows.length < pageSize || out.length >= hardCap) break;
  }
  return out;
}

export interface BayesAcc<P> {
  eff(p: P): number;
  deaths(p: P): number;
  games(p: P): number;
}

export function makeBayesScorer<P>(players: P[], acc: BayesAcc<P>) {
  let sumK = 0, sumD = 0, sumG = 0;
  players.forEach((p) => {
    sumK += safeNum(acc.eff(p));
    sumD += safeNum(acc.deaths(p));
    sumG += safeNum(acc.games(p));
  });
  const priorK = sumG > 0 ? sumK / sumG : 0;
  const priorD = sumG > 0 ? sumD / sumG : 0;
  return {
    priorK, priorD, C: BAYES_C,
    score(p: P): number {
      let denom = safeNum(acc.deaths(p)) + BAYES_C * priorD;
      if (denom <= 0) denom = 1;
      return (safeNum(acc.eff(p)) + BAYES_C * priorK) / denom;
    },
  };
}

export interface RankAcc<P> extends BayesAcc<P> {
  score(p: P): number;
  name(p: P): string;
}

/** Desempate determinista de 5 niveles para rankings de jugadores. */
export function compareRankedPlayers<P>(acc: RankAcc<P>) {
  return (a: P, b: P): number => {
    let s = acc.score(b) - acc.score(a);
    if (isNaN(s)) s = 0;
    if (s !== 0) return s;
    let g = safeNum(acc.games(b)) - safeNum(acc.games(a));
    if (g !== 0) return g;
    let d = safeNum(acc.deaths(a)) - safeNum(acc.deaths(b));
    if (d !== 0) return d;
    let k = safeNum(acc.eff(b)) - safeNum(acc.eff(a));
    if (k !== 0) return k;
    const na = (acc.name(a) || '').toLowerCase();
    const nb = (acc.name(b) || '').toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  };
}

/** Desempate para resultados de una partida: kd -> kills -> muertes -> alfabetico. */
export function compareMatchResults<T extends { kd_ratio?: number; kills?: number; deaths?: number }>(
  nameOf: (row: T) => string,
) {
  return (a: T, b: T): number => {
    let kd = safeNum(b.kd_ratio) - safeNum(a.kd_ratio);
    if (kd !== 0) return kd;
    let k = safeNum(b.kills) - safeNum(a.kills);
    if (k !== 0) return k;
    let d = safeNum(a.deaths) - safeNum(b.deaths);
    if (d !== 0) return d;
    const na = (nameOf(a) || '').toLowerCase();
    const nb = (nameOf(b) || '').toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  };
}

export const SORT_MODES = [
  {
    id: 'score',
    label: 'KD ajustado',
    explain: 'Ordena por K/D bayesiano con C=3: mezcla tu K/D real con el promedio global segun cuantas partidas validas tienes. Asi un jugador con pocas partidas no debe por encima de uno consistente.',
    example: 'Formula: (bajas efectivas + 3 x priorK) / (muertes + 3 x priorD). Si priorK=12.3 y priorD=9.8, un jugador con 100 bajas y 50 muertes puntua (100 + 36.9) / (50 + 29.4).',
  },
  {
    id: 'power',
    label: 'AH Power Score',
    explain: 'Prioriza volumen con eficiencia: multiplica las bajas efectivas por la raiz cuadrada del K/D. Premia a quien hace muchas bajas manteniendo buen intercambio.',
    example: 'Formula: bajas efectivas x sqrt(K/D). 200 bajas con K/D 2.0 puntuan 200 x 1.414 = 282.8.',
  },
  {
    id: 'eff',
    label: 'Kills validas',
    explain: 'Ordena por bajas efectivas: bajas registradas en partidas validas, descontando bajas anuladas y penalizaciones por strikes o sanciones activas.',
    example: 'Si un jugador tiene 120 bajas, 10 anuladas y una penalizacion del 25%, sus bajas validas quedan en 82.',
  },
  {
    id: 'games',
    label: 'Partidas',
    explain: 'Ordena por cantidad de partidas validas jugadas. Es un ranking de participacion, no de eficiencia.',
    example: 'Un jugador con 40 partidas validas va antes que uno con 39, aunque el segundo tenga mejor K/D.',
  },
  {
    id: 'avg',
    label: 'Kills por partida',
    explain: 'Ordena por bajas efectivas divididas entre partidas validas. Mide produccion media por partida.',
    example: 'Formula: bajas efectivas / partidas validas. 180 bajas efectivas en 30 partidas = 6.0 por partida.',
  },
] as const;

export type SortMode = (typeof SORT_MODES)[number]['id'];

export function sortModeById(id: string | null | undefined) {
  return SORT_MODES.find((m) => m.id === id) ?? null;
}

export function powerScore<P>(acc: BayesAcc<P>, p: P): number {
  const k = safeNum(acc.eff(p));
  const d = safeNum(acc.deaths(p));
  const kd = d > 0 ? k / d : k;
  return k * Math.sqrt(kd);
}

const SORT_STORAGE_KEY = 'ah_ranking_sort';

export function isValidSortMode(id: string | null): id is SortMode {
  return SORT_MODES.some((m) => m.id === id);
}

export function compareBy<P>(modeId: string, acc: RankAcc<P>) {
  const tiebreak = compareRankedPlayers(acc);
  if (modeId === 'eff') {
    return (a: P, b: P) => {
      const k = safeNum(acc.eff(b)) - safeNum(acc.eff(a));
      return k !== 0 ? k : tiebreak(a, b);
    };
  }
  if (modeId === 'avg') {
    const avg = (p: P) => {
      const g = safeNum(acc.games(p));
      return g > 0 ? safeNum(acc.eff(p)) / g : 0;
    };
    return (a: P, b: P) => {
      const d = avg(b) - avg(a);
      return d !== 0 ? d : tiebreak(a, b);
    };
  }
  if (modeId === 'power') {
    return (a: P, b: P) => {
      let s = powerScore(acc, b) - powerScore(acc, a);
      if (isNaN(s)) s = 0;
      return s !== 0 ? s : tiebreak(a, b);
    };
  }
  if (modeId === 'games') {
    return (a: P, b: P) => {
      const g = safeNum(acc.games(b)) - safeNum(acc.games(a));
      return g !== 0 ? g : tiebreak(a, b);
    };
  }
  return tiebreak;
}

export function getSavedSortMode(): SortMode {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    return isValidSortMode(v) ? v : 'score';
  } catch { return 'score'; }
}

export function saveSortMode(id: string) {
  if (!isValidSortMode(id)) return;
  try { localStorage.setItem(SORT_STORAGE_KEY, id); } catch { /* noop */ }
}
