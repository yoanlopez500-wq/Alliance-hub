/**
 * parse.ts — Lectura de archivos del Centro de Inteligencia (Fase 2).
 * Soporta .xlsx (SheetJS), .csv y .txt pegado o subido. Todo ocurre en
 * el navegador: nada sale de tu equipo.
 *
 * Formatos reconocidos (heuristica por cabeceras):
 *  - /excel countries de Manolo: userID, username, victorypoints, kills,
 *    deaths, provinceswon, provinceslost, morale, ...
 *  - Exportaciones genericas de provincias: name/province, morale, double, ...
 *  - TSV/CSV pegado desde el portapapeles.
 */

import * as XLSX from 'xlsx';
import type { NationInput, ProvinceInput } from './rules';
import { emptyProvince } from './rules';

export type ParsedNation = {
  name: string;
  killsPerDay?: number;
  deathsPerDay?: number;
  provinces: ProvinceInput[];
  recognized: number;
};

export type ParseResult = {
  ok: boolean;
  error?: string;
  nations: ParsedNation[];
  /** Filas que no se pudieron mapear (para debug del usuario). */
  skipped: number;
};

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Mapeo de cabeceras conocidas a campos. */
const HEADER_MAP: Record<string, string> = {
  username: 'name', user: 'name', jugador: 'name', player: 'name', nation: 'name',
  kills: 'kills', bajas: 'kills', muertes: 'deaths', deaths: 'deaths',
  victorypoints: 'vp', 'victory points': 'vp', vp: 'vp',
  morale: 'morale', moral: 'morale',
  province: 'province', provincia: 'province', name: 'province',
  double: 'double', doble: 'double',
  resource: 'resource', recurso: 'resource',
  railway: 'railway', ferrocarril: 'railway',
  harbor: 'harbor', puerto: 'harbor',
  factory: 'factory', fabrica: 'factory',
  barracks: 'barracks', cuartel: 'barracks',
  garrison: 'garrison', guarnicion: 'garrison',
  fortress: 'fortress', fortaleza: 'fortress',
};

const TRUE_WORDS = new Set(['1', 'true', 'si', 'sí', 'yes', 'x', 'doble', 'double']);

/**
 * Analiza una matriz de filas (la primera fila con >=2 celdas de texto
 * conocidas se toma como cabecera) y devuelve las naciones encontradas.
 */
export function parseRows(rows: unknown[][]): ParseResult {
  const clean = rows.filter((r) => r && r.some((c) => String(c ?? '').trim() !== ''));
  if (clean.length < 2) return { ok: false, error: 'El archivo no tiene filas de datos.', nations: [], skipped: 0 };

  // Buscar fila de cabecera: la primera con al menos 2 coincidencias
  let headerIdx = -1;
  let headerMap: string[] = [];
  for (let i = 0; i < Math.min(clean.length, 10); i++) {
    const mapped = clean[i].map((c) => HEADER_MAP[norm(c)] ?? '');
    const hits = mapped.filter(Boolean).length;
    if (hits >= 2) { headerIdx = i; headerMap = mapped; break; }
  }
  if (headerIdx === -1) {
    return {
      ok: false,
      error: 'No reconoci columnas (se esperaban cabeceras como username, kills, deaths, morale, province...).',
      nations: [], skipped: clean.length,
    };
  }

  const nations = new Map<string, ParsedNation>();
  let skipped = 0;
  for (let i = headerIdx + 1; i < clean.length; i++) {
    const row = clean[i];
    const rec: Record<string, unknown> = {};
    let any = false;
    headerMap.forEach((field, j) => {
      if (!field) return;
      rec[field] = row[j];
      if (row[j] !== undefined && String(row[j]).trim() !== '') any = true;
    });
    if (!any) { skipped++; continue; }
    if (rec.province !== undefined && !rec.name) rec.name = '(provincia sin dueno)';

    const nationName = String(rec.name ?? '').trim() || 'Sin nombre';
    if (!nations.has(nationName)) nations.set(nationName, { name: nationName, provinces: [], recognized: 0 });

    const nat = nations.get(nationName)!;
    if (rec.kills !== undefined) { const v = num(rec.kills); if (v !== undefined) nat.killsPerDay = v; }
    if (rec.deaths !== undefined) { const v = num(rec.deaths); if (v !== undefined) nat.deathsPerDay = v; }

    if (rec.province !== undefined && String(rec.province).trim() !== '') {
      const p = emptyProvince(String(rec.province).trim());
      const m = num(rec.morale);
      if (m !== undefined) { p.morale = Math.max(0, Math.min(100, m)); nat.recognized++; }
      if (rec.double !== undefined) p.isDouble = TRUE_WORDS.has(norm(rec.double));
      const res = norm(rec.resource) as ProvinceInput['resource'];
      if (res && res in { grano: 1, madera: 1, hierro: 1, carbon: 1, aceite: 1, gas: 1, peces: 1 }) {
        p.resource = res as ProvinceInput['resource'];
        nat.recognized++;
      }
      if (rec.railway !== undefined) p.railway = TRUE_WORDS.has(norm(rec.railway));
      if (rec.harbor !== undefined) p.harbor = TRUE_WORDS.has(norm(rec.harbor));
      const f = num(rec.factory); if (f !== undefined) p.factoryLevel = Math.max(0, Math.min(5, Math.round(f)));
      const b = num(rec.barracks); if (b !== undefined) p.barracksLevel = Math.max(0, Math.min(2, Math.round(b)));
      const g = num(rec.garrison); if (g !== undefined) { p.garrison = g; nat.recognized++; }
      if (rec.fortress !== undefined) p.fortress = TRUE_WORDS.has(norm(rec.fortress));
      nat.provinces.push(p);
    } else {
      nat.recognized++;
    }
  }
  if (!nations.size) return { ok: false, error: 'Cabecera encontrada pero sin filas de datos.', nations: [], skipped };
  return { ok: true, nations: [...nations.values()], skipped };
}

/** CSV/TSV/txt pegado: divide por lineas y detecta separador. */
export function parseDelimitedText(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return { ok: false, error: 'Texto vacio.', nations: [], skipped: 0 };
  const first = lines[0];
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';
  const rows = lines.map((l) => splitRow(l, sep));
  return parseRows(rows);
}

function splitRow(line: string, sep: string): string[] {
  if (sep === ',') {
    // respeta comillas simples
    const out: string[] = [];
    let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === sep && !inQ) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }
  return line.split(sep);
}

/** Archivo subido: xlsx via SheetJS, resto como texto. */
export async function parseFile(file: File): Promise<ParseResult> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
      return parseRows(rows as unknown[][]);
    } catch (e) {
      return { ok: false, error: `No pude leer el Excel: ${String(e)}`, nations: [], skipped: 0 };
    }
  }
  const text = await file.text();
  return parseDelimitedText(text);
}

/** Convierte naciones parseadas al modelo del formulario. */
export function toNationInput(p: ParsedNation): NationInput {
  return {
    name: p.name,
    killsPerDay: p.killsPerDay,
    deathsPerDay: p.deathsPerDay,
    provinces: p.provinces.length ? p.provinces : [emptyProvince(`${p.name} (capital)`)],
  };
}
