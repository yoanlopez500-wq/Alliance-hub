import { SUPABASE_URL } from './api';
import { slugifyHeader, KD_REGEX } from './importer/text';

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

export interface ApiImportRow { player_id: number; kills: number; deaths: number; nation?: string; units?: ApiImportUnit[] }
export interface ApiImportUnit { unit_key: string; kills: number; deaths: number }

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

  // Columnas de unidad: todo lo que no sea UID/Nation/Total. El desglose por
  // unidad es INFORMATIVO (perfil / rankings / prestigio): NO alimenta los
  // totales K/D, que se calculan abajo exactamente como siempre.
  // OJO: el exportador puede repetir nombre de columna (p.ej. 'Dirigible'
  // aparece dos veces); la segunda ocurrencia se guarda como 'dirigible__2'.
  const slugCounts: Record<string, number> = {};
  const unitCols: { idx: number; key: string }[] = [];
  (raw[headerIdx] || []).forEach((cell, idx) => {
    if (idx === uidCol || idx === nationCol) return;
    const name = String(cell ?? '').trim();
    if (!name) return;
    if (slugifyHeader(name) === 'total') return;
    const base = slugifyHeader(name);
    if (!base) return;
    const seen = slugCounts[base] ?? 0;
    slugCounts[base] = seen + 1;
    unitCols.push({ idx, key: seen === 0 ? base : `${base}__${seen + 1}` });
  });

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
    const units: ApiImportUnit[] = [];
    for (const uc of unitCols) {
      const m = KD_REGEX.exec(String(row[uc.idx] ?? '').trim());
      if (!m) continue;
      const uk = parseInt(m[1], 10) || 0;
      const ud = parseInt(m[2], 10) || 0;
      if (uk || ud) units.push({ unit_key: uc.key, kills: uk, deaths: ud });
    }
    rows.push({
      player_id: uid,
      kills,
      deaths,
      nation: nationCol >= 0 ? String(row[nationCol] ?? '').trim() || undefined : undefined,
      units: units.length ? units : undefined,
    });
  }
  if (!rows.length) throw new Error('El Excel no contiene jugadores (UID > 0)');
  return rows;
}

// ---------------------------------------------------------------------------
// Nuevos resources del proxy (nekokoneko /api/v1): roster oficial y fecha de
// inicio. Mismo rate limit global de 15s (cada llamada consume 1 permiso), asi
// que apiFetchJson reintenta automaticamente tras el Retry-After del 429.
// ---------------------------------------------------------------------------

async function apiFetchJson(path: string, attempts = 4): Promise<any> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/kd-excel-proxy?${path}`);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || String(API_IMPORT_MIN_SECONDS), 10) || API_IMPORT_MIN_SECONDS;
      if (i === attempts - 1) throw new ApiImportRateLimited(retryAfter);
      await new Promise((r) => setTimeout(r, retryAfter * 1000 + 500));
      continue;
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error ?? ''; } catch { /* noop */ }
      throw new Error(`Error del proxy (${res.status})${detail ? ': ' + detail : ''}`);
    }
    return res.json();
  }
  throw new Error('Proxy: agotados los reintentos');
}

export interface ApiRosterEntry { uid: number; name: string }

/**
 * Roster oficial de la partida (players). Normaliza el shape: la API devuelve
 * {ok, data:[...]} y cada entrada puede traer uid/id/player_id y
 * name/username/nation segun version.
 */
export async function fetchGameRoster(gameId: string): Promise<ApiRosterEntry[]> {
  const payload = await apiFetchJson(`gameId=${encodeURIComponent(gameId)}&resource=players`);
  const list: any[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const out: ApiRosterEntry[] = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const uid = parseInt(String(e.uid ?? e.id ?? e.player_id ?? ''), 10);
    if (!Number.isFinite(uid) || uid <= 0) continue;
    const name = String(e.name ?? e.username ?? e.nation ?? '').trim();
    out.push({ uid, name });
  }
  return out;
}

/**
 * Fecha de inicio real de la partida segun el exportador (start-date). Devuelve
 * null si la API no la tiene (partida muy antigua o aun no iniciada).
 */
export async function fetchGameStartDate(gameId: string): Promise<string | null> {
  const payload = await apiFetchJson(`gameId=${encodeURIComponent(gameId)}&resource=start-date`);
  const raw: unknown = payload?.data?.startDate ?? payload?.startDate ?? payload?.data ?? null;
  if (raw == null || raw === '') return null;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : String(raw);
}
