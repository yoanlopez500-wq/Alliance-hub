import { slugifyHeader } from './text';

export type ImportField = 'player_id' | 'kills' | 'deaths' | 'nation' | 'match_id';

export interface TargetField {
  key: ImportField;
  label: string;
  required: boolean;
}

/** Campos objetivo del importador. match_id solo se ofrece cuando el contexto lo permite. */
export function targetFields(allowMatchIdColumn: boolean): TargetField[] {
  const fields: TargetField[] = [
    { key: 'player_id', label: 'ID de jugador (UID)', required: true },
    { key: 'kills', label: 'Bajas (kills)', required: true },
    { key: 'deaths', label: 'Muertes (deaths)', required: true },
    { key: 'nation', label: 'País / nación', required: false },
  ];
  if (allowMatchIdColumn) fields.push({ key: 'match_id', label: 'ID de partida', required: false });
  return fields;
}

const ALIAS_MAP: Record<ImportField, string[]> = {
  player_id: [
    'player_id', 'playerid', 'player', 'uid', 'id', 'jugador', 'jugador_id', 'jugadorid',
    'player_id_supremacy', 'supremacy_id', 'userid', 'user_id', 'member_id',
  ],
  kills: [
    'kills', 'kill', 'bajas', 'baja', 'eliminaciones', 'units_killed', 'destruidas',
    'unidades_eliminadas', 'muertes_enemigas', 'k',
  ],
  deaths: [
    'deaths', 'death', 'muertes', 'muerte', 'perdidas', 'units_lost', 'perdido',
    'unidades_perdidas', 'd',
  ],
  nation: ['nation', 'nacion', 'pais', 'country', 'país', 'nacionalidad'],
  match_id: ['match_id', 'matchid', 'partida', 'partida_id', 'game', 'game_id', 'gameid', 'match'],
};

/** Set plano de todos los alias conocidos (lo usa analyze.ts para puntuar cabeceras). */
export const KNOWN_ALIASES: Set<string> = new Set(
  Object.values(ALIAS_MAP).flat().map((a) => slugifyHeader(a)),
);

export type ColumnMapping = Partial<Record<ImportField, number>>; // campo -> indice de columna

/**
 * Sugiere un mapeo columna->campo a partir de las claves canonicas de la cabecera.
 * Una columna solo se asigna a un campo; los campos sin columna quedan sin mapear
 * (nunca se inventa: sin mapeo no hay importacion de ese campo).
 */
export function suggestMapping(headerKeys: string[], allowMatchIdColumn: boolean): ColumnMapping {
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  const fields = targetFields(allowMatchIdColumn);
  // Primero pasada exacta, luego prefijo/contiene para cabeceras compuestas.
  for (const pass of [0, 1] as const) {
    for (const f of fields) {
      if (mapping[f.key] != null) continue;
      for (let i = 0; i < headerKeys.length; i++) {
        if (used.has(i)) continue;
        const slug = headerKeys[i];
        if (!slug) continue;
        const aliases = ALIAS_MAP[f.key].map((a) => slugifyHeader(a));
        const hit = pass === 0
          ? aliases.includes(slug)
          : aliases.some((a) => slug === a || slug.startsWith(a + '_') || slug.endsWith('_' + a) || slug.includes('_' + a + '_'));
        if (hit) { mapping[f.key] = i; used.add(i); break; }
      }
    }
  }
  return mapping;
}

/** Firma estable de una cabecera para recordar mapeos en localStorage. */
export function headerSignature(headerKeys: string[]): string {
  return headerKeys.join('|');
}

const LS_PREFIX = 'ah2_import_mapping:';

export function loadRememberedMapping(signature: string, allowMatchIdColumn: boolean): ColumnMapping | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + signature);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, number>;
    const mapping: ColumnMapping = {};
    for (const f of targetFields(allowMatchIdColumn)) {
      const v = obj[f.key];
      if (typeof v === 'number' && v >= 0) mapping[f.key] = v;
    }
    return mapping;
  } catch {
    return null;
  }
}

export function saveRememberedMapping(signature: string, mapping: ColumnMapping): void {
  try { localStorage.setItem(LS_PREFIX + signature, JSON.stringify(mapping)); } catch { /* noop */ }
}
