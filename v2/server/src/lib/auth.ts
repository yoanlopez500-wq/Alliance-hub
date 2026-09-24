import type { FastifyRequest } from 'fastify';
import { supabase } from './supabase';

export type Viewer =
  | { kind: 'admin'; userId: string; role: string; allianceId: string | null }
  | { kind: 'player'; playerId: number };

export const PLATFORM_STAFF_ROLES = ['superadmin', 'moderator', 'event_admin'];

function extractToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/**
 * Identifica quien llama: admin (supabase auth) o jugador (token sellado).
 * Devuelve null si el token no resuelve a ninguno de los dos.
 */
export async function resolveViewer(req: FastifyRequest): Promise<Viewer | null> {
  const token = extractToken(req);
  if (!token) return null;

  // 1) Sesion de administrador (lider / staff de plataforma)
  const { data: userData } = await supabase.auth.getUser(token);
  const authUser = userData.user;
  if (authUser) {
    const { data: au } = await supabase
      .from('admin_users')
      .select('id, role, alliance_id')
      .eq('id', authUser.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!au) return null;
    return { kind: 'admin', userId: au.id as string, role: au.role as string, allianceId: (au.alliance_id as string | null) ?? null };
  }

  // 2) Token de jugador: el cliente manda "Player <playerId>:<token>"
  // (los tokens sellados solo se validan via RPC, nunca contra la tabla).
  const m = token.match(/^Player\s+(\d+):(.+)$/);
  if (m) {
    const playerId = Number(m[1]);
    const { data: ok } = await supabase.rpc('verify_player_token', { p_player_id: playerId, p_token: m[2] });
    if (ok) return { kind: 'player', playerId };
  }

  return null;
}

/** El viewer es staff de PLATAFORMA (no lider de alianza). */
export function isPlatformStaff(v: Viewer | null): boolean {
  return !!v && v.kind === 'admin' && PLATFORM_STAFF_ROLES.includes(v.role);
}

/**
 * El viewer puede administrar la alianza indicada:
 * - lider de ESA alianza (sesion admin), o
 * - oficial activo de esa alianza (sesion de jugador), o
 * - staff de plataforma.
 */
export async function canManageAlliance(v: Viewer | null, allianceId: string): Promise<boolean> {
  if (!v) return false;
  if (isPlatformStaff(v)) return true;
  if (v.kind === 'admin') return v.role === 'alliance_leader' && v.allianceId === allianceId;
  const { data } = await supabase
    .from('alliance_officers')
    .select('id')
    .eq('alliance_id', allianceId)
    .eq('player_id', v.playerId)
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

/** La alianza que el viewer administra (null si no es lider/oficial de ninguna). */
export async function managedAllianceId(v: Viewer): Promise<string | null> {
  if (v.kind === 'admin') return v.role === 'alliance_leader' ? v.allianceId : null;
  const { data } = await supabase
    .from('alliance_officers')
    .select('alliance_id')
    .eq('player_id', v.playerId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return (data?.alliance_id as string | null) ?? null;
}

/** El playerId es miembro aprobado de la alianza. */
export async function isApprovedMember(playerId: number, allianceId: string): Promise<boolean> {
  const { data } = await supabase
    .from('alliance_memberships')
    .select('id')
    .eq('player_id', playerId)
    .eq('alliance_id', allianceId)
    .eq('status', 'approved')
    .maybeSingle();
  return !!data;
}
