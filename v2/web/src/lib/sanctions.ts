/**
 * sanctions.ts — Puente de sanciones/strikes del v1 (puerto TS de base.js + modules/sanctions.js).
 * Misma logica: kills efectivas con penalizacion por strikes, nullificacion,
 * resumen de bans/suspensiones y consentimiento de reglas (localStorage + djb2).
 */

export interface StrikeTypeInfo {
  id: string; name: string; legend: string | null; severity: string | null;
  nullifies_kills: boolean | null; is_ban: boolean | null; ban_duration_hours: number | null;
}

export interface StrikeRow {
  player_id: number;
  strike_type_id: string | null;
  status?: string;
  is_active?: boolean;
  expires_at?: string | null;
  legend?: string | null;
  strike_types?: StrikeTypeInfo | null;
}

export interface StrikeFormula {
  penalty_pct: number;
  nullifies_kills: boolean;
  is_ban: boolean;
  ban_duration_hours: number | null;
  rule_section_id: string | null;
}

export function parseStrikeFormulaLegend(legend: string | null | undefined): StrikeFormula {
  if (!legend) return { penalty_pct: 0, nullifies_kills: false, is_ban: false, ban_duration_hours: null, rule_section_id: null };
  try {
    const parsed = JSON.parse(legend);
    return {
      penalty_pct: parseFloat(parsed.penalty_pct) || 0,
      nullifies_kills: !!parsed.nullifies_kills,
      is_ban: !!parsed.is_ban,
      ban_duration_hours: parsed.ban_duration_hours || null,
      rule_section_id: parsed.rule_section_id || null,
    };
  } catch {
    const penaltyMatch = legend.match(/(\d+)%/);
    return {
      penalty_pct: penaltyMatch ? parseInt(penaltyMatch[1]) : 0,
      nullifies_kills: /nullif/i.test(legend),
      is_ban: /ban/i.test(legend),
      ban_duration_hours: null,
      rule_section_id: null,
    };
  }
}

export function computeEffectiveKills(totalKills: number, strikes: StrikeRow[] | null | undefined, nullifiedKills: number) {
  totalKills = totalKills || 0;
  nullifiedKills = nullifiedKills || 0;
  const killsWN = Math.max(0, totalKills - nullifiedKills);
  if (!strikes || strikes.length === 0) return { effKills: killsWN, penaltyPct: 0, nullified: nullifiedKills };

  let maxPenalty = 0;
  let hasNullifier = false;
  strikes.forEach((s) => {
    const formula = parseStrikeFormulaLegend(s.legend ?? s.strike_types?.legend);
    if (formula.nullifies_kills) hasNullifier = true;
    if (formula.penalty_pct > maxPenalty) maxPenalty = formula.penalty_pct;
  });

  if (hasNullifier) return { effKills: 0, penaltyPct: 100, nullified: nullifiedKills };
  return { effKills: Math.round(killsWN * (1 - maxPenalty / 100)), penaltyPct: maxPenalty, nullified: nullifiedKills };
}

// ---- Jugador: ban/suspension (players.status) ----

export interface PlayerSanctionState {
  status?: string | null;
  banned_until?: string | null;
  suspended_until?: string | null;
  suspension_reason?: string | null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

export function isPlayerSanctioned(player: PlayerSanctionState | null | undefined): boolean {
  if (!player) return false;
  const now = new Date();
  if (player.status === 'banned') {
    if (!player.banned_until) return true;
    const until = parseDate(player.banned_until);
    return until ? until > now : true;
  }
  if (player.status === 'suspended') {
    if (!player.suspended_until) return true;
    const until = parseDate(player.suspended_until);
    return until ? until > now : true;
  }
  return false;
}

export function getRemainingText(untilIso: string | null | undefined): string {
  if (!untilIso) return 'permanente';
  const d = parseDate(untilIso);
  if (!d) return 'desconocido';
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return 'expirado';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days} dia(s) y ${hours} hora(s)`;
  if (hours > 0) return `${hours} hora(s) y ${minutes} minuto(s)`;
  return `${minutes} minuto(s)`;
}

export interface SanctionSummary {
  isSanctioned: boolean;
  type: 'banned' | 'suspended' | null;
  remainingText: string;
  reason: string;
}

export function getSanctionSummary(player: PlayerSanctionState | null | undefined): SanctionSummary {
  if (!player) return { isSanctioned: false, type: null, remainingText: '', reason: '' };
  if (player.status === 'banned') {
    return {
      isSanctioned: true, type: 'banned',
      remainingText: getRemainingText(player.banned_until),
      reason: player.suspension_reason || 'Cuenta baneada',
    };
  }
  if (player.status === 'suspended') {
    if (!player.suspended_until) {
      return { isSanctioned: true, type: 'suspended', remainingText: 'permanente', reason: player.suspension_reason || 'Cuenta suspendida' };
    }
    const until = parseDate(player.suspended_until);
    if (!until || until > new Date()) {
      return {
        isSanctioned: true, type: 'suspended',
        remainingText: until ? getRemainingText(player.suspended_until) : 'permanente',
        reason: player.suspension_reason || 'Cuenta suspendida',
      };
    }
  }
  return { isSanctioned: false, type: null, remainingText: '', reason: '' };
}

// ---- Consentimiento de reglas (mismo formato que rule-gate.js) ----

const STORAGE_KEY_PREFIX = 'ah_rule_consent_';
const CONSENT_SALT = 'AH_RULES_2026';

function consentKey(playerId: number | string, matchId: string) {
  return `${STORAGE_KEY_PREFIX}${playerId}_${matchId}`;
}

function consentHash(playerId: number | string, matchId: string): string {
  const str = `${CONSENT_SALT}|${playerId}|${matchId}`;
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}

export function hasRuleConsent(playerId: number | string, matchId: string): boolean {
  try {
    return localStorage.getItem(consentKey(playerId, matchId)) === `accepted:${consentHash(playerId, matchId)}`;
  } catch { return false; }
}

export function setRuleConsent(playerId: number | string, matchId: string) {
  try {
    localStorage.setItem(consentKey(playerId, matchId), `accepted:${consentHash(playerId, matchId)}`);
  } catch { /* noop */ }
}

// ---- Join cliente strikes -> strike_types (la BD no tiene FK, PGRST200) ----

let strikeTypesCache: Map<number, any> | null = null;

/** Devuelve la lista de strikes con su tipo adjunto como `strike_types`. */
export async function attachStrikeTypes<T extends { strike_type_id?: number | null }>(
  rows: T[],
  fetchTypes: () => PromiseLike<any[]>
): Promise<(T & { strike_types?: any })[]> {
  if (!strikeTypesCache) {
    strikeTypesCache = new Map();
    try {
      (await fetchTypes()).forEach((t: any) => strikeTypesCache!.set(t.id, t));
    } catch { /* sin tipos, formulas vacias */ }
  }
  return rows.map((r) => ({ ...r, strike_types: r.strike_type_id ? strikeTypesCache!.get(r.strike_type_id) : undefined }));
}
