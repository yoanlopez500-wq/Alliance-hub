import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import { formatDate } from '../../lib/format';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Input, Select, TextArea } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { useAdmin } from '../../lib/admin';
import { fetchAllRows, makeBayesScorer, compareBy, getSavedSortMode, saveSortMode, SORT_MODES, type SortMode } from '../../lib/ranking';
import { fetchMatchTypes, internalTypeIdsCached, notInValue, useMatchTypes, selectableTypes, MatchTypeBadge } from '../../lib/matchTypes';

interface Alliance { id: string; name: string; tag: string | null; description: string | null }
interface MembershipReq { id: string; player_id: number; requested_at: string }
interface Player { id: number; current_username: string }
interface MemberStat { player: Player; kd: number; kills: number; deaths: number; games: number; score: number }
interface Duel { id: string; name: string; status: string; created_at: string; max_players: number | null }
interface Match { id: string; name: string; status: string; match_type: string; created_at: string; max_players: number | null }

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', marginBottom: 12 };

const DUEL_STATUS_META: Record<string, { label: string; color: string }> = {
  finished: { label: 'FINALIZADO', color: colors.success },
  in_progress: { label: 'EN CURSO', color: colors.info },
  open: { label: 'ABIERTO', color: colors.warning },
  awaiting_opponent: { label: 'ESPERANDO OPONENTE', color: colors.purple },
  draft: { label: 'BORRADOR', color: colors.muted },
};

/** LeaderDashboardPage — puerto de leader-dashboard.js (panel de líder de alianza). */
function LeaderDashboard() {
  const { types: matchTypes } = useMatchTypes();
  const { admin } = useAdmin();
  const navigate = useNavigate();
  const isLeader = admin?.role === 'alliance_leader' || admin?.role === 'superadmin' || admin?.role === 'event_admin';
  const myAllianceId = admin?.alliance_id || null;

  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [tab, setTab] = useState<'members' | 'requests' | 'rankings' | 'duels' | 'matches'>('members');
  const [requests, setRequests] = useState<MembershipReq[] | null>(null);
  const [members, setMembers] = useState<MemberStat[] | null>(null);
  const [ranked, setRanked] = useState<MemberStat[] | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(getSavedSortMode());
  const [duels, setDuels] = useState<Duel[] | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Create-match modal
  const [cmOpen, setCmOpen] = useState(false);
  const [cmName, setCmName] = useState('');
  const [cmGameId, setCmGameId] = useState('');
  const [cmPassword, setCmPassword] = useState('');
  const [cmMax, setCmMax] = useState('31');
  const [cmDesc, setCmDesc] = useState('');
  const [cmPublic, setCmPublic] = useState(false);
  const [cmApproval, setCmApproval] = useState(false);
  const [cmType, setCmType] = useState('internal');
  const [busy, setBusy] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  const loadAllianceData = useCallback(async () => {
    if (!myAllianceId) return;
    try {
      const { data } = await publicDb.from('alliances').select('*').eq('id', myAllianceId).maybeSingle();
      setAlliance((data as Alliance) || null);
    } catch (e) { console.error('[LeaderDashboard] Error cargando alianza:', e); }
  }, [myAllianceId]);

  const loadPendingRequests = useCallback(async () => {
    if (!myAllianceId) return;
    try {
      const { data, error: rErr } = await publicDb.from('alliance_memberships')
        .select('*')
        .eq('alliance_id', myAllianceId)
        .eq('status', 'pending')
        .eq('requested_by', 'player')
        .order('requested_at', { ascending: false });
      if (rErr) throw rErr;
      setRequests((data as MembershipReq[]) || []);
    } catch (e) {
      console.error('[LeaderDashboard] Error cargando solicitudes:', e);
      setRequests([]);
    }
  }, [myAllianceId]);

  const loadValidStats = useCallback(async (playerIds: number[]) => {
    const stats: Record<number, { kills: number; deaths: number; games: number }> = {};
    if (!playerIds.length) return stats;
    const { data: results, error } = await publicDb.from('match_results')
      .select('player_id, kills, deaths, match_id, matches!inner(match_type)')
      .in('player_id', playerIds)
      .not('matches.match_type', 'in', notInValue(await internalTypeIdsCached()));
    if (error) throw error;
    const rows = (results as { player_id: number; kills: number; deaths: number; match_id: string }[]) || [];
    const matchIds = [...new Set(rows.map((r) => r.match_id).filter(Boolean))];
    const valid: Record<string, boolean> = {};
    if (matchIds.length > 0) {
      const { data: regs, error: regErr } = await publicDb.from('match_registrations')
        .select('match_id, player_id').in('match_id', matchIds);
      if (regErr) throw regErr;
      ((regs as { match_id: string; player_id: number }[]) || []).forEach((r) => {
        valid[r.match_id + ':' + r.player_id] = true;
      });
    }
    rows.forEach((r) => {
      if (!valid[r.match_id + ':' + r.player_id]) return;
      if (!stats[r.player_id]) stats[r.player_id] = { kills: 0, deaths: 0, games: 0 };
      stats[r.player_id].kills += r.kills || 0;
      stats[r.player_id].deaths += r.deaths || 0;
      stats[r.player_id].games += 1;
    });
    return stats;
  }, []);

  const loadMembers = useCallback(async () => {
    if (!myAllianceId) return;
    try {
      const { data: memberships, error } = await publicDb.from('alliance_memberships')
        .select('player_id').eq('alliance_id', myAllianceId).eq('status', 'approved');
      if (error) throw error;
      if (!memberships || memberships.length === 0) { setMembers([]); return; }
      const playerIds = (memberships as { player_id: number }[]).map((m) => m.player_id);
      const { data: players } = await publicDb.from('players').select('id, current_username').in('id', playerIds);
      const stats = await loadValidStats(playerIds);
      const list: MemberStat[] = ((players as Player[]) || []).map((p) => {
        const s = stats[p.id] || { kills: 0, deaths: 0, games: 0 };
        const kd = s.deaths > 0 ? s.kills / s.deaths : s.kills || 0;
        return { player: p, kd, kills: s.kills, deaths: s.deaths, games: s.games, score: 0 };
      });
      setMembers(list);
    } catch (e) {
      console.error('[LeaderDashboard] Error cargando miembros:', e);
      setMembers([]);
    }
  }, [myAllianceId, loadValidStats]);

  const loadAllianceRankings = useCallback(async () => {
    if (!myAllianceId || !members) return;
    try {
      // Priors globales desde public_rankings_view (toda la población)
      const popRows = await fetchAllRows<{ player_id: number; total_kills: number; total_deaths: number; games_played: number }>((from, to) =>
        Promise.resolve(
          publicDb.from('public_rankings_view')
            .select('player_id, total_kills, total_deaths, games_played')
            .order('player_id', { ascending: true })
            .range(from, to),
        ),
      );
      const scorer = makeBayesScorer(popRows, {
        eff: (p) => p.total_kills,
        deaths: (p) => p.total_deaths,
        games: (p) => p.games_played,
      });
      const acc = {
        score: (x: MemberStat) => {
          let denom = x.deaths + scorer.C * scorer.priorD;
          if (denom <= 0) denom = 1;
          return (x.kills + scorer.C * scorer.priorK) / denom;
        },
        games: (x: MemberStat) => x.games,
        deaths: (x: MemberStat) => x.deaths,
        eff: (x: MemberStat) => x.kills,
        name: (x: MemberStat) => x.player.current_username,
      };
      const withScore = members.map((m) => ({ ...m, score: acc.score(m) }));
      setRanked(withScore.slice().sort(compareBy(sortMode, acc)));
    } catch (e2) {
      console.error('[LeaderDashboard] Fallback a KD crudo:', e2);
      setRanked(members.slice().sort((a, b) => b.kd - a.kd));
    }
  }, [myAllianceId, members, sortMode]);

  const loadDuels = useCallback(async () => {
    if (!myAllianceId) return;
    try {
      const { data: duelsA } = await publicDb.from('matches').select('*')
        .eq('alliance_a_id', myAllianceId).eq('match_type', 'duel').order('created_at', { ascending: false });
      const { data: duelsB } = await publicDb.from('matches').select('*')
        .eq('alliance_b_id', myAllianceId).eq('match_type', 'duel').order('created_at', { ascending: false });
      const map = new Map<string, Duel>();
      [...((duelsA as Duel[]) || []), ...((duelsB as Duel[]) || [])].forEach((d) => map.set(d.id, d));
      setDuels([...map.values()]);
    } catch (e) {
      console.error('[LeaderDashboard] Error cargando duelos:', e);
      setDuels([]);
    }
  }, [myAllianceId]);

  const loadAllianceMatches = useCallback(async () => {
    if (!myAllianceId) return;
    try {
      const { data, error } = await publicDb.from('matches').select('*')
        .eq('alliance_id', myAllianceId).order('created_at', { ascending: false });
      if (error) throw error;
      setMatches((data as Match[]) || []);
    } catch (e) {
      console.error('[LeaderDashboard] Error cargando partidas:', e);
      setMatches([]);
    }
  }, [myAllianceId]);

  useEffect(() => {
    if (!isLeader || !myAllianceId) return;
    loadAllianceData();
    loadPendingRequests();
    loadMembers();
    loadDuels();
    loadAllianceMatches();
  }, [isLeader, myAllianceId, loadAllianceData, loadPendingRequests, loadMembers, loadDuels, loadAllianceMatches]);

  useEffect(() => {
    if (tab === 'rankings' && members) loadAllianceRankings();
  }, [tab, members, sortMode, loadAllianceRankings]);

  async function approveRequest(membershipId: string, playerId: number) {
    try {
      await publicDb.from('alliance_memberships').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', membershipId);
      await publicDb.from('players').update({ current_alliance_id: myAllianceId }).eq('id', playerId);
      showToast('Solicitud aprobada');
      await loadPendingRequests();
      await loadMembers();
    } catch (e: any) {
      showToast('Error: ' + e.message);
    }
  }

  async function rejectRequest(membershipId: string) {
    if (!window.confirm('¿Rechazar solicitud?')) return;
    try {
      await publicDb.from('alliance_memberships').update({ status: 'rejected' }).eq('id', membershipId);
      showToast('Rechazada');
      await loadPendingRequests();
    } catch (e: any) {
      showToast('Error: ' + e.message);
    }
  }

  async function createMatch() {
    if (!myAllianceId) { showToast('Sin alianza asignada'); return; }
    const name = cmName.trim();
    if (!name) { showToast('Nombre obligatorio'); return; }
    setBusy(true);
    try {
      // Coherencia is_private <-> tipo
      let isPrivate: boolean;
      if (cmType === 'internal') {
        isPrivate = true;
        if (cmPublic) showToast('Las partidas internas no pueden ser públicas. Usa "Torneo" o "Amistosa" para partidas visibles.');
      } else {
        isPrivate = !cmPublic;
      }
      const { data: sessData } = await publicDb.auth.getSession();
      const session = sessData.session;
      if (!session) throw new Error('No hay sesión activa');
      const { data, error } = await publicDb.from('matches').insert({
        name,
        game_id: cmGameId.trim() || null,
        password: cmPassword.trim() || null,
        alliance_id: myAllianceId,
        match_type: cmType,
        max_players: parseInt(cmMax) || 31,
        description: cmDesc.trim() || null,
        is_private: isPrivate,
        requires_approval: cmApproval,
        status: 'draft',
        created_by: session.user.id,
      }).select('id').single();
      if (error) throw error;
      if (!data || !(data as { id: string }).id) throw new Error('No se recibió ID de partida');
      showToast('Partida creada');
      setCmOpen(false);
      setCmName(''); setCmGameId(''); setCmPassword(''); setCmDesc('');
      navigate('/admin/partida?id=' + (data as { id: string }).id);
    } catch (e: any) {
      showToast('Error: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (admin && !isLeader) {
    return (
      <AdminGate>
        <div style={{ maxWidth: 600, margin: '60px auto', padding: 24, textAlign: 'center' }}>
          <h2>Solo líderes de alianza</h2>
          <p style={{ color: colors.muted }}>El panel de líder es exclusivo para líderes de alianza.</p>
        </div>
      </AdminGate>
    );
  }

  const tabs = [
    ['members', '👥 Miembros'],
    ['requests', `📨 Solicitudes${requests && requests.length > 0 ? ` (${requests.length})` : ''}`],
    ['rankings', '🏆 Ranking'],
    ['duels', '⚔️ Duelos'],
    ['matches', '🎮 Partidas'],
  ] as [typeof tab, string][];

  return (
    <AdminGate>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🚩</div>
          <h1 style={{ fontSize: 26, margin: 0 }}>{alliance?.name || 'Mi Alianza'}</h1>
          <p style={{ color: colors.muted, margin: '6px 0 0' }}>[{alliance?.tag || '---'}] {alliance?.description || ''}</p>
        </div>

        {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}
        {toast && <div style={{ background: colors.success + '20', color: colors.success, padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>{toast}</div>}

        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap', borderBottom: `1px solid ${colors.border}` }}>
          {tabs.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: 13, fontWeight: 700,
              color: tab === t ? colors.accent : colors.muted,
              borderBottom: `2px solid ${tab === t ? colors.accent : 'transparent'}`,
              marginBottom: -1,
            }}>{label}</button>
          ))}
          <div style={{ marginLeft: 'auto', paddingBottom: 4 }}>
            <Button style={{ fontSize: 12 }} onClick={() => setCmOpen(true)}>+ Crear partida</Button>
          </div>
        </div>

        {tab === 'members' && (members === null ? <Loader /> : members.length === 0 ? (
          <EmptyState message="No hay miembros." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => (
              <div key={m.player.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {(m.player.current_username || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{m.player.current_username}</p>
                  <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>{m.games} partidas válidas</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.accent }}>{m.kd.toFixed(2)} K/D</p>
                  <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>{m.kills}K / {m.deaths}D</p>
                </div>
              </div>
            ))}
          </div>
        ))}

        {tab === 'requests' && (requests === null ? <Loader /> : requests.length === 0 ? (
          <EmptyState message="No hay solicitudes pendientes." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.map((r) => (
              <div key={r.id} style={cardStyle}>
                <p style={{ margin: '0 0 4px', fontWeight: 700 }}>Jugador #{r.player_id}</p>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.muted }}>Solicitado: {formatDate(r.requested_at)}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button style={{ flex: 1, background: colors.success }} onClick={() => approveRequest(r.id, r.player_id)}>✓ Aprobar</Button>
                  <Button variant="danger" style={{ flex: 1 }} onClick={() => rejectRequest(r.id)}>✗ Rechazar</Button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {tab === 'rankings' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Select value={sortMode} onChange={(e) => { const m = e.target.value as SortMode; setSortMode(m); saveSortMode(m); }} style={{ minWidth: 200 }}>
                {SORT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </Select>
            </div>
            {ranked === null ? <Loader /> : ranked.length === 0 ? (
              <EmptyState message="Sin miembros para rankear." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ranked.map((r, i) => {
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
                  return (
                    <div key={r.player.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, width: 32, color: i < 3 ? colors.warning : colors.muted }}>{medal}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{r.player.current_username}</p>
                        <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>{r.games} partidas válidas</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.accent }}>{r.kd.toFixed(2)} K/D</p>
                        <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>{r.kills}K / {r.deaths}D</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'duels' && (duels === null ? <Loader /> : duels.length === 0 ? (
          <EmptyState message="Sin duelos." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {duels.map((d) => {
              const meta = DUEL_STATUS_META[d.status] || { label: d.status, color: colors.muted };
              return (
                <div key={d.id} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong>{d.name}</strong>
                    <span style={{ background: meta.color + '20', color: meta.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{meta.label}</span>
                  </div>
                  <p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>{formatDate(d.created_at)} | Max: {d.max_players || '-'}</p>
                </div>
              );
            })}
          </div>
        ))}

        {tab === 'matches' && (matches === null ? <Loader /> : matches.length === 0 ? (
          <EmptyState message="Sin partidas." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {matches.map((m) => {
              const meta = DUEL_STATUS_META[m.status] || { label: m.status, color: colors.muted };
              return (
                <Link key={m.id} to={'/admin/partida?id=' + m.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ ...cardStyle, transition: 'opacity 0.15s' }} onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')} onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 15 }}>{m.name || 'Partida'}</h3>
                        <p style={{ fontSize: 12, color: colors.muted, margin: '4px 0 0' }}>{formatDate(m.created_at)} | Max: {m.max_players || '-'} jugadores</p>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <MatchTypeBadge typeId={m.match_type} />
                        <span style={{ background: meta.color + '20', color: meta.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{meta.label}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}

        {/* Modal crear partida */}
        {cmOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setCmOpen(false)}>
            <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Crear Partida</h3>
              <label style={labelStyle}>Nombre *</label>
              <Input value={cmName} onChange={(e) => setCmName(e.target.value)} style={inputStyle} />
              <label style={labelStyle}>ID de partida (Supremacy)</label>
              <Input value={cmGameId} onChange={(e) => setCmGameId(e.target.value)} style={inputStyle} />
              <label style={labelStyle}>Contraseña</label>
              <Input value={cmPassword} onChange={(e) => setCmPassword(e.target.value)} style={inputStyle} />
              <label style={labelStyle}>Máx. jugadores</label>
              <Input type="number" value={cmMax} onChange={(e) => setCmMax(e.target.value)} style={inputStyle} />
              <label style={labelStyle}>Descripción</label>
              <TextArea value={cmDesc} onChange={(e) => setCmDesc(e.target.value)} rows={2} style={inputStyle} />
              <label style={labelStyle}>Tipo</label>
              <Select value={cmType} onChange={(e) => setCmType(e.target.value)} style={inputStyle}>
                {selectableTypes(matchTypes, myAllianceId).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', fontSize: 14 }}>
                <input type="checkbox" checked={cmPublic} onChange={(e) => setCmPublic(e.target.checked)} /> Partida pública (visible en el listado)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', fontSize: 14 }}>
                <input type="checkbox" checked={cmApproval} onChange={(e) => setCmApproval(e.target.checked)} /> Requiere aprobación para unirse
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button onClick={createMatch} disabled={busy}>{busy ? 'Creando…' : 'Crear partida'}</Button>
                <Button variant="ghost" onClick={() => setCmOpen(false)}>Cancelar</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGate>
  );
}

export default function LeaderDashboardPage() {
  return <LeaderDashboard />;
}
