/**
 * rules.ts — Motor de reglas del Centro de Inteligencia.
 * TODAS las formulas de Supremacy 1914 viven aqui, versionadas.
 * Si el juego cambia una formula, se toca SOLO este archivo y
 * se sube RULES_VERSION.
 *
 * Fuentes verificadas (FAQ oficial + wiki + datos de usuario):
 *  - Produccion base: moral% x 24 + 750 (simple) / x 48 + 1500 (doble)
 *  - Railway +33%, Puerto +25%, Fabrica ~+8%/nivel
 *  - Upkeep: 2400/provincia/dia
 *  - Puntos VP base: (16 x moral/100) - 4 + mejoras/2 + 6 (si moral>98)
 *  - Reclutamiento: 32 x 2 / (moral x tipo x (2 + nivelCuartel)) horas
 *  - CUARTEL NVL2: +150% reclutamiento y +40 PV al spawn de
 *    infanteria/caballeria (tope: PV maximo de la unidad).
 *    NOTA: la FAQ oficial implicaba +100%; se parametriza y se marca
 *    VALIDACION_PENDIENTE para confirmar in-game.
 *  - Deriva de moral: 1 punto cada 7 dias hacia la media (35)
 *  - Riesgo de revuelta: 3% x (33 - moral) si moral < 33
 */

export const RULES_VERSION = '1.0';
export const RULES_NOTES: { id: string; text: string; pendiente?: boolean }[] = [
  {
    id: 'cuartel2-recruit',
    text: 'Cuartel nivel 2: +150% velocidad de reclutamiento (parametrizable). La FAQ oficial sugeria +100%.',
    pendiente: true,
  },
  {
    id: 'cuartel2-hp',
    text: 'Cuartel nivel 2: +40 PV al spawn de infanteria/caballeria, sin superar el PV maximo de la unidad.',
    pendiente: true,
  },
  {
    id: 'factory',
    text: 'Fabrica: ~+8% de produccion por nivel (aproximacion de la wiki).',
  },
  {
    id: 'vp',
    text: 'Puntos de victoria: (16 x moral/100) - 4 + mejoras/2 + 6 si moral > 98.',
  },
];

/** Bonus de reclutamiento del cuartel (1 = +100%). Nivel 2 = +150% segun usuario. */
export const CUARTEL_RECRUIT_BONUS: Record<number, number> = { 0: 0, 1: 1, 2: 1.5 };
/** PV extra que da el cuartel al spawnear infanteria/caballeria (tope al max). */
export const CUARTEL_HP_BONUS = 40;
/** PV base de infanteria/caballeria al spawn = moral de la provincia. */
export const MAX_SPAWN_HP = 100;
/** Upkeep por provincia y dia. */
export const UPKEEP_PER_PROVINCE = 2400;
/** Deriva de moral: puntos por dia hacia la media (35). */
export const MORALE_DRIFT_PER_DAY = 1 / 7;
export const MORALE_MEAN = 35;
/** Riesgo diario de revuelta con moral < 33: 3% x (33 - moral). */
export function revoltRiskPerDay(morale: number): number {
  if (morale >= 33) return 0;
  return 0.03 * (33 - morale);
}

export type ResourceKind =
  | 'grano' | 'madera' | 'hierro' | 'carbon' | 'aceite'
  | 'gas' | 'peces' | 'articulos de lujo' | 'ninguno';

export const RESOURCE_MULTIPLIER: Record<ResourceKind, number> = {
  grano: 1.0, madera: 1.0, hierro: 1.15, carbon: 1.1, aceite: 1.25,
  gas: 1.3, peces: 1.0, 'articulos de lujo': 1.2, ninguno: 0.8,
};

export type ProvinceInput = {
  name: string;
  ownerName?: string;
  /** 0-100. Obligatorio. */
  morale: number;
  isDouble: boolean;
  resource: ResourceKind;
  railway: boolean;
  harbor: boolean;
  factoryLevel: number; // 0-5
  barracksLevel: number; // 0-2
  /** Guarnicion estimada (unidades). undefined = desconocida (escenarios). */
  garrison?: number;
  fortress: boolean;
};

export type NationInput = {
  name: string;
  provinces: ProvinceInput[];
  /** Nivel 3 (desgaste): unidades por dia. */
  killsPerDay?: number;
  deathsPerDay?: number;
  /** Aliados activos que pueden ayudar a defender (0 por defecto). */
  allies?: number;
};

export type Scenario = 'optimista' | 'medio' | 'pesimista';

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

/** Produccion diaria de una provincia (en unidades genericas de recurso). */
export function productionPerDay(p: ProvinceInput): number {
  const base = (p.morale / 100) * (p.isDouble ? 48 : 24) + (p.isDouble ? 1500 : 750);
  const rail = p.railway ? 1.33 : 1;
  const harbor = p.harbor ? 1.25 : 1;
  const factory = 1 + 0.08 * Math.max(0, Math.min(5, p.factoryLevel));
  return Math.round(base * rail * harbor * factory);
}

/** Produccion neta de una nacion (produccion - upkeep). */
export function netProduction(n: NationInput): number {
  const gross = n.provinces.reduce((s, p) => s + productionPerDay(p), 0);
  return Math.round(gross - n.provinces.length * UPKEEP_PER_PROVINCE);
}

/** Puntos de victoria basicos de una provincia. */
export function vpBasicPoints(p: ProvinceInput): number {
  const upgrades = (p.railway ? 1 : 0) + (p.harbor ? 1 : 0) + p.factoryLevel + p.barracksLevel;
  return Math.max(0, 16 * (p.morale / 100) - 4 + upgrades / 2 + (p.morale > 98 ? 6 : 0));
}

export function nationVpPerDay(n: NationInput): number {
  return n.provinces.reduce((s, p) => s + vpBasicPoints(p), 0);
}

/** Horas para reclutar una unidad en una provincia. */
export function recruitTimeHours(p: ProvinceInput, unitTypeFactor = 1): number {
  const bonus = CUARTEL_RECRUIT_BONUS[p.barracksLevel] ?? 0;
  const denom = Math.max(1, p.morale) * unitTypeFactor * (2 + bonus);
  return (32 * 2) / denom;
}

/**
 * PV con los que spawnea una unidad de infanteria/caballeria en una provincia.
 * Base = moral de la provincia; cuartel nvl2 suma +40, nunca por encima del max.
 */
export function spawnHp(p: ProvinceInput): number {
  const base = Math.min(Math.max(0, p.morale), MAX_SPAWN_HP);
  const bonus = p.barracksLevel >= 2 ? CUARTEL_HP_BONUS : 0;
  return Math.min(MAX_SPAWN_HP, base + bonus);
}

/** Remplazo: unidades/dia que una nacion puede producir (capacidad de recuperacion). */
export function replacementPerDay(n: NationInput): number {
  if (!n.provinces.length) return 0;
  const avgRecruitH = n.provinces.reduce((s, p) => s + recruitTimeHours(p), 0) / n.provinces.length;
  if (avgRecruitH <= 0) return 0;
  return 24 / avgRecruitH;
}

// ---------------------------------------------------------------------------
// Indices
// ---------------------------------------------------------------------------

export type IndexLevel = 'bajo' | 'moderado' | 'alto' | 'critico';

export function indexLevel(v: number, low: number, high: number, crit: number): IndexLevel {
  if (v >= crit) return 'critico';
  if (v >= high) return 'alto';
  if (v >= low) return 'moderado';
  return 'bajo';
}

export const INDEX_LABEL: Record<IndexLevel, string> = {
  bajo: 'Bajo', moderado: 'Moderado', alto: 'Alto', critico: 'Critico',
};
export const INDEX_COLOR: Record<IndexLevel, string> = {
  bajo: '#81c784', moderado: '#ffd54f', alto: '#ff8f00', critico: '#ef5350',
};

/**
 * Indice de peligro de una nacion objetivo (0-10+):
 * capacidad de dano = kills/dia ajustados por su sostenibilidad.
 */
export function dangerIndex(n: NationInput): number {
  const kills = n.killsPerDay ?? 5; // desconocido: asuncion media-baja
  const repl = replacementPerDay(n);
  const deaths = n.deathsPerDay ?? kills; // si no hay dato, asume se desgasta igual
  const sustainability = repl > 0 ? Math.min(2, repl / Math.max(0.5, deaths)) : 1;
  const allies = 1 + 0.25 * (n.allies ?? 0);
  return Number((Math.log10(1 + kills) * 2.2 * sustainability * allies).toFixed(2));
}

/**
 * Indice de vulnerabilidad de una nacion (0-10+): provincias debiles,
 * riesgo de revuelta, moral baja y baja guarnicion la suben.
 */
export function vulnerabilityIndex(n: NationInput): number {
  if (!n.provinces.length) return 0;
  let acc = 0;
  for (const p of n.provinces) {
    let w = 0;
    if (p.morale < 33) w += (33 - p.morale) / 10 + revoltRiskPerDay(p.morale) * 10;
    else if (p.morale < 50) w += (50 - p.morale) / 25;
    if ((p.garrison ?? 0) < 5) w += 0.4;
    if (p.fortress) w -= 0.3;
    acc += Math.max(0, w);
  }
  return Number(((acc / n.provinces.length) * 3 + (n.deathsPerDay && n.killsPerDay ? Math.max(0, (n.deathsPerDay - n.killsPerDay) / 20) : 0)).toFixed(2));
}

/**
 * Indice de sostenibilidad propia (0-10): produccion neta + capacidad de
 * reemplazo frente a las perdidas. Alto = aguantas guerras largas.
 */
export function sustainabilityIndex(n: NationInput): number {
  const net = netProduction(n);
  const repl = replacementPerDay(n);
  const deaths = n.deathsPerDay ?? 0;
  const econ = Math.max(0, Math.min(5, net / 8000));
  const replScore = Math.max(0, Math.min(4, repl / 4));
  const wear = deaths > 0 ? Math.max(0, Math.min(3, (repl / Math.max(deaths, 0.1)) * 1.5)) : 1.5;
  return Number((econ + replScore + wear).toFixed(2));
}

/** Confianza del analisis: % de campos opcionales conocidos. */
export function confidenceScore(input: {
  nations: NationInput[];
  killsKnown: boolean;
}): number {
  const ns = input.nations;
  if (!ns.length) return 0;
  let total = 0; let known = 0;
  for (const n of ns) {
    total += 3; known += n.killsPerDay !== undefined ? 1 : 0;
    known += n.deathsPerDay !== undefined ? 1 : 0; known += n.allies !== undefined ? 1 : 0;
    for (const p of n.provinces) {
      total += 2;
      if (p.garrison !== undefined) known += 1;
      if (p.resource !== 'ninguno') known += 1;
    }
  }
  if (total === 0) return 100;
  return Math.round((known / total) * 100);
}

// ---------------------------------------------------------------------------
// Motor de decision (Fase 3)
// ---------------------------------------------------------------------------

export type TargetEvaluation = {
  nation: string;
  province: string;
  score: number;
  valor: number;
  costo: number;
  riesgo: number;
  escenario: Scenario;
  reasons: string[];
  warnings: string[];
};

const SCENARIO_GARRISON: Record<Scenario, number> = { optimista: 2, medio: 6, pesimista: 12 };

export function evaluateTargets(
  targets: NationInput[], scenario: Scenario, myDanger: number,
): TargetEvaluation[] {
  const out: TargetEvaluation[] = [];
  for (const n of targets) {
    const danger = dangerIndex(n);
    const repl = replacementPerDay(n);
    for (const p of n.provinces) {
      const reasons: string[] = [];
      const warnings: string[] = [];
      // VALOR: produccion + VP + doble + recurso
      const prod = productionPerDay(p);
      const vp = vpBasicPoints(p);
      const valor = prod / 500 + vp * 2 + (p.isDouble ? 6 : 0) * (RESOURCE_MULTIPLIER[p.resource] ?? 1);
      reasons.push(`Produccion ~${prod.toLocaleString()}/dia`);
      reasons.push(`${vp.toFixed(1)} VP base${p.isDouble ? ' (doble)' : ''}`);
      // COSTO: guarnicion (escenario si desconocida), fortaleza, moral defensiva,
      // PV extra del cuartel nvl2
      const gar = p.garrison ?? SCENARIO_GARRISON[scenario];
      if (p.garrison === undefined) {
        warnings.push(`Guarnicion desconocida: asumiendo ${gar} (${scenario})`);
      }
      let costo = gar * 1.5 + (p.fortress ? 8 : 0);
      const hp = spawnHp(p);
      if (p.barracksLevel >= 2) {
        costo += 4;
        warnings.push(`Cuartel nvl2: defensores spawnearan con ${hp} PV (moral ${p.morale}+40)`);
      }
      costo += Math.max(0, (hp - 50) / 10);
      if (p.morale < 33) {
        costo -= 2;
        reasons.push(`Moral baja (${p.morale}%): la provincia se desmorona sola`);
        const rr = revoltRiskPerDay(p.morale);
        if (rr > 0.25) warnings.push(`Riesgo de revuelta ${(rr * 100).toFixed(0)}%/dia: podria rebelarse antes de que llegues`);
      }
      costo = Math.max(1, costo);
      // RIESGO: capacidad de respuesta del dueño
      const riesgo = 1 + danger * 0.4 + (repl > gar * 2 ? 1.2 : 0) + myDanger * 0.1;
      if (repl > gar * 2) warnings.push(`${n.name} reemplaza ~${repl.toFixed(1)} und/dia: podra reconquistar rapido`);
      const score = Number((valor / (costo * riesgo)).toFixed(2));
      out.push({ nation: n.name, province: p.name, score, valor: Number(valor.toFixed(2)), costo: Number(costo.toFixed(2)), riesgo: Number(riesgo.toFixed(2)), escenario: scenario, reasons, warnings });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Provincias propias mas vulnerables (espejo del motor de decision). */
export function ownWeakPoints(n: NationInput): { province: string; risk: string; tip: string }[] {
  const weak = n.provinces
    .filter((p) => p.morale < 45 || (p.garrison ?? 0) < 5)
    .map((p) => {
      const tips: string[] = [];
      if (p.morale < 33) tips.push(`compra bienes (sube moral ~2/dia) o dejala: revuelta ${(revoltRiskPerDay(p.morale) * 100).toFixed(0)}%/dia`);
      if ((p.garrison ?? 0) < 5) tips.push('refuerza guarnicion');
      if (p.morale < 50 && p.morale >= 33) tips.push(`moral ${p.morale}%: llegara a 50 en ~${Math.ceil((50 - p.morale) / MORALE_DRIFT_PER_DAY)} dias por deriva`);
      return {
        province: p.name,
        risk: p.morale < 33 ? 'critico' : p.morale < 40 ? 'alto' : 'moderado',
        tip: tips.join('; ') || 'vigilar',
      };
    });
  return weak;
}

export function emptyProvince(name = ''): ProvinceInput {
  return {
    name, morale: 60, isDouble: false, resource: 'ninguno',
    railway: false, harbor: false, factoryLevel: 0, barracksLevel: 0,
    garrison: undefined, fortress: false,
  };
}
