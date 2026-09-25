import { useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { usePlayerSession } from '../../lib/playerSession';
import { colors, styles } from '../../theme';
import DataTable from '../../components/DataTable';
import Reveal from '../../components/Reveal';

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

  // Membresia del jugador: decide si mostramos "Solicitar entrada" / "Pendiente" / "Tu alianza"
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
      reloadMembership();
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
    // Con solicitud pendiente en OTRA alianza no permitimos duplicar
    if (membership && membership.status !== 'rejected') return null;
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
          onRowClick={(a) => { window.location.href = `/alianzas/${a.id}`; }}
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
              key: 'join', header: '',
              render: (a) => joinAction(a),
            },
          ]}
        />
      </Reveal>
    </div>
  );
}
