/** Utilidades de texto compartidas por los importadores (API externa y asistente). */

/** Clave canonica de una columna/cabecera: sin acentos/simbolos, snake_case. */
export function slugifyHeader(h: string): string {
  return h.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/["'()]/g, '').replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

}

/** "12/3 (nota)" -> captura 12 y 3. Acepta separador / o |. */
export const KD_REGEX = /^(\d+)\s*[/|]\s*(\d+)(?:\s*\(.*\))?$/;

/** Parsea un numero entero desde una celda (acepta numeros y texto). */
export function parseIntCell(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  const n = parseInt(String(v).trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/** Igual que parseIntCell pero tolera decimales redondeando. */
export function parseNumberCell(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}
