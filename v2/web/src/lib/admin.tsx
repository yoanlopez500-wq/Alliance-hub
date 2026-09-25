import { useEffect, useState } from 'react';
import { publicDb } from './api';
import { colors } from '../theme';

/** lib/admin.ts — base compartida del panel admin (puerto de admin-base.js + auth guards). */

export interface AdminUser { id: string; role: string; display_name: string | null; alliance_id: string | null; status: string }
export interface Alliance { id: string; name: string; tag: string | null }

/** Sesion admin: Supabase Auth + fila admin_users activa. null = no admin. */
export function useAdmin(): { admin: AdminUser | null; loading: boolean } {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await publicDb.auth.getSession();
        const session = data.session;
        if (!session) { if (!cancelled) { setAdmin(null); setLoading(false); } return; }
        const { data: adm } = await publicDb.from('admin_users').select('*')
          .eq('id', session.user.id).eq('status', 'active').maybeSingle();
        if (!cancelled) setAdmin((adm as AdminUser) ?? null);
      } catch { if (!cancelled) setAdmin(null); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  return { admin, loading };
}

export function isSuperadminRole(role: string | null | undefined) { return role === 'superadmin'; }
export function isStaffRole(role: string | null | undefined) {
  return role === 'superadmin' || role === 'event_admin' || role === 'moderator';
}

/** Carga el mapa de alianzas (cache por sesion). */
let allianceCache: Alliance[] | null = null;
export async function loadAlliances(force = false): Promise<Alliance[]> {
  if (allianceCache && !force) return allianceCache;
  const { data } = await publicDb.from('alliances').select('id, name, tag').order('name');
  allianceCache = (data as Alliance[]) ?? [];
  return allianceCache;
}

export function allianceById(alliances: Alliance[], id: string | null | undefined): Alliance | null {
  if (!id) return null;
  return alliances.find((a) => a.id === id) ?? null;
}

// ---- Badges ----
export function statusBadgeStyle(status: string | null | undefined): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    active: { label: 'ACTIVO', color: colors.success },
    banned: { label: 'BANEADO', color: colors.danger },
    suspended: { label: 'SUSPENDIDO', color: colors.warning },
    inactive: { label: 'INACTIVO', color: colors.muted },
    draft: { label: 'BORRADOR', color: colors.muted },
    open: { label: 'ABIERTA', color: colors.success },
    in_progress: { label: 'EN CURSO', color: colors.info },
    finished: { label: 'FINALIZADA', color: colors.purple },
    archived: { label: 'ARCHIVADA', color: colors.muted },
    pending: { label: 'PENDIENTE', color: colors.warning },
    confirmed: { label: 'CONFIRMADO', color: colors.success },
    approved: { label: 'APROBADO', color: colors.success },
    rejected: { label: 'RECHAZADO', color: colors.danger },
    under_review: { label: 'EN REVISION', color: colors.info },
  };
  return map[status || ''] ?? { label: (status || '?').toUpperCase(), color: colors.muted };
}

export function badge(status: string | null | undefined): React.ReactNode {
  const s = statusBadgeStyle(status);
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${s.color}22`, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

// ---- CSV de Supremacy 1914 (puerto de csv-parser.js) ----
export interface CsvPlayer {
  player_id: number; username: string; nation: string;
  kills: number; deaths: number; kd_ratio: number; raw: string[];
}
export interface ParsedCsv { players: CsvPlayer[]; totalRows: number; importedCount: number; errors: { line: number; reason: string }[] }

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim()); current = '';
    } else current += char;
  }
  result.push(current.trim());
  return result;
}

export function parseSupremacyCSV(csvText: string): ParsedCsv {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV vacio o invalido');
  const headers = parseCSVLine(lines[0]);
  const players: CsvPlayer[] = [];
  const errors: { line: number; reason: string }[] = [];
  const lower = (h: string) => h.toLowerCase();
  const nationIdx = headers.findIndex((h) => lower(h).includes('nation'));
  const usernameIdx = headers.findIndex((h) => lower(h).includes('username'));
  const idIdx = headers.findIndex((h) => h.trim().toLowerCase() === 'id');
  const totalIdx = headers.findIndex((h) => lower(h).includes('total'));
  if (nationIdx === -1 || usernameIdx === -1 || idIdx === -1 || totalIdx === -1) {
    throw new Error(`Columnas requeridas no encontradas. Headers: ${headers.join(', ')}`);
  }
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 3) continue;
    const playerId = row[idIdx]?.trim();
    if (!playerId || !/^\d+$/.test(playerId)) continue;
    const nation = row[nationIdx]?.trim();
    const username = row[usernameIdx]?.trim();
    const totalCell = row[totalIdx]?.trim();
    if (!nation || !username || !totalCell) { errors.push({ line: i + 1, reason: 'Datos incompletos' }); continue; }
    const totalMatch = totalCell.match(/^(\d+)\/(\d+)/);
    if (!totalMatch) { errors.push({ line: i + 1, reason: `Formato Total invalido: "${totalCell}"` }); continue; }
    const kills = parseInt(totalMatch[1], 10);
    const deaths = parseInt(totalMatch[2], 10);
    players.push({
      player_id: parseInt(playerId, 10), username, nation, kills, deaths,
      kd_ratio: deaths === 0 ? kills : parseFloat((kills / deaths).toFixed(2)),
      raw: row,
    });
  }
  return { players, totalRows: lines.length - 1, importedCount: players.length, errors };
}
