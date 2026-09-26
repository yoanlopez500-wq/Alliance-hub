import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { usePlayerSession } from '../../lib/playerSession';
import { colors, styles } from '../../theme';
import DataTable from '../../components/DataTable';
import Reveal from '../../components/Reveal';
import PrestigeBadge from '../../components/PrestigeBadge';
import type { PrestigeDefinition } from '../../lib/prestige';

type Alliance = {
  id: string; name: string; tag: string; description: string | null;
  member_count?: number | null;
  profile?: { accent_color?: string; welcome_text?: string | null } | null;
};

type Membership = { id: string; alliance_id: string; status: string };

/**
 * Directorio publico de alianzas (v2): la puerta de entrada al perfil
 * publico de cada alianza (tablon, reglamento, partidas, miembros).
 * Lectura anon, sin login. Con sesion de jugador permite solicitar entrada.
 */
export default function AlianzasPage() {
  const navigate = useNavigate();
  const { session } = usePlayerSession();
  const playerId = session?.playerId ?? null;
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  const { data: alliances, loading, error } = useApi<Alliance[]>(async () => {
    const { data, error: e } = await publicDb
      .from('alliances')
      .select('id, name, tag, description, profile')
      .order('name');
    if (e) throw new Error(e.message);
    return data as Alliance[];
  }, []);

  // Prestigios desbloqueados por alianza (evaluados en vivo). El directorio es pequeno;
  // si crece, esto se puede mover a una vista agregada sin cambiar la UI.
  const { data: prestigeMap } = useApi<Record<string, PrestigeDefinition[]>>(async () => {
    const list = alliances ?? [];
    const entries = await Promise.all(list.map(async (a) => {
      try {
        const { data } = await publicDb.rpc('alliance_prestiges', { p_alliance_id: a.id });
        return [a.id, (data ?? []) as PrestigeDefinition[]];
      } catch {
        return [a.id, [] as PrestigeDefinition[]];
      }
    }));
    return Object.fromEntries(entries) as Record<string, PrestigeDefinition[]>;
  }, [alliances]);

  // Membresía del jugador: decide si mostramos "Solicitar entrada" / "Pendiente" / "Tu alianza"
  const { data: membership, reload: reloadMembership } = useApi<Membership | null>(async () => {
    if (!playerId) return null;
    const { data, error: mErr } = await publicDb.from('alliance_memberships')
      .select('id, alliance_id, status')
      .eq('player_id', playerId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    return (data as Membership) || null;
  }, [playerId]);

  async function requestJoin(allianceId: string) {
    if (!playerId) return;
    setJoining(allianceId);
    setJoinError(null);
    try {
      const { error: e } = await publicDb.from('alliance_memberships').insert({
        player_id: playerId,
        alliance_id: allianceId,
        status: 'pending',
      });
      if (e) { setJoinError(e.message); return; }
      await reloadMembership();
    } finally {
      setJoining(null);
    }
  }

  function joinAction(a: Alliance) {
    if (!playerId) return null;
    const mine = membership?.alliance_id === a.id ? membership : null;
    if (mine?.status === 'approved') {
      return <span style={{ color: colors.success, fontSize: 13, fontWeight: 600 }}>✓ Tu alianza</span>;
    }
    if (mine?.status === 'pending') {
      return <span style={{ color: colors.warning, fontSize: 13 }}>⏳ Solicitud pendiente</span>;
    }
    if (membership && membership.status !== 'rejected') return null; // ya está en trámite con otra
    return (
      <button
        onClick={(e) => { e.stopPropagation(); requestJoin(a.id); }}
        disabled={joining === a.id}
        style={{
          ...styles.btnPrimary, border: 'none', cursor: 'pointer',
          opacity: joining === a.id ? 0.6 : 1, fontSize: 13, padding: '8px 14px',
        }}
      >
        {joining === a.id ? 'Enviando…' : 'Solicitar entrada'}
      </button>
    );
  }

  return (
    <div>
      <Reveal>
        <h1 style={{ color: colors.text }}>Alianzas</h1>
        <p style={{ color: colors.muted, marginTop: -8 }}>
          Directorio público: toca una alianza para ver su perfil, tablón, reglamento y miembros.
          {playerId && ' Puedes solicitar entrada a la que quieras desde aquí.'}
        </p>
      </Reveal>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {joinError && <p style={{ color: colors.danger }}>{joinError}</p>}
      <Reveal delay={80}>
        <DataTable<Alliance>
          rows={alliances}
          loading={loading}
          empty="Todavía no hay alianzas registradas"
          onRowClick={(a) => navigate(`/alianzas/${a.id}`)}
          columns={[
            {
              key: 'name', header: 'Alianza',
              render: (a) => (
                <Link to={`/alianzas/${a.id}`} onClick={(e) => e.stopPropagation()}
                  style={{ color: a.profile?.accent_color ?? colors.accent, fontWeight: 700, textDecoration: 'none' }}>
                  {a.name} <span style={{ color: colors.muted, fontWeight: 500 }}>[{a.tag}]</span>
                </Link>
              ),
            },
            {
              key: 'description', header: 'Presentación',
              render: (a) => (
                <span style={{ color: colors.muted }}>
                  {a.profile?.welcome_text || a.description || '—'}
                </span>
              ),
            },
            {
              key: 'prestiges', header: 'Prestigios',
              render: (a) => {
                const list = prestigeMap?.[a.id] ?? [];
                if (list.length === 0) return <span style={{ color: colors.muted }}>—</span>;
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {list.slice(0, 3).map((p) => <PrestigeBadge key={p.id} prestige={p} size="sm" />)}
                  </div>
                );
              },
            },
            {
              key: 'join', header: '',
              render: (a) => joinAction(a),
            },
          ]}
        />
      </Reveal>
    </div>
  );
}
