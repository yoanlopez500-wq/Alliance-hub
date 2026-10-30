import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { usePlayerSession, getStoredPlayerName } from '../../lib/playerSession';
import { colors } from '../../theme';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import Section from '../../components/Section';
import PushToggle from '../../components/PushToggle';

interface MyRegistration {
  id: string;
  status: string;
  registered_at: string;
  match: { id: string; name: string; status: string; match_type: string } | null;
}

interface MembershipRow {
  id: string;
  alliance_id: string;
  status: string;
  alliance: { id: string; name: string; tag: string | null } | null;
}

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };

/** Mi perfil — hub del jugador: identidad, inscripciones, alianza y atajos. */
export default function MyProfilePage() {
  const { session, loading } = usePlayerSession();
  const playerId = session?.playerId ?? null;
  const displayName = getStoredPlayerName() || (playerId ? `Jugador ${playerId}` : '');

  const [regs, setRegs] = useState<MyRegistration[] | null>(null);
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [membershipChecked, setMembershipChecked] = useState(false);

  useEffect(() => {
    if (loading || !playerId) return;
    let cancelled = false;
    (async () => {
      const { data: regData } = await publicDb.from('match_registrations')
        .select('id, status, registered_at, match:matches(id, name, status, match_type)')
        .eq('player_id', playerId)
        .order('registered_at', { ascending: false })
        .limit(20);
      if (!cancelled) setRegs((regData as unknown as MyRegistration[]) ?? []);
      const { data: memData } = await publicDb.from('alliance_memberships')
        .select('id, alliance_id, status, alliance:alliances(id, name, tag)')
        .eq('player_id', playerId)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) { setMembership((memData as unknown as MembershipRow) || null); setMembershipChecked(true); }
    })();
    return () => { cancelled = true; };
  }, [loading, playerId]);

  if (loading || (session && !membershipChecked)) return <Loader />;
  if (!session) return <Navigate to="/login" replace />;

  const activeRegs = (regs ?? []).filter((r) => r.match && !['finished', 'archived', 'cancelled'].includes(r.match.status));

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ color: colors.text, margin: '0 0 16px' }}>👤 Mi perfil</h1>

      {/* Identidad */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 40 }}>🎮</div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <strong style={{ color: colors.text, fontSize: 18 }}>{displayName}</strong>
            <p style={{ color: colors.muted, fontSize: 13, margin: '2px 0 0' }}>ID: {playerId}</p>
          </div>
          <Link to={`/jugador/${playerId}`} style={{ color: colors.accent, fontSize: 13, fontWeight: 700 }}>
            Ver perfil público →
          </Link>
        </div>
        <p style={{ color: colors.muted, fontSize: 12, margin: '10px 0 0' }}>
          Tu identidad de jugador no lleva contraseña: en dispositivos nuevos entra de nuevo con tu ID y nombre.
        </p>
      </div>

      {/* Mis inscripciones */}
      <Section title="🎯 Mis inscripciones">
        {regs === null ? <Loader /> : activeRegs.length === 0 ? (
          <p style={{ color: colors.muted, fontSize: 14 }}>
            No tienes inscripciones activas.{' '}
            <Link to="/partidas" style={{ color: colors.accent }}>Ver partidas abiertas →</Link>
          </p>
        ) : (
          activeRegs.map((r) => (
            <div key={r.id} style={{ ...cardStyle, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <Link to={`/partidas/${r.match!.id}`} style={{ color: colors.text, fontWeight: 700 }}>{r.match!.name}</Link>
                <p style={{ color: colors.muted, fontSize: 12, margin: '2px 0 0' }}>
                  Inscrito el {new Date(r.registered_at).toLocaleDateString('es-ES')}
                </p>
              </div>
              <Badge label={r.status} tone={r.status === 'approved' || r.status === 'confirmed' ? 'success' : 'warning'} />
            </div>
          ))
        )}
      </Section>

      {/* Mi alianza */}
      <Section title="🛡 Mi alianza">
        {!membershipChecked ? <Loader /> : !membership ? (
          <p style={{ color: colors.muted, fontSize: 14 }}>
            No perteneces a ninguna alianza.{' '}
            <Link to="/alianza" style={{ color: colors.accent }}>Ver alianzas y solicitar entrada →</Link>
          </p>
        ) : (
          <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <Link to="/alianza" style={{ color: colors.text, fontWeight: 700 }}>
                {membership.alliance?.name ?? 'Alianza'}
                {membership.alliance?.tag ? ` [${membership.alliance.tag}]` : ''}
              </Link>
              <p style={{ color: colors.muted, fontSize: 12, margin: '2px 0 0' }}>
                {membership.status === 'approved'
                  ? 'Miembro'
                  : membership.status === 'pending'
                    ? 'Solicitud enviada, esperando aprobación'
                    : membership.status}
              </p>
            </div>
            {membership.status !== 'approved' && <Badge label={membership.status} tone="warning" />}
          </div>
        )}
      </Section>

      {/* Atajos */}
      <Section title="⚡ Atajos">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/partidas/nueva" style={shortcutBtn}>＋ Proponer partida</Link>
          <Link to="/reportar" style={shortcutBtn}>🚩 Reportar</Link>
          <Link to="/alianza" style={shortcutBtn}>🛡 Mi alianza</Link>
        </div>
      </Section>

      {/* Notificaciones */}
      <Section title="🔔 Notificaciones">
        <div style={cardStyle}>
          <PushToggle playerId={playerId!} />
        </div>
      </Section>
    </div>
  );
}

const shortcutBtn: React.CSSProperties = {
  ...cardStyle,
  display: 'inline-block',
  color: colors.accent,
  fontWeight: 700,
  fontSize: 13,
  textDecoration: 'none',
};
