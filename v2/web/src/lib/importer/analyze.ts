import { slugifyHeader, parseIntCell } from './text';
import { KNOWN_ALIASES } from './mapping';

export interface MatrixAnalysis {
  suggestedHeaderRow: number; // -1 si no parece haber cabecera
  columns: string[]; // claves canonicas por columna (vacias si no hay cabecera)
}

const MAX_HEADER_SCAN = 15;

/**
 * Decide cual fila es la cabecera. Puntuacion por fila:
 * +2 por celda que coincide con un alias conocido de campo,
 * +1 por celda no numerica (probable nombre de columna),
 * -3 por fila vacia o totalmente numerica.
 * Devuelve -1 si la mejor puntuacion es 0 (no hay cabecera clara).
 */
export function detectHeaderRow(matrix: unknown[][]): number {
  let best = -1;
  let bestScore = 0;
  for (let r = 0; r < Math.min(matrix.length, MAX_HEADER_SCAN); r++) {
    const row = matrix[r] || [];
    if (!row.length) continue;
    let score = 0;
    let nonEmpty = 0;
    for (const cell of row) {
      const s = String(cell ?? '').trim();
      if (!s) continue;
      nonEmpty++;
      const slug = slugifyHeader(s);
      if (slug && KNOWN_ALIASES.has(slug)) score += 2;
      else if (parseIntCell(cell) == null) score += 1;
      else score -= 1; // numero crudo en posible cabecera
    }
    if (nonEmpty === 0) continue;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore > 0 ? best : -1;
}

/** Construye las etiquetas de columna a partir de la fila de cabecera elegida. */
export function buildColumns(matrix: unknown[][], headerRow: number): string[] {
  const width = Math.max(...matrix.map((r) => (r || []).length), 0);
  if (headerRow < 0) return Array.from({ length: width }, (_, i) => `Columna ${i + 1}`);
  const row = matrix[headerRow] || [];
  return Array.from({ length: width }, (_, i) => {
    const raw = String(row[i] ?? '').trim();
    const slug = raw ? slugifyHeader(raw) : '';
    return slug || `Columna ${i + 1}`;
  });
}
