import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import AdminGate from '../../components/AdminGate';
import { useAdmin, loadAlliances, allianceById, badge, isSuperadminRole, isStaffRole, type Alliance } from '../../lib/admin';
import { getSanctionSummary, isPlayerSanctioned, type PlayerSanctionState } from '../../lib/sanctions';
import { compareMatchResults } from '../../lib/ranking';
import { formatDate, formatDateTime } from '../../lib/format';
import { colors, styles } from '../../theme';
import { useMatchTypes, MatchTypeBadge } from '../../lib/matchTypes';
import Button from '../../components/Button';
import { Input, Select, TextArea } from '../../components/Field';
import DataTable from '../../components/DataTable';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';

const SORT_KEY = 'ah2_match_results_sort';

type Match = { id: string; name: string; description: string | null; status: string; match_type: string | null; alliance_id: string | null; game_id: string | null; password: string | null; max_players: number | null; created_at: string; csv_imported: boolean; winners_declared: boolean; is_private: boolean; share_token: string | null; requires_approval: boolean };
type Reg = { id: string; player_id: number; nation: string | null; status: string; notes: string | null; registered_at: string; username?: string; player?: PlayerSanctionState & { current_username?: string } };
type Result = { id: string; player_id: number; nation: string | null; kills: number; deaths: number; kd_ratio: number; username?: string };

function Modal({ onClose, children, width = 480 }: { onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...styles.card, width, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

/** AdminMatchDetailPage — puerto de admin-match-detail.js. */
function MatchDetail() {
  const { types: matchTypes } = useMatchTypes();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const matchId = params.get('id') || '';
  const action = params.get('action');
  const { admin } = useAdmin();
  const staff = isStaffRole(admin?.role);
  const superadmin = isSuperadminRole(admin?.role);

  const [match, setMatch] = useState<Match | null>(null);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [regIds, setRegIds] = useState<Set<number>>(new Set());
  const [resultSort, setResultSort] = useState(() => localStorage.getItem(SORT_KEY) || 'kd');
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // modals
  const [editMatch, setEditMatch] = useState<Match | null>(null);
  const [addReg, setAddReg] = useState(false);
  const [editReg, setEditReg] = useState<Reg | null>(null);
  const [newUid, setNewUid] = useState('');
  const [addResult, setAddResult] = useState(false);
  const [editResult, setEditResult] = useState<Result | null>(null);
  const [csvModal, setCsvModal] = useState(false);
  const [csvRows, setCsvRows] = useState<{ player_id: number; kills: number; deaths: number }[] | null>(null);
  const [winnersModal, setWinnersModal] = useState(false);
  const [winnerPicks, setWinnerPicks] = useState<number[]>([]);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3000); };

  const loadRegistrations = useCallback(async () => {
    if (!matchId) return;
    const { data, error } = await publicDb.from('match_registrations').select('*').eq('match_id', matchId).order('registered_at', { ascending: false });
    if (error) { setRegs([]); return; }
    const r = (data as Reg[]) ?? [];
    const ids = [...new Set(r.map((x) => x.player_id))];
    let pm: Record<number, any> = {};
    if (ids.length) {
      const { data: players } = await publicDb.from('players').select('*').in('id', ids);
      (players || []).forEach((p: any) => { pm[p.id] = p; });
    }
    r.forEach((x) => { x.player = pm[x.player_id]; x.username = pm[x.player_id]?.current_username; });
    setRegs(r);
    setRegIds(new Set(r.filter((x) => x.status === 'confirmed' || x.status === 'approved').map((x) => x.player_id)));
  }, [matchId]);

  const loadResults = useCallback(async () => {
    if (!matchId) return;
    const { data, error } = await publicDb.from('match_results').select('*').eq('match_id', matchId);
    if (error) { setResults([]); return; }
    const rows = (data as Result[]) ?? [];
    const ids = [...new Set(rows.map((r) => r.player_id))];
    let names: Record<number, string> = {};
    if (ids.length) {
      const { data: players } = await publicDb.from('players').select('id, current_username').in('id', ids);
      (players || []).forEach((p: any) => { names[p.id] = p.current_username; });
    }
    rows.forEach((r) => { r.username = names[r.player_id]; });
    setResults(rows);
  }, [matchId]);

  const loadMatch = useCallback(async () => {
    if (!matchId) return;
    const { data, error } = await publicDb.from('matches').select('*').eq('id', matchId).single();
    if (error || !data) { setNotFound(true); return; }
    setMatch(data as Match);
  }, [matchId]);

  useEffect(() => {
    loadAlliances().then(setAlliances);
    if (action !== 'new') {
      loadMatch();
      loadRegistrations();
      loadResults();
    }
  }, [action, loadMatch, loadRegistrations, loadResults]);

  // ---- Crear partida ----
  async function createMatch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    if (!name) { say('Nombre obligatorio'); return; }
    const { data, error } = await publicDb.from('matches').insert({
      name,
      game_id: String(fd.get('game_id') || '').trim() || null,
      password: String(fd.get('password') || '').trim() || null,
      alliance_id: String(fd.get('alliance_id') || '') || null,
      match_type: String(fd.get('match_type') || 'internal'),
      max_players: parseInt(String(fd.get('max_players') || '')) || null,
      description: String(fd.get('description') || '').trim() || null,
      status: 'draft',
      created_by: admin?.id,
    }).select().single();
    if (error) { say('Error: ' + error.message); return; }
    say('Partida creada');
    setTimeout(() => navigate(`/admin/partida?id=${(data as any).id}`), 600);
  }

  // ---- Acciones de partida ----
  async function updateStatus(newStatus: string) {
    if (!window.confirm('Cambiar a ' + newStatus + '?')) return;
    const { error } = await publicDb.from('matches').update({ status: newStatus }).eq('id', matchId);
    if (error) say('Error: ' + error.message); else { say('Estado actualizado'); loadMatch(); }
  }
  async function deleteMatch() {
    if (!window.confirm('ELIMINAR esta partida y todos sus datos?')) return;
    await publicDb.from('match_winners').delete().eq('match_id', matchId);
    const { error } = await publicDb.from('matches').delete().eq('id', matchId);
    if (error) { say('Error: ' + error.message); return; }
    say('Eliminada');
    setTimeout(() => navigate('/admin/partidas'), 700);
  }
  async function saveMatchEdit() {
    if (!editMatch) return;
    const { error } = await publicDb.from('matches').update({
      name: editMatch.name, game_id: editMatch.game_id, password: editMatch.password,
      match_type: editMatch.match_type, max_players: editMatch.max_players,
      description: editMatch.description, alliance_id: editMatch.alliance_id,
    }).eq('id', matchId);
    if (error) say('Error: ' + error.message); else { say('Partida actualizada'); setEditMatch(null); loadMatch(); }
  }

  // ---- Registrations CRUD ----
  async function saveAddReg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pid = parseInt(String(fd.get('player_id')), 10);
    const username = String(fd.get('username') || '').trim();
    const nation = String(fd.get('nation') || '').trim() || null;
    const status = String(fd.get('status') || 'confirmed');
    if (!pid || pid <= 0) { say('Introduce un ID de jugador numerico positivo'); return; }
    const { data: existingReg } = await publicDb.from('match_registrations').select('id').eq('match_id', matchId).eq('player_id', pid).maybeSingle();
    if (existingReg) { say(`El jugador ${pid} ya esta registrado en esta partida`); return; }
    const { data: existingPlayer } = await publicDb.from('players').select('id, status, banned_until, suspended_until, suspension_reason').eq('id', pid).maybeSingle();
    if (existingPlayer && isPlayerSanctioned(existingPlayer as any) &&
        !window.confirm('ADVERTENCIA: este jugador esta sancionado. Añadir de todos modos?')) return;
    if (!existingPlayer && username) {
      const { error: pe } = await publicDb.from('players').insert({ id: pid, current_username: username, status: 'active' });
      if (pe) { say('Error creando jugador: ' + pe.message); return; }
    }
    const { error } = await publicDb.from('match_registrations').insert({ match_id: matchId, player_id: pid, nation, status });
    if (error) { say('Error: ' + error.message); return; }
    say('Jugador añadido');
    setAddReg(false);
    loadRegistrations();
  }
  async function saveEditReg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editReg) return;
    const fd = new FormData(e.currentTarget);
    const nation = String(fd.get('nation') || '').trim() || null;
    const status = String(fd.get('status') || 'pending');
    const notes = String(fd.get('notes') || '').trim() || null;
    const username = String(fd.get('username') || '').trim() || null;
    if ((status === 'confirmed' || status === 'approved') && editReg.player && isPlayerSanctioned(editReg.player)) {
      const sum = getSanctionSummary(editReg.player);
      if (!window.confirm(`ADVERTENCIA: este jugador esta sancionado. ${sum.reason}\nRestante: ${sum.remainingText}\n\nAun asi quieres confirmarlo?`)) return;
    }
    const { error } = await publicDb.from('match_registrations').update({ nation, status, notes }).eq('id', editReg.id);
    if (error) { say('Error: ' + error.message); return; }
    if (username && editReg.player && !editReg.player.current_username) {
      await publicDb.from('players').update({ current_username: username }).eq('id', editReg.player_id);
    }
    say('Registro actualizado');
    setEditReg(null);
    setNewUid('');
    loadRegistrations();
  }
  async function changeUid() {
    if (!superadmin) { say('Solo el superadmin puede cambiar el UID'); return; }
    if (!editReg) return;
    const oldId = editReg.player_id;
    const newId = parseInt(newUid, 10);
    if (!newId || newId <= 0) { say('Introduce un UID nuevo numerico positivo'); return; }
    if (newId === oldId) { say('El nuevo UID debe ser distinto del actual'); return; }
    const { data: exists } = await publicDb.from('players').select('id').eq('id', newId).maybeSingle();
    if (exists) { say(`El UID ${newId} ya existe en el sistema`); return; }
    if (!window.confirm(`Cambiar el UID del jugador ${oldId} a ${newId}?\n\nEsto cambiara el UID en TODA la base de datos. Continuar?`)) return;
    const { error: upErr } = await publicDb.from('players').update({ id: newId }).eq('id', oldId);
    if (upErr) { say('Error: ' + upErr.message + ' (puede requerir la RPC change_player_uid)'); return; }
    say('UID actualizado');
    setEditReg(null);
    setNewUid('');
    loadRegistrations();
    loadResults();
  }
  async function deleteReg(reg: Reg) {
    if (!window.confirm('Eliminar este registro de la partida? El jugador podra volver a registrarse.')) return;
    const { error } = await publicDb.from('match_registrations').delete().eq('id', reg.id);
    if (error) say('Error: ' + error.message); else { say('Registro eliminado'); loadRegistrations(); }
  }

  // ---- Results CRUD + CSV ----
  async function saveResult(e: React.FormEvent<HTMLFormElement>, existing?: Result) {
    e.preventDefault();
    if (!staff) { say('Solo admins pueden editar resultados'); return; }
    const fd = new FormData(e.currentTarget);
    const pid = existing ? existing.player_id : parseInt(String(fd.get('player_id')), 10);
    const kills = parseInt(String(fd.get('kills') || '0')) || 0;
    const deaths = parseInt(String(fd.get('deaths') || '0')) || 0;
    const nation = String(fd.get('nation') || '') || null;
    const kd = deaths > 0 ? kills / deaths : kills;
    const payload = { match_id: matchId, player_id: pid, kills, deaths, nation, kd_ratio: parseFloat(kd.toFixed(2)) };
    const { error } = existing
      ? await publicDb.from('match_results').update({ kills, deaths, nation, kd_ratio: payload.kd_ratio }).eq('id', existing.id)
      : await publicDb.from('match_results').upsert(payload, { onConflict: 'match_id,player_id' });
    if (error) { say('Error: ' + error.message); return; }
    say(existing ? 'Resultado actualizado' : 'Resultado guardado');
    setEditResult(null); setAddResult(false);
    loadResults();
  }
  async function deleteResult(r: Result) {
    if (!staff) { say('Solo admins pueden eliminar resultados'); return; }
    if (!window.confirm(`Eliminar el resultado del jugador ${r.player_id}?`)) return;
    const { error } = await publicDb.from('match_results').delete().eq('id', r.id);
    if (error) say('Error: ' + error.message); else { say('Resultado eliminado'); loadResults(); }
  }
  function handleCsvFile(f: File) {
    if (!f.name.endsWith('.csv')) { say('Solo CSV'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split('\n').filter((l) => l.trim());
      const rows: { player_id: number; kills: number; deaths: number }[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(',');
        if (c.length >= 3) {
          const pid = parseInt(c[0].trim());
          if (pid) rows.push({ player_id: pid, kills: parseInt(c[1].trim()) || 0, deaths: parseInt(c[2].trim()) || 0 });
        }
      }
      setCsvRows(rows);
    };
    reader.readAsText(f);
  }
  async function ensureRegs(players: { player_id: number }[]): Promise<{ inserted: number; failed: boolean }> {
    const result = { inserted: 0, failed: false };
    try {
      const seen: Record<number, boolean> = {};
      const rows = players
        .map((p) => parseInt(String(p.player_id), 10))
        .filter((pid) => pid > 0 && !seen[pid] && (seen[pid] = true))
        .map((pid) => ({ match_id: matchId, player_id: pid, status: 'confirmed' }));
      if (!rows.length) return result;
      const ids = rows.map((r) => r.player_id);
      const existing: Record<string, boolean> = {};
      for (let off = 0; off < ids.length; off += 100) {
        const { data } = await publicDb.from('match_registrations').select('player_id').eq('match_id', matchId).in('player_id', ids.slice(off, off + 100));
        (data || []).forEach((r: any) => { existing[String(r.player_id)] = true; });
      }
      const toInsert = rows.filter((r) => !existing[String(r.player_id)]);
      for (let i = 0; i < toInsert.length; i += 100) {
        const { error } = await publicDb.from('match_registrations').insert(toInsert.slice(i, i + 100));
        if (error) { result.failed = true; break; }
        result.inserted += Math.min(100, toInsert.length - i);
      }
    } catch { result.failed = true; }
    return result;
  }
  async function confirmCsvImport() {
    if (!csvRows?.length) return;
    try {
      for (const r of csvRows) {
        const kd = r.deaths > 0 ? r.kills / r.deaths : r.kills;
        const { error } = await publicDb.from('match_results').upsert(
          { match_id: matchId, player_id: r.player_id, kills: r.kills, deaths: r.deaths, kd_ratio: parseFloat(kd.toFixed(2)) },
          { onConflict: 'match_id,player_id' });
        if (error) throw error;
      }
      await publicDb.from('matches').update({ csv_imported: true }).eq('id', matchId);
      const regRes = await ensureRegs(csvRows);
      let msg = `CSV importado: ${csvRows.length} jugadores`;
      if (regRes.failed) msg += ' · AVISO: no se pudieron crear los registros automaticos';
      else if (regRes.inserted > 0) msg += ` · + ${regRes.inserted} registros creados`;
      say(msg);
      setCsvModal(false); setCsvRows(null);
      loadResults(); loadRegistrations(); loadMatch();
    } catch (e: any) { say('Error: ' + (e?.message ?? e)); }
  }

  // ---- Ganadores ----
  async function saveWinners() {
    if (!winnerPicks.length) { say('Selecciona al menos un ganador'); return; }
    try {
      for (let i = 0; i < winnerPicks.length; i++) {
        const { error } = await publicDb.from('match_winners').upsert(
          { match_id: matchId, player_id: winnerPicks[i], position: i + 1 },
          { onConflict: 'match_id,player_id' });
        if (error) throw error;
      }
      await publicDb.from('matches').update({ winners_declared: true }).eq('id', matchId);
      say(winnerPicks.length + ' ganador(es)');
      setWinnersModal(false);
      loadMatch();
    } catch (e: any) { say('Error: ' + (e?.message ?? e)); }
  }

  const sortedResults = useMemo(() => {
    if (!results) return null;
    const nameOf = (r: Result) => r.username || '';
    const tie = compareMatchResults(nameOf);
    const res = results.slice();
    if (resultSort === 'kills') res.sort((a, b) => (b.kills - a.kills) || tie(a, b));
    else if (resultSort === 'deaths') res.sort((a, b) => (a.deaths - b.deaths) || tie(a, b));
    else res.sort(tie);
    return res;
  }, [results, resultSort]);

  if (action === 'new') {
    return (
      <Reveal>
        <h1 style={{ color: colors.text }}>➕ Nueva partida</h1>
        <form onSubmit={createMatch} style={{ ...styles.card, maxWidth: 520 }}>
          <label style={{ fontSize: 12, color: colors.muted }}>Nombre *</label>
          <Input name="name" required style={styles.input} />
          <label style={{ fontSize: 12, color: colors.muted }}>ID de juego</label>
          <Input name="game_id" style={styles.input} />
          <label style={{ fontSize: 12, color: colors.muted }}>Password</label>
          <Input name="password" style={styles.input} />
          <label style={{ fontSize: 12, color: colors.muted }}>Alianza</label>
          <Select name="alliance_id" defaultValue="" style={styles.input}>
            <option value="">-- Sin alianza --</option>
            {alliances.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <label style={{ fontSize: 12, color: colors.muted }}>Tipo</label>
          <Select name="match_type" defaultValue="internal" style={styles.input}>
            {matchTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <label style={{ fontSize: 12, color: colors.muted }}>Max jugadores</label>
          <Input name="max_players" type="number" style={styles.input} />
          <label style={{ fontSize: 12, color: colors.muted }}>Descripcion</label>
          <TextArea name="description" rows={2} style={styles.input} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit">Crear partida</Button>
            <Link to="/admin/partidas" style={{ ...styles.btnGhost, padding: '10px 18px', textDecoration: 'none' }}>Cancelar</Link>
          </div>
        </form>
      </Reveal>
    );
  }

  if (notFound) return <p style={{ color: colors.danger, textAlign: 'center', padding: 40 }}>Partida no encontrada</p>;
  // Sin ?id= ni ?action=new: evita el Loader eterno y ofrece salida.
  if (!matchId && action !== 'new') {
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', padding: 24, textAlign: 'center' }}>
        <h2 style={{ color: colors.text }}>Selecciona una partida</h2>
        <p style={{ color: colors.muted }}>Esta vista necesita una partida concreta.</p>
        <Link to="/admin/partidas" style={{ color: colors.accent }}>← Ir a la lista de partidas</Link>
      </div>
    );
  }
  if (!match) return <Loader />;

  const alli = allianceById(alliances, match.alliance_id);
  const shareUrl = `${window.location.origin}/partidas/${match.id}${match.share_token ? `?token=${match.share_token}` : ''}`;

  return (
    <div>
      <Reveal>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h1 style={{ margin: '0 0 6px', color: colors.text }}>🎮 {match.name}{alli ? ` [${alli.tag}]` : ''}</h1>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {badge(match.status)}
                <MatchTypeBadge typeId={match.match_type} />
                {match.csv_imported && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(129,199,132,0.15)', color: colors.success }}>✓ CSV</span>}
              </div>
            </div>
            <Link to="/admin/partidas" style={{ ...styles.btnGhost, padding: '6px 12px', fontSize: 12, textDecoration: 'none' }}>&larr; Volver</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, fontSize: 13 }}>
            {[['ID Juego', match.game_id || '-'], ['Max', match.max_players || '-'], ['Creada', formatDate(match.created_at)], ['Alianza', alli?.name ?? 'Ninguna'], ['Password', match.password || '-']].map(([l, v]) => (
              <div key={l} style={{ background: colors.bg, borderRadius: 8, padding: 10 }}>
                <p style={{ margin: 0, fontSize: 11, color: colors.muted }}>{l}</p>
                <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>{v}</p>
              </div>
            ))}
          </div>
          {match.description && <p style={{ marginTop: 10, padding: 10, borderRadius: 8, background: colors.bg, color: colors.muted, fontSize: 13 }}>{match.description}</p>}
        </div>
      </Reveal>

      <Reveal>
        <div style={{ ...styles.card, marginTop: 14 }}>
          <h3 style={{ margin: '0 0 10px', color: colors.text }}>🔗 Enlace de comparticion</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input readOnly value={shareUrl} style={{ ...styles.input, flex: 1, marginBottom: 0 }} onFocus={(e) => e.target.select()} />
            <Button onClick={() => { navigator.clipboard?.writeText(shareUrl); say('Copiado'); }}>Copiar</Button>
          </div>
        </div>
      </Reveal>

      {staff && (
        <Reveal>
          <div style={{ ...styles.card, marginTop: 14 }}>
            <h3 style={{ margin: '0 0 10px', color: colors.text }}>🛠️ Acciones de admin</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {match.status === 'draft' && <Button onClick={() => updateStatus('open')}>Abrir registro</Button>}
              {match.status === 'open' && <Button onClick={() => updateStatus('in_progress')}>Iniciar partida</Button>}
              {match.status === 'in_progress' && <Button onClick={() => updateStatus('finished')}>Finalizar</Button>}
              <Button variant="ghost" onClick={() => setEditMatch({ ...match })}>Editar</Button>
              <Button variant="ghost" onClick={() => setCsvModal(true)}>📥 Importar CSV</Button>
              <Button variant="ghost" onClick={() => { setWinnerPicks([]); setWinnersModal(true); }}>🏆 Declarar ganadores</Button>
              <Button variant="danger" onClick={deleteMatch}>🗑 Eliminar</Button>
            </div>
          </div>
        </Reveal>
      )}

      <Reveal>
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ color: colors.text, margin: 0 }}>📝 Registrados ({regs?.length ?? 0})</h3>
            <Button onClick={() => setAddReg(true)}>+ Añadir</Button>
          </div>
          {!regs ? <Loader /> : (
            <DataTable
              rows={regs.map((r) => ({ ...r, id: r.id }))}
              empty="Sin registrados"
              columns={[
                { key: 'pid', header: 'ID', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: colors.muted }}>{r.player_id}</span> },
                { key: 'player', header: 'Jugador', render: (r) => (
                  <span>
                    {r.username || `Jugador ${r.player_id}`}
                    {r.player && isPlayerSanctioned(r.player) && (
                      <span title={getSanctionSummary(r.player).reason} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(239,83,80,0.2)', color: colors.danger, marginLeft: 6 }}>🚫</span>
                    )}
                  </span>
                ) },
                { key: 'nation', header: 'Nacion', render: (r) => <span style={{ color: colors.muted }}>{r.nation || '-'}</span> },
                { key: 'status', header: 'Estado', render: (r) => badge(r.status) },
                { key: 'reg_at', header: 'Registrado', render: (r) => <span style={{ fontSize: 12, color: colors.muted }}>{formatDateTime(r.registered_at)}</span> },
                { key: 'actions', header: '', render: (r) => (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditReg({ ...r })} title="Editar" style={miniBtn(colors.info)}>✎</button>
                    <button onClick={() => deleteReg(r)} title="Eliminar" style={miniBtn(colors.danger)}>🗑</button>
                    <button onClick={() => window.open(`/admin/strikes?prefill_player=${r.player_id}&prefill_match=${matchId}`, '_blank')} title="Sancionar" style={miniBtn(colors.warning)}>⚡</button>
                  </span>
                ) },
              ]}
            />
          )}
        </div>
      </Reveal>

      <Reveal>
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ color: colors.text, margin: 0 }}>📊 Resultados</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={resultSort} onChange={(e) => { setResultSort(e.target.value); localStorage.setItem(SORT_KEY, e.target.value); }} style={{ ...styles.input, width: 'auto', marginBottom: 0 }}>
                <option value="kd">Orden: KD</option>
                <option value="kills">Orden: Bajas</option>
                <option value="deaths">Orden: Muertes</option>
              </select>
              {staff && <Button onClick={() => setAddResult(true)}>+ Añadir</Button>}
            </div>
          </div>
          {!sortedResults ? <Loader /> : (
            <DataTable
              rows={sortedResults}
              empty="Sin resultados. Importa un CSV o añade manualmente."
              columns={[
                { key: 'player', header: 'Jugador', render: (r) => <strong style={{ color: colors.text }}>{r.username || `Jugador ${r.player_id}`}</strong> },
                { key: 'kills', header: 'Bajas', render: (r) => <span style={{ textAlign: 'right', display: 'block', color: colors.success, fontWeight: 700 }}>{r.kills}</span> },
                { key: 'deaths', header: 'Muertes', render: (r) => <span style={{ textAlign: 'right', display: 'block', color: colors.danger }}>{r.deaths}</span> },
                { key: 'kd', header: 'KD', render: (r) => <span style={{ textAlign: 'right', display: 'block', fontWeight: 700, color: (r.kd_ratio || 0) >= 1 ? colors.success : colors.warning }}>{r.kd_ratio}</span> },
                { key: 'valid', header: 'Valido', render: (r) => regIds.has(r.player_id)
                  ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(129,199,132,0.15)', color: colors.success }}>Si</span>
                  : <span title="No registrado en la partida: no cuenta para ranking" style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(159,168,218,0.15)', color: colors.muted }}>No</span> },
                ...(staff ? [{ key: 'actions', header: '', render: (r: Result) => (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditResult({ ...r })} title="Editar" style={miniBtn(colors.info)}>✎</button>
                    <button onClick={() => deleteResult(r)} title="Eliminar" style={miniBtn(colors.danger)}>🗑</button>
                  </span>
                ) }] : []) as any,
              ]}
            />
          )}
        </div>
      </Reveal>

      {/* Modal: editar partida */}
      {editMatch && (
        <Modal onClose={() => setEditMatch(null)}>
          <h3 style={{ margin: '0 0 12px', color: colors.text }}>Editar partida</h3>
          <label style={{ fontSize: 12, color: colors.muted }}>Nombre</label>
          <Input value={editMatch.name} onChange={(e) => setEditMatch({ ...editMatch, name: e.target.value })} style={styles.input} />
          <label style={{ fontSize: 12, color: colors.muted }}>ID de juego</label>
          <Input value={editMatch.game_id || ''} onChange={(e) => setEditMatch({ ...editMatch, game_id: e.target.value })} style={styles.input} />
          <label style={{ fontSize: 12, color: colors.muted }}>Password</label>
          <Input value={editMatch.password || ''} onChange={(e) => setEditMatch({ ...editMatch, password: e.target.value })} style={styles.input} />
          <label style={{ fontSize: 12, color: colors.muted }}>Tipo</label>
          <Select value={editMatch.match_type || 'internal'} onChange={(e) => setEditMatch({ ...editMatch, match_type: e.target.value })} style={styles.input}>
            {matchTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <label style={{ fontSize: 12, color: colors.muted }}>Max jugadores</label>
          <Input type="number" value={editMatch.max_players || ''} onChange={(e) => setEditMatch({ ...editMatch, max_players: parseInt(e.target.value) || null })} style={styles.input} />
          <label style={{ fontSize: 12, color: colors.muted }}>Alianza</label>
          <Select value={editMatch.alliance_id || ''} onChange={(e) => setEditMatch({ ...editMatch, alliance_id: e.target.value })} style={styles.input}>
            <option value="">-- Sin alianza --</option>
            {alliances.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <label style={{ fontSize: 12, color: colors.muted }}>Descripcion</label>
          <TextArea rows={2} value={editMatch.description || ''} onChange={(e) => setEditMatch({ ...editMatch, description: e.target.value })} style={styles.input} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setEditMatch(null)}>Cancelar</Button>
            <Button onClick={saveMatchEdit}>Guardar</Button>
          </div>
        </Modal>
      )}

      {/* Modal: añadir registro */}
      {addReg && (
        <Modal onClose={() => setAddReg(false)}>
          <h3 style={{ margin: '0 0 12px', color: colors.text }}>Añadir jugador a la partida</h3>
          <form onSubmit={saveAddReg}>
            <label style={{ fontSize: 12, color: colors.muted }}>ID de jugador *</label>
            <Input name="player_id" type="number" required style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Username (si no existe)</label>
            <Input name="username" style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Nacion</label>
            <Input name="nation" style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Estado</label>
            <Select name="status" defaultValue="confirmed" style={styles.input}>
              <option value="confirmed">Confirmado</option><option value="pending">Pendiente</option>
              <option value="rejected">Rechazado</option><option value="approved">Aprobado</option>
            </Select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setAddReg(false)}>Cancelar</Button>
              <Button type="submit">Añadir</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: editar registro */}
      {editReg && (
        <Modal onClose={() => { setEditReg(null); setNewUid(''); }}>
          <h3 style={{ margin: '0 0 12px', color: colors.text }}>Editar registro</h3>
          {editReg.player && isPlayerSanctioned(editReg.player) && (
            <p style={{ color: colors.danger, fontSize: 12, padding: 8, borderRadius: 8, background: 'rgba(239,83,80,0.1)' }}>
              ADVERTENCIA: {getSanctionSummary(editReg.player).reason} · Restante: {getSanctionSummary(editReg.player).remainingText}
            </p>
          )}
          <form onSubmit={saveEditReg}>
            <label style={{ fontSize: 12, color: colors.muted }}>ID de jugador</label>
            <Input value={editReg.player_id} readOnly style={{ ...styles.input, opacity: 0.7 }} />
            <label style={{ fontSize: 12, color: colors.muted }}>Username</label>
            <Input name="username" defaultValue={editReg.username || ''} style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Nacion</label>
            <Input name="nation" defaultValue={editReg.nation || ''} style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Estado</label>
            <Select name="status" defaultValue={editReg.status || 'pending'} style={styles.input}>
              <option value="pending">Pendiente</option><option value="confirmed">Confirmado</option>
              <option value="approved">Aprobado</option><option value="rejected">Rechazado</option>
            </Select>
            <label style={{ fontSize: 12, color: colors.muted }}>Notas</label>
            <TextArea name="notes" rows={2} defaultValue={editReg.notes || ''} style={styles.input} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => { setEditReg(null); setNewUid(''); }}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
          {superadmin && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
              <label style={{ fontSize: 12, color: colors.muted }}>Cambiar UID (superadmin) — nuevo UID</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={newUid} onChange={(e) => setNewUid(e.target.value)} placeholder="Nuevo ID" style={{ ...styles.input, flex: 1, marginBottom: 0 }} />
                <Button variant="ghost" onClick={changeUid}>Cambiar UID</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Modal: añadir/editar resultado */}
      {(addResult || editResult) && (
        <Modal onClose={() => { setAddResult(false); setEditResult(null); }}>
          <h3 style={{ margin: '0 0 12px', color: colors.text }}>{editResult ? 'Editar resultado' : 'Añadir resultado'}</h3>
          <form onSubmit={(e) => saveResult(e, editResult ?? undefined)}>
            {!editResult && (
              <>
                <label style={{ fontSize: 12, color: colors.muted }}>ID de jugador *</label>
                <Input name="player_id" type="number" required style={styles.input} />
              </>
            )}
            <label style={{ fontSize: 12, color: colors.muted }}>Bajas</label>
            <Input name="kills" type="number" defaultValue={editResult?.kills ?? 0} style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Muertes</label>
            <Input name="deaths" type="number" defaultValue={editResult?.deaths ?? 0} style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Nacion</label>
            <Input name="nation" defaultValue={editResult?.nation || ''} style={styles.input} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => { setAddResult(false); setEditResult(null); }}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: importar CSV */}
      {csvModal && (
        <Modal onClose={() => { setCsvModal(false); setCsvRows(null); }} width={560}>
          <h3 style={{ margin: '0 0 12px', color: colors.text }}>📥 Importar CSV de resultados</h3>
          <p style={{ fontSize: 12, color: colors.muted }}>Formato: <code>player_id,kills,deaths</code> (una fila por jugador, con header).</p>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleCsvFile(f); }}
            onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv'; inp.onchange = () => { const f = inp.files?.[0]; if (f) handleCsvFile(f); }; inp.click(); }}
            style={{ border: `2px dashed ${colors.border}`, borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer', color: colors.muted, fontSize: 13 }}
          >Arrastra el CSV aqui o haz clic para seleccionar</div>
          {csvRows && (
            <>
              <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 12, border: `1px solid ${colors.border}`, borderRadius: 8 }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: colors.bg }}>
                    <th style={{ textAlign: 'left', padding: 8, color: colors.muted }}>Player ID</th>
                    <th style={{ textAlign: 'right', padding: 8, color: colors.muted }}>Kills</th>
                    <th style={{ textAlign: 'right', padding: 8, color: colors.muted }}>Deaths</th>
                  </tr></thead>
                  <tbody>{csvRows.map((r) => (
                    <tr key={r.player_id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: 6 }}>{r.player_id}</td>
                      <td style={{ padding: 6, textAlign: 'right', color: colors.success }}>{r.kills}</td>
                      <td style={{ padding: 6, textAlign: 'right', color: colors.danger }}>{r.deaths}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: colors.muted }}>{csvRows.length} filas listas para importar (upsert por match_id+player_id).</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => { setCsvModal(false); setCsvRows(null); }}>Cancelar</Button>
                <Button onClick={confirmCsvImport}>Importar {csvRows.length} resultados</Button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Modal: ganadores */}
      {winnersModal && (
        <Modal onClose={() => setWinnersModal(false)} width={520}>
          <h3 style={{ margin: '0 0 12px', color: colors.text }}>🏆 Declarar ganadores</h3>
          <p style={{ fontSize: 12, color: colors.muted }}>Marca los ganadores en orden (el primero marcado queda #1). Se guardan en match_winners y se marca la partida.</p>
          {(sortedResults ?? []).filter((r) => regIds.has(r.player_id)).map((r) => (
            <label key={r.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: colors.bg, marginBottom: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={winnerPicks.includes(r.player_id)}
                onChange={(e) => setWinnerPicks((prev) => e.target.checked ? [...prev, r.player_id] : prev.filter((x) => x !== r.player_id))}
              />
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.accent, width: 24 }}>#{winnerPicks.indexOf(r.player_id) >= 0 ? winnerPicks.indexOf(r.player_id) + 1 : '-'}</span>
              <span style={{ flex: 1, fontSize: 13, color: colors.text }}>{r.username || `Jugador ${r.player_id}`}</span>
              <span style={{ fontSize: 11, color: colors.muted }}>{r.kills} bajas / {r.deaths} muertes</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button variant="ghost" onClick={() => setWinnersModal(false)}>Cancelar</Button>
            <Button onClick={saveWinners}>Guardar ganadores</Button>
          </div>
        </Modal>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 8, fontSize: 13, zIndex: 200, background: colors.info, color: colors.bg, fontWeight: 600 }}>{toast}</div>
      )}
    </div>
  );
}

function miniBtn(color: string): React.CSSProperties {
  return { background: `${color}22`, border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 12, color };
}

export default function AdminMatchDetailPage() {
  return (
    <AdminGate>
      <MatchDetail />
    </AdminGate>
  );
}
