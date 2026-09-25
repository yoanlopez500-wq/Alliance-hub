import { useEffect, useState } from 'react';
import { serverApi, getSessionToken } from './api';

/**
 * Sesion de jugador v2: el token del server (Player id:token) es la fuente.
 * /api/me verifica el token y devuelve kind + playerId. Sin sesion -> null.
 */
export type PlayerSession = { playerId: number } | null;

export function usePlayerSession(): { session: PlayerSession; loading: boolean } {
  const [session, setSession] = useState<PlayerSession>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const playerId = localStorage.getItem('ah2_player_id');
      if (!getSessionToken() || !playerId) {
        if (!cancelled) { setSession(null); setLoading(false); }
        return;
      }
      try {
        const me = await serverApi.get('/me');
        if (!cancelled) setSession(me.kind === 'player' ? { playerId: me.playerId } : null);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { session, loading };
}

export function getStoredPlayerName(): string | null {
  return localStorage.getItem('ah2_player_name');
}

/**
 * Rol de visibilidad para reglas (public/player/official/leader/admin/superadmin).
 * Derivado de /api/me: staff por rol, lider/oficial por managedAllianceId.
 */
export function useVisibilityRole(): string {
  const [role, setRole] = useState('public');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getSessionToken()) return;
      try {
        const me = await serverApi.get('/me');
        if (cancelled) return;
        if (me.kind === 'admin') {
          if (me.role === 'superadmin') setRole('superadmin');
          else if (me.role === 'event_admin' || me.role === 'moderator') setRole('admin');
          else setRole('leader'); // alliance_leader
        } else if (me.managedAllianceId) {
          setRole('leader');
        } else {
          setRole('player');
        }
      } catch { /* public */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return role;
}

const VISIBILITY_ORDER: Record<string, number> = { public: 0, player: 1, official: 2, leader: 3, admin: 4, superadmin: 5 };

export function canSeeRuleSection(userRole: string, sectionVisibility: string | null | undefined): boolean {
  const userLevel = VISIBILITY_ORDER[userRole] ?? 0;
  const sectionLevel = VISIBILITY_ORDER[sectionVisibility || 'public'] ?? 0;
  return userLevel >= sectionLevel;
}
