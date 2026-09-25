import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Select } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { useAdmin } from '../../lib/admin';
import { internalTypeIdsCached } from '../../lib/matchTypes';

interface Alliance { id: string; name: string; tag: string | null }
interface Player { id: number; current_username: string }
interface PlayerWithStats { player: Player; kills: number; deaths: number; games: number }
interface Duel {
  id: string;
  name: string | null;
  status: string;
  alliance_a_id: string | null;
  alliance_b_id: string | null;
  winner_alliance_id?: string | null;
  created_at: string;
}

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };

const DUEL_STATUS_META: Record<string, { label: string; color: string }> = {
  finished: { label: 'FINALIZADO', color: colors.success },
  in_progress: { label: 'EN CURSO', color: colors.info },
  open: { label: 'ABIERTO', color: colors.warning },
  awaiting_opponent: { label: 'ESPERANDO OPONENTE', color: colors.purple },
};

/** Stats válidas: kills/deaths solo de partidas públicas con registro (RankingUtils.getValidPlayerStats). */
async function getValidPlayerStats(playerIds: number[]): Promise<Record<number, { kills: number; deaths: number; games: number }>> {
  const internalIds = await internalTypeIdsCached();
  const stats: Record<number, { kills: number; deaths: number; games: number }> = {};
  if (playerIds.length === 0) return stats;
  const { data: results } = await publicDb.from('match_results')
    .select('player_id, kills, deaths, match_id, matches!inner(match_type)')
    .in('player_id', playerIds)
    .not('matches.match_type', 'in', internalIds);
  const rows = (results as { player_id: number; kills: number; deaths: number; match_id: string }[]) || [];
  const matchIds = [...new Set(rows.map((r) => r.match_id).filter(Boolean))];
  const valid: Record<string, boolean> = {};
  const CHUNK = 100;
  for (let i = 0; i < matchIds.length; i += CHUNK) {
    const { data: regs } = await publicDb.from('match_registrations')
      .select('match_id, player_id')
      .in('match_id', matchIds.slice(i, i + CHUNK));
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
}

/** AdminDuelManagerPage — puerto de admin-duel-manager.js (líder de alianza). */
function DuelManager() {
  const { admin } = useAdmin();
  const isLeader = admin?.role === 'alliance_leader';
  const myAllianceId = admin?.alliance_id || null;

  const [myAlliance, setMyAlliance] = useState<Alliance | null>(null);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [players, setPlayers] = useState<PlayerWithStats[] | null>(null);
  const [selected, setSelected] = useState<{ id: number; name: string }[]>([]);
  const [mode, setMode] = useState<'open' | 'directed'>('open');
  const [rivalId, setRivalId] = useState('');
  const [openDuels, setOpenDuels] = useState<Duel[] | null>(null);
  const [myDuels, setMyDuels] = useState<Duel[] | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  const allianceName = useCallback((aid: string | null | undefined) => {
    if (!aid) return 'Por definir';
    if (myAlliance && aid === myAllianceId) return myAlliance.name;
    const a = alliances.find((x) => x.id === aid);
    return a ? a.name + (a.tag ? ' [' + a.tag + ']' : '') : 'Alianza';
  }, [alliances, myAlliance, myAllianceId]);

  const loadMyPlayers = useCallback(async () => {
    if (!myAllianceId) return;
    try {
      const { data, error: pErr } = await publicDb.from('players')
        .select('id, current_username')
        .eq('current_alliance_id', myAllianceId)
        .eq('status', 'active');
      if (pErr) throw pErr;
      const list = (data as Player[]) || [];
      const stats = await getValidPlayerStats(list.map((p) => p.id));
      const withStats: PlayerWithStats[] = list.map((p) => ({
        player: p,
        kills: stats[p.id]?.kills || 0,
        deaths: stats[p.id]?.deaths || 0,
        games: stats[p.id]?.games || 0,
      })).sort((a, b) => b.kills - a.kills);
      setPlayers(withStats);
    } catch (e) {
      console.error('[DuelManager] Error cargando jugadores:', e);
      setPlayers([]);
    }
  }, [myAllianceId]);

  const loadOpenDuels = useCallback(async () => {
    if (!myAllianceId) return;
    try {
      const { data, error: dErr } = await publicDb.from('matches')
        .select('id, name, status, alliance_a_id, alliance_b_id, created_at')
        .eq('match_type', 'duel')
        .eq('status', 'awaiting_opponent')
        .order('created_at', { ascending: false });
      if (dErr) throw dErr;
      const duels = ((data as Duel[]) || []).filter((d) => {
        if (d.alliance_a_id === myAllianceId) return false;
        return d.alliance_b_id === null || d.alliance_b_id === myAllianceId;
      });
      setOpenDuels(duels);
    } catch (e) {
      console.error('[DuelManager] Error cargando duelos abiertos:', e);
      setOpenDuels([]);
    }
  }, [myAllianceId]);

  const loadMyDuels = useCallback(async () => {
    if (!myAllianceId) return;
    try {
      const { data, error: dErr } = await publicDb.from('matches')
        .select('id, name, status, alliance_a_id, alliance_b_id, winner_alliance_id, created_at')
        .eq('match_type', 'duel')
        .or('alliance_a_id.eq.' + myAllianceId + ',alliance_b_id.eq.' + myAllianceId)
        .order('created_at', { ascending: false });
      if (dErr) throw dErr;
      setMyDuels((data as Duel[]) || []);
    } catch (e) {
      console.error('[DuelManager] Error cargando mis duelos:', e);
      setMyDuels([]);
    }
  }, [myAllianceId]);

  useEffect(() => {
    if (!myAllianceId) return;
    (async () => {
      const { data } = await publicDb.from('alliances').select('id, name, tag').eq('id', myAllianceId).maybeSingle();
      setMyAlliance((data as Alliance) || null);
      const { data: all } = await publicDb.from('alliances').select('id, name, tag').eq('status', 'active').order('name');
      setAlliances((all as Alliance[]) || []);
      loadMyPlayers();
      loadOpenDuels();
      loadMyDuels();
    })();
  }, [myAllianceId, loadMyPlayers, loadOpenDuels, loadMyDuels]);

  function togglePlayer(p: Player) {
    const idx = selected.findIndex((x) => x.id === p.id);
    if (idx !== -1) {
      setSelected((prev) => prev.filter((_, i) => i !== idx));
    } else {
      if (selected.length >= 5) { showToast('Máximo 5 jugadores'); return; }
      setSelected((prev) => [...prev, { id: p.id, name: p.current_username }]);
    }
  }

  async function createDuel() {
    if (!myAllianceId || !myAlliance) { showToast('No se pudo determinar tu alianza'); return; }
    if (mode === 'directed' && !rivalId) { showToast('Selecciona una alianza rival'); return; }
    if (selected.length === 0) { showToast('Selecciona al menos 1 jugador'); return; }
    setBusy(true);
    try {
      const myTag = myAlliance.tag || myAlliance.name;
      let duelName: string;
      if (mode === 'directed') {
        const rival = alliances.find((a) => a.id === rivalId);
        const rivalTag = rival ? (rival.tag || rival.name) : 'Rival';
        duelName = 'Duelo: ' + myTag + ' vs ' + rivalTag;
      } else {
        duelName = 'Duelo abierto: ' + myTag;
      }
      const { data: duel, error } = await publicDb.from('matches').insert({
        alliance_id: myAllianceId,
        alliance_a_id: myAllianceId,
        alliance_b_id: mode === 'directed' ? rivalId : null,
        match_type: 'duel',
        name: duelName,
        status: 'awaiting_opponent',
        max_players: 5,
        requires_approval: true,
        created_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      if (!duel || !(duel as { id: string }).id) throw new Error('No se pudo crear el duelo');

      const registrations = selected.map((p) => ({
        match_id: (duel as { id: string }).id,
        player_id: p.id,
        status: 'confirmed',
        registered_at: new Date().toISOString(),
      }));
      const { error: regError } = await publicDb.from('match_registrations').insert(registrations);
      if (regError) {
        showToast('Duelo creado pero error guardando equipo');
      } else {
        showToast('Duelo creado exitosamente');
      }
      await loadMyDuels();
    } catch (e: any) {
      showToast('Error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function acceptDuel(matchId: string) {
    if (!myAllianceId || !myAlliance) { showToast('No se pudo determinar tu alianza'); return; }
    if (selected.length === 0) { showToast('Selecciona tu equipo (hasta 5 jugadores) antes de aceptar'); return; }
    setBusy(true);
    try {
      const { data: duel, error: fetchError } = await publicDb.from('matches')
        .select('id, status, alliance_a_id, alliance_b_id')
        .eq('id', matchId).maybeSingle();
      if (fetchError) throw fetchError;
      if (!duel) throw new Error('Duelo no encontrado');
      const d = duel as { id: string; status: string; alliance_a_id: string | null; alliance_b_id: string | null };
      if (d.alliance_a_id === myAllianceId) { showToast('No puedes aceptar tu propio duelo'); return; }
      if (d.status !== 'awaiting_opponent') {
        showToast('Este duelo ya fue aceptado por otra alianza');
        await loadOpenDuels();
        return;
      }
      if (d.alliance_b_id && d.alliance_b_id !== myAllianceId) {
        showToast('Este desafío está dirigido a otra alianza');
        await loadOpenDuels();
        return;
      }

      const { error: updError } = await publicDb.from('matches')
        .update({ alliance_b_id: myAllianceId, status: 'open' })
        .eq('id', matchId)
        .eq('status', 'awaiting_opponent');
      if (updError) throw updError;

      const registrations = selected.map((p) => ({
        match_id: matchId,
        player_id: p.id,
        status: 'confirmed',
        registered_at: new Date().toISOString(),
      }));
      const { error: regError } = await publicDb.from('match_registrations').insert(registrations);
      if (regError) {
        showToast('Duelo aceptado pero error guardando equipo');
      } else {
        showToast('Duelo aceptado. Equipo registrado.');
      }
      setSelected([]);
      await loadOpenDuels();
      await loadMyDuels();
    } catch (e: any) {
      showToast('Error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  if (admin && !isLeader) {
    return (
      <AdminGate>
        <div style={{ maxWidth: 600, margin: '60px auto', padding: 24, textAlign: 'center' }}>
          <h2>Solo líderes de alianza</h2>
          <p style={{ color: colors.muted }}>El gestor de duelos es exclusivo para líderes de alianza.</p>
        </div>
      </AdminGate>
    );
  }

  return (
    <AdminGate>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Gestor de Duelos</h1>
        <p style={{ color: colors.muted, margin: '0 0 24px' }}>Crea y acepta duelos entre alianzas (equipos de hasta 5 jugadores)</p>

        {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}
        {toast && <div style={{ background: colors.success + '20', color: colors.success, padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>{toast}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {/* Crear duelo */}
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Crear duelo</h3>
            <label style={labelStyle}>Tu alianza</label>
            <Select value={myAllianceId || ''} disabled style={{ width: '100%', marginBottom: 12 }}>
              <option value="">{myAlliance ? `${myAlliance.name} [${myAlliance.tag}]` : 'Sin alianza'}</option>
            </Select>

            <label style={labelStyle}>Modo</label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="duel-mode" checked={mode === 'open'} onChange={() => setMode('open')} /> Abierto
              </label>
              <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="duel-mode" checked={mode === 'directed'} onChange={() => setMode('directed')} /> Dirigido
              </label>
            </div>

            <label style={labelStyle}>Alianza rival</label>
            <Select value={rivalId} onChange={(e) => setRivalId(e.target.value)} disabled={mode !== 'directed'} style={{ width: '100%', marginBottom: 12 }}>
              <option value="">Seleccionar rival…</option>
              {alliances.filter((a) => a.id !== myAllianceId).map((a) => (
                <option key={a.id} value={a.id}>{a.name} [{a.tag || '-'}]</option>
              ))}
            </Select>

            <label style={labelStyle}>Tu equipo (<span>{selected.length}</span>/5)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, minHeight: 28 }}>
              {selected.length === 0 && <span style={{ fontSize: 13, color: colors.muted }}>Ningún jugador seleccionado</span>}
              {selected.map((p) => (
                <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: colors.accent + '20', color: colors.accent, border: `1px solid ${colors.accent}30` }}>
                  {p.name || p.id}
                  <button type="button" onClick={() => setSelected((prev) => prev.filter((x) => x.id !== p.id))} style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 14 }}>×</button>
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', marginBottom: 12 }}>
              {players === null ? <Loader /> : players.length === 0 ? (
                <p style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>Sin jugadores en tu alianza</p>
              ) : players.map((item) => {
                const isSelected = selected.some((x) => x.id === item.player.id);
                return (
                  <div
                    key={item.player.id}
                    onClick={() => togglePlayer(item.player)}
                    style={{
                      borderRadius: 8, border: `1px solid ${isSelected ? colors.accent : colors.border}`,
                      padding: 10, cursor: 'pointer',
                      background: isSelected ? colors.accent + '10' : colors.card,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.player.current_username}</div>
                    <div style={{ fontSize: 11, color: colors.muted }}>Kills: {item.kills} | Muertes: {item.deaths} | {item.games} partidas válidas</div>
                  </div>
                );
              })}
            </div>

            <Button onClick={createDuel} disabled={busy}>{busy ? 'Creando…' : 'Crear duelo'}</Button>
          </div>

          {/* Duelos abiertos + mis duelos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Duelos abiertos</h3>
              {openDuels === null ? <Loader /> : openDuels.length === 0 ? (
                <EmptyState message="No hay duelos abiertos de otras alianzas" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {openDuels.map((d) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 10, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{d.name || 'Duelo'}</div>
                        <div style={{ fontSize: 11, color: colors.muted }}>Retador: {allianceName(d.alliance_a_id)}</div>
                      </div>
                      <Button style={{ fontSize: 12 }} onClick={() => acceptDuel(d.id)} disabled={busy}>Aceptar</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Mis duelos</h3>
              {myDuels === null ? <Loader /> : myDuels.length === 0 ? (
                <EmptyState message="Aún no tienes duelos" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                  {myDuels.map((d) => {
                    const rivalId2 = d.alliance_a_id === myAllianceId ? d.alliance_b_id : d.alliance_a_id;
                    const meta = DUEL_STATUS_META[d.status] || { label: d.status, color: colors.muted };
                    let resultHtml: React.ReactNode = null;
                    if (d.status === 'finished') {
                      if (!d.winner_alliance_id) resultHtml = <span style={{ fontSize: 12, fontWeight: 700, color: colors.warning }}>Empate</span>;
                      else if (d.winner_alliance_id === myAllianceId) resultHtml = <span style={{ fontSize: 12, fontWeight: 700, color: colors.success }}>Victoria</span>;
                      else resultHtml = <span style={{ fontSize: 12, fontWeight: 700, color: colors.danger }}>Derrota</span>;
                    }
                    return (
                      <div key={d.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{d.name || 'Duelo'}</div>
                          <span style={{ background: meta.color + '20', color: meta.color, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{meta.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: colors.muted }}>
                          <span>Rival: {allianceName(rivalId2)}</span>
                          {resultHtml}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminGate>
  );
}

export default function AdminDuelManagerPage() {
  return <DuelManager />;
}
