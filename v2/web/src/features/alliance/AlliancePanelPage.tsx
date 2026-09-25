import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { publicDb, getSessionToken } from '../../lib/api';
import { usePlayerSession } from '../../lib/playerSession';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import Badge from '../../components/Badge';
import { MatchTypeBadge } from '../../lib/matchTypes';

interface Alliance { id: string; name: string; tag: string; description: string | null }
interface Membership {
  id: string;
  alliance_id: string;
  status: string;
}
interface MatchRow {
  id: string;
  name: string;
  status: string;
  match_type: string;
}
interface MemberRow {
  id: number;
  current_username: string;
  last_seen: string | null;
  status: string;
}

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };

/** AlliancePanelPage — puerto de alliance-panel.js (panel de alianza para jugadores). */
export default function AlliancePanelPage() {
  const { session, loading } = usePlayerSession();
  const playerId = session?.playerId ?? null;

  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [myAlliance, setMyAlliance] = useState<Alliance | null>(null);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState('');

  const loadMembership = useCallback(async () => {
    if (!playerId) return;
    try {
      const { data, error: mErr } = await publicDb.from('alliance_memberships')
        .select('*')
        .eq('player_id', playerId)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mErr && mErr.code !== 'PGRST116') throw mErr;
      const m = (data as Membership) || null;
      setMembership(m);
      setMembershipChecked(true);
      if (m && m.status === 'approved') {
        const { data: alli } = await publicDb.from('alliances').select('*').eq('id', m.alliance_id).maybeSingle();
        setMyAlliance((alli as Alliance) || null);
      }
    } catch (e: any) {
      console.error('[AlliancePanel]', e);
      setMembershipChecked(true);
    }
  }, [playerId]);

  const loadMatches = useCallback(async (allianceId: string) => {
    try {
      const { data } = await publicDb.from('public_matches_view')
        .select('id, name, status, match_type')
        .eq('alliance_id', allianceId)
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(10);
      setMatches((data as MatchRow[]) || []);
    } catch (e) {
      console.error('[AlliancePanel] Error partidas:', e);
      setMatches([]);
    }
  }, []);

  const loadMembers = useCallback(async (allianceId: string) => {
    try {
      const { data: memberships } = await publicDb.from('alliance_memberships')
        .select('player_id')
        .eq('alliance_id', allianceId)
        .eq('status', 'approved');
      const ids = ((memberships as { player_id: number }[]) || []).map((m) => m.player_id);
      if (ids.length === 0) { setMembers([]); return; }
      const { data: players } = await publicDb.from('public_players_view')
        .select('id, current_username, last_seen, status')
        .in('id', ids);
      setMembers((players as MemberRow[]) || []);
    } catch (e) {
      console.error('[AlliancePanel] Error miembros:', e);
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await publicDb.from('alliances').select('id, name, tag, description').order('name');
        setAlliances((data as Alliance[]) || []);
      } catch (e) { console.error('[AlliancePanel] Error cargando alliances:', e); }
    })();
  }, []);

  useEffect(() => {
    if (!loading && playerId) loadMembership();
  }, [loading, playerId, loadMembership]);

  useEffect(() => {
    if (membership?.status === 'approved' && membership.alliance_id) {
      loadMatches(membership.alliance_id);
      loadMembers(membership.alliance_id);
    }
  }, [membership, loadMatches, loadMembers]);

  if (loading) return <Loader />;
  if (!session) return <Navigate to="/login" replace />;

  async function requestJoin(allianceId: string) {
    if (!playerId) return;
    try {
      const { error } = await publicDb.from('alliance_memberships').insert({
        player_id: playerId,
        alliance_id: allianceId,
        status: 'pending',
      });
      if (error) { setError(error.message); return; }
      setError('');
      await loadMembership();
    } catch (e: any) {
      setError(e.message || 'Error');
    }
  }

  async function cancelRequest() {
    if (!membership) return;
    const { error } = await publicDb.from('alliance_memberships').delete().eq('id', membership.id);
    if (error) { setError(error.message); return; }
    setMembership(null);
  }

  async function leaveAlliance() {
    if (!playerId) return;
    if (!window.confirm('¿Seguro que quieres salir de la alianza? El líder tendrá que aprobarte de nuevo si quieres volver.')) return;
    try {
      const { error: e } = await publicDb.rpc('player_leave_alliance', {
        p_player_id: playerId,
        p_token: getSessionToken() ?? '',
      });
      if (e) { setError(e.message); return; }
      setError('');
      setMembership(null);
      setMyAlliance(null);
      setMatches(null);
      setMembers(null);
    } catch (e: any) {
      setError(e.message || 'Error');
    }
  }

  const statusApproved = membership?.status === 'approved';

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      {/* Sin alianza */}
      {membershipChecked && !membership && (
        <>
          <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🚩</div>
            <h1 style={{ fontSize: 28, margin: 0 }}>Sin Alianza</h1>
            <p style={{ color: colors.muted, marginTop: 8 }}>Únete a una alianza para competir en equipo</p>
          </div>
          <h3 style={{ margin: '24px 0 12px' }}>Alianzas disponibles</h3>
          {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}
          {alliances.length === 0 ? (
            <EmptyState message="No hay alianzas disponibles" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alliances.map((a) => (
                <div key={a.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <strong>{a.name}</strong>
                    <span style={{ fontSize: 12, color: colors.muted, marginLeft: 8 }}>[{a.tag}]</span>
                  </div>
                  <Button onClick={() => requestJoin(a.id)}>Solicitar</Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Solicitud pendiente */}
      {membership?.status === 'pending' && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
          <h2>⏳ Solicitud pendiente</h2>
          <p style={{ color: colors.muted }}>Tu solicitud está esperando la aprobación del líder.</p>
          <Button variant="ghost" onClick={cancelRequest}>Cancelar solicitud</Button>
        </div>
      )}

      {/* Rechazado */}
      {membership?.status === 'rejected' && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
          <h2 style={{ color: colors.danger }}>✖ Solicitud rechazada</h2>
          <p style={{ color: colors.muted }}>Tu solicitud de unión fue rechazada. Puedes intentarlo con otra alianza.</p>
          <Button variant="ghost" onClick={cancelRequest}>Volver a intentar</Button>
        </div>
      )}

      {/* Aprobado */}
      {statusApproved && myAlliance && (
        <>
          <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🚩</div>
            <h1 style={{ fontSize: 28, margin: 0 }}>{myAlliance.name}</h1>
            <p style={{ color: colors.muted, marginTop: 8 }}>[{myAlliance.tag}] {myAlliance.description || ''}</p>
            <button onClick={leaveAlliance} style={{
              marginTop: 12, background: 'transparent', border: `1px solid ${colors.danger}`,
              color: colors.danger, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
            }}>Salir de la alianza</button>
          </div>

          <h3 style={{ margin: '24px 0 12px' }}>Partidas de la alianza</h3>
          {matches === null ? <Loader /> : matches.length === 0 ? (
            <EmptyState message="Sin partidas aún" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {matches.map((m) => (
                <div key={m.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                      <Badge label={m.status} tone={m.status === 'open' ? 'warning' : m.status === 'finished' ? 'active' : 'global'} />
                      <MatchTypeBadge typeId={m.match_type} />
                    </div>
                    <strong>{m.name}</strong>
                  </div>
                  <Link to={'/partida?id=' + m.id} style={{ textDecoration: 'none' }}>
                    <Button style={{ fontSize: 12 }}>Ver</Button>
                  </Link>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ margin: '24px 0 12px' }}>Miembros</h3>
          {members === null ? <Loader /> : members.length === 0 ? (
            <EmptyState message="Sin miembros" />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {members.map((p) => {
                const isOnline = p.last_seen && (Date.now() - new Date(p.last_seen).getTime()) < 300000;
                return (
                  <div key={p.id} style={{ ...cardStyle, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>👤</div>
                    <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{p.current_username}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline ? colors.success : colors.muted, display: 'inline-block' }} />
                      <span style={{ fontSize: 11, color: colors.muted }}>{isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
