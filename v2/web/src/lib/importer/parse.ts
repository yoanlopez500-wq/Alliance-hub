import { slugifyHeader } from './text';

/**
 * Convierte un archivo (CSV / XLSX / XLS) en una matriz de celdas crudas.
 * Usa SheetJS en local (dependencia npm, sin CDN) y el primer sheet.
 */
export async function parseFileToMatrix(file: File): Promise<unknown[][]> {
  const name = (file.name || '').toLowerCase();
  const isCsv = name.endsWith('.csv') || file.type === 'text/csv';
  if (isCsv) {
    const text = await file.text();
    return parseCsvText(text);
  }
  if (!/\.(xlsx|xls)$/.test(name)) {
    throw new Error('Formato no soportado. Usa .csv, .xlsx o .xls');
  }
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El archivo no contiene ninguna hoja');
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

/** CSV simple con soporte de comillas (compatible con el exportador externo). */
export function parseCsvText(text: string): unknown[][] {
  const rows: unknown[][] = [];
  let row: unknown[] = [];
  let cur = '';
  let inQuotes = false;
  const pushCell = () => { row.push(cur); cur = ''; };
  const pushRow = () => { pushCell(); if (row.some((c) => String(c).trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') pushCell();
    else if (ch === '\n') pushRow();
    else if (ch === '\r') { /* ignorar */ }
    else cur += ch;
  }
  pushRow();
  return rows;
}

/** Columnas deducidas de una fila de cabecera (claves canonicas). */
export function headerKeys(matrix: unknown[][], headerRow: number): string[] {
  const row = matrix[headerRow] || [];
  return row.map((c) => slugifyHeader(String(c ?? '')));
}
