import { SUPABASE_URL } from './api';

/**
 * Importador de estadisticas K/D desde el exportador externo (Excel).
 * Mismo flujo que el importador legacy del v1, pero viviendo en v2.
 * El rate limit se aplica GLOBAL (15s minimo) del lado del servidor en la
 * edge function kd-excel-proxy (api_import_guard): aqui solo gestionamos la
 * cuenta atras local como UX y mostramos el Retry-After si llega un 429.
 */

export const API_IMPORT_MIN_SECONDS = 15; // nunca menor de 10, margen de seguridad
const LAST_FETCH_KEY = 'ah2_api_import_last';

let xlsxPromise: Promise<any> | null = null;

function loadXLSX(): Promise<any> {
  const w = window as any;
  if (w.XLSX) return Promise.resolve(w.XLSX);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
    s.async = true;
    s.onload = () => (w.XLSX ? resolve(w.XLSX) : reject(new Error('La libreria XLSX no se inicializo')));
    s.onerror = () => { xlsxPromise = null; reject(new Error('No se pudo cargar la libreria XLSX (CDN)')); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

/** Segundos restantes de la cuenta atras local (0 = se puede intentar). */
export function apiImportRemaining(): number {
  const last = parseInt(localStorage.getItem(LAST_FETCH_KEY) || '0', 10) || 0;
  const rem = Math.ceil((API_IMPORT_MIN_SECONDS * 1000 - (Date.now() - last)) / 1000);
  return rem > 0 ? rem : 0;
}

export function markApiImport(): void {
  try { localStorage.setItem(LAST_FETCH_KEY, String(Date.now())); } catch { /* noop */ }
}

export class ApiImportRateLimited extends Error {
  constructor(public retryAfter: number) {
    super(`Rate limit global: espera ${retryAfter}s e intentalo de nuevo`);
  }
}

export interface ApiImportRow { player_id: number; kills: number; deaths: number; nation?: string }

const KD_REGEX = /^(\d+)\s*[/|]\s*(\d+)(?:\s*\(.*\))?$/;

/**
 * Descarga el Excel de la partida via el proxy (con token server-side) y
 * devuelve las filas kills/deaths por UID (bots con UID <= 0 descartados).
 * La deteccion de columnas es automatica: se busca la fila de cabecera con
 * 'UID' y se suman kills/deaths de todas las columnas con formato "k/d"
 * (la columna Total se ignora para no duplicar).
 */
export async function fetchKdRows(gameId: string): Promise<ApiImportRow[]> {
  const XLSX = await loadXLSX();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/kd-excel-proxy?gameId=${encodeURIComponent(gameId)}`);
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || String(API_IMPORT_MIN_SECONDS), 10) || API_IMPORT_MIN_SECONDS;
    throw new ApiImportRateLimited(retryAfter);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error ?? ''; } catch { /* noop */ }
    throw new Error(`Error del proxy (${res.status})${detail ? ': ' + detail : ''}`);
  }

  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Buscar la fila de cabecera con 'UID' (primeras 10 filas).
  let headerIdx = -1;
  let uidCol = -1;
  let nationCol = -1;
  for (let r = 0; r < Math.min(raw.length, 10); r++) {
    const row = raw[r] || [];
    const idx = row.findIndex((c) => String(c ?? '').trim().toLowerCase() === 'uid');
    if (idx >= 0) {
      headerIdx = r;
      uidCol = idx;
      nationCol = row.findIndex((c) => String(c ?? '').trim().toLowerCase() === 'nation');
      break;
    }
  }
  if (headerIdx < 0) throw new Error('No se encontro la columna UID en el Excel');

  const rows: ApiImportRow[] = [];
  for (let r = headerIdx + 1; r < raw.length; r++) {
    const row = raw[r] || [];
    const uid = parseInt(String(row[uidCol] ?? ''), 10);
    if (!Number.isFinite(uid) || uid <= 0) continue; // bots / filas vacias
    let kills = 0;
    let deaths = 0;
    for (let c = 0; c < row.length; c++) {
      if (c === uidCol || c === nationCol) continue;
      const m = KD_REGEX.exec(String(row[c] ?? '').trim());
      if (m) { kills += parseInt(m[1], 10); deaths += parseInt(m[2], 10); }
    }
    rows.push({
      player_id: uid,
      kills,
      deaths,
      nation: nationCol >= 0 ? String(row[nationCol] ?? '').trim() || undefined : undefined,
    });
  }
  if (!rows.length) throw new Error('El Excel no contiene jugadores (UID > 0)');
  return rows;
}
