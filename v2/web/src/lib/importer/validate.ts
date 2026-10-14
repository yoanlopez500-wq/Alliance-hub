import { parseIntCell, parseNumberCell } from './text';
import type { ColumnMapping, ImportField } from './mapping';

export type RowStatus =
  | 'ok'              // listo para importar
  | 'unknown_id'      // player_id no existe en la tabla players
  | 'duplicate'       // player_id repetido (se conserva la primera aparicion)
  | 'invalid_numbers' // kills/deaths no numericos o ausentes
  | 'empty';          // fila sin player_id

export interface ValidatedRow {
  rowIndex: number; // indice dentro de la matriz original (para mostrar contexto)
  player_id: number | null;
  kills: number | null;
  deaths: number | null;
  nation: string | null;
  match_id: string | null;
  status: RowStatus;
  warning: string | null; // resolucion por nombre (aproximada)
}

export interface ValidationSummary {
  rows: ValidatedRow[];
  total: number;
  ok: number;
  unknown_id: number;
  duplicate: number;
  invalid_numbers: number;
  empty: number;
}

/** kd_ratio con la misma formula que el importador existente: deaths>0 ? k/d : k. */
export function computeKd(kills: number, deaths: number): number {
  return parseFloat((deaths > 0 ? kills / deaths : kills).toFixed(2));
}

/**
 * Fase pura: aplica el mapeo y normaliza numeros. La existencia de player_id
 * se resuelve despues con checkPlayerExistence (batch contra Supabase).
 */
export function buildRows(matrix: unknown[][], headerRow: number, mapping: ColumnMapping): ValidatedRow[] {
  const rows: ValidatedRow[] = [];
  const cell = (r: unknown[], f: ImportField): unknown =>
    mapping[f] != null ? r[mapping[f]!] : undefined;

  for (let i = headerRow + 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const pid = parseIntCell(cell(r, 'player_id'));
    const kills = parseNumberCell(cell(r, 'kills'));
    const deaths = parseNumberCell(cell(r, 'deaths'));
    const nationRaw = mapping.nation != null ? String(cell(r, 'nation') ?? '').trim() : '';
    const matchRaw = mapping.match_id != null ? String(cell(r, 'match_id') ?? '').trim() : '';

    if (pid == null) {
      // fila completamente vacia: la ignoramos sin contar como problema
      if (!r.some((c) => String(c ?? '').trim() !== '')) continue;
      rows.push({ rowIndex: i, player_id: null, kills, deaths, nation: nationRaw || null, match_id: matchRaw || null, status: 'empty', warning: null });
      continue;
    }
    let status: RowStatus = 'ok';
    if (kills == null || deaths == null) status = 'invalid_numbers';
    rows.push({
      rowIndex: i,
      player_id: pid,
      kills: kills == null ? null : Math.round(kills),
      deaths: deaths == null ? null : Math.round(deaths),
      nation: nationRaw || null,
      match_id: matchRaw || null,
      status,
      warning: null,
    });
  }

  // Deduplicado: gana la primera aparicion valida (numeros correctos).
  const seen = new Set<number>();
  for (const row of rows) {
    if (row.player_id == null || row.status === 'invalid_numbers') continue;
    if (seen.has(row.player_id)) row.status = 'duplicate';
    else seen.add(row.player_id);
  }
  return rows;
}

/** Marca unknown_id contra el set de ids existentes. `ids` = set de players.id (bigint). */
export function applyExistence(rows: ValidatedRow[], existingIds: Set<number>): void {
  for (const row of rows) {
    if (row.player_id == null) continue;
    if (row.status !== 'ok' && row.status !== 'duplicate') continue;
    if (!existingIds.has(row.player_id)) row.status = 'unknown_id';
  }
}

export function summarize(rows: ValidatedRow[]): ValidationSummary {
  const s: ValidationSummary = { rows, total: rows.length, ok: 0, unknown_id: 0, duplicate: 0, invalid_numbers: 0, empty: 0 };
  for (const r of rows) s[r.status]++;
  return s;
}

/** Filas realmente importables (duplicados se omiten, el primero ya cubre al jugador). */
export function importableRows(rows: ValidatedRow[]): ValidatedRow[] {
  return rows.filter((r) => r.status === 'ok' && r.player_id != null && r.kills != null && r.deaths != null);
}
