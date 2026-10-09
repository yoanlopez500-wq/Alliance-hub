import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { fetchKdRows, ApiImportRateLimited, apiImportRemaining, markApiImport } from '../../lib/apiImport';
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
import MatchQuestions from '../match/MatchQuestions';
import { ResponsiblesManager } from '../match/MatchResponsibles';

const SORT_KEY = 'ah2_match_results_sort';

type Match = { id: string; name: string; description: string | null; status: string; match_type: string | null; alliance_id: string | null; game_id: string | null; password: string | null; max_players: number | null; created_at: string; csv_imported: boolean; winners_declared: boolean; is_private: boolean; share_token: string | null; requires_approval: boolean; is_official: boolean; use_global_rules: boolean; rules_alliance_id: string | null; custom_rules_text: string | null; use_teams: boolean };
type Reg = { id: string; player_id: number; nation: string | null; status: string; notes: string | null; registered_at: string; username?: string; player?: PlayerSanctionState & { current_username?: string } };
type Result = { id: string; player_id: number; nation: string | null; kills: number; deaths: number; kd_ratio: number; username?: string };

function Modal({ onClose, children, width = 480, zIndex = 100 }: { onClose: () => void; children: React.ReactNode; width?: number; zIndex?: number }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex, padding: 16 }}>
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

  // Jurisdiccion de liderazgo sobre ESTA partida (sin ser staff): el lider
  // (admin_users.alliance_id) o un oficial co-lider (alliance_officers).
  // El RLS refuerza la frontera: solo partidas internas de su alianza.
  const [myOfficer, setMyOfficer] = useState<{ alliance_id: string; role: string } | null>(null);
  useEffect(() => {
    if (staff || admin) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await publicDb.auth.getSession();
        const uid = data.session?.user.id;
        if (!uid) return;
        const { data: off } = await publicDb.from('alliance_officers')
          .select('alliance_id, role').eq('auth_user_id', uid).eq('is_active', true).limit(1).maybeSingle();
        if (!cancelled && off) setMyOfficer(off as { alliance_id: string; role: string });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [staff, admin]);

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
  const [csvSource, setCsvSource] = useState<'csv' | 'api'>('csv');
  // Desglose por unidad del ultimo import API (jugador_id -> unidades).
  // Solo la API lo trae; el CSV manual no. Se guarda al confirmar el import.
  const apiUnitsRef = useRef<Map<number, import('../../lib/apiImport').ApiImportUnit[]> | null>(null);
  const [apiBusy, setApiBusy] = useState(false);
  const [winnersModal, setWinnersModal] = useState(false);
  const [winnerPicks, setWinnerPicks] = useState<number[]>([]);

  // Catalogo de secciones del reglamento para copiar como texto en las reglas
  // exclusivas de la partida (global + reglamento de la alianza elegida).
  const [ruleCatalog, setRuleCatalog] = useState<{ id: string; title: string; content: string; origin: string }[]>([]);
  const [pickedRule, setPickedRule] = useState('');
  const [customNew, setCustomNew] = useState('');
  // Aviso temporal al añadir una seccion del reglamento al texto (evita
  // dobles clics que duplican la seccion).
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const flashAdded = (title: string) => {
    setAddedMsg(`✓ Se añadió: ${title}`);
    window.setTimeout(() => setAddedMsg((m) => (m && m.includes(title) ? null : m)), 2500);
  };

  // Selector visual: leer el reglamento completo, marcar/desmarcar clausulas,
  // ordenarlas y pegarlas de golpe como texto (insertando donde este el cursor).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'new' | 'edit'>('new');
  const [pickerPicks, setPickerPicks] = useState<Record<string, boolean>>({});
  const [pickerOrder, setPickerOrder] = useState<string[]>([]);
  const [cursorNew, setCursorNew] = useState<number | null>(null);
  const [cursorEdit, setCursorEdit] = useState<number | null>(null);

  // Jurisdiccion de liderazgo sobre ESTA partida (sin ser staff): el lider
  // (admin_users.alliance_id) o un oficial co-lider (alliance_officers).
  // El RLS refuerza la frontera: solo partidas internas de su alianza.
  const matchAllianceId = match?.alliance_id ?? null;
  const isLeaderOfMatch = !staff && !!matchAllianceId && !!admin && admin.alliance_id === matchAllianceId;
  // Solo co-lideres gestionan partidas (mismo criterio que el RLS
  // matches_update_coleader / match_results para no-staff). Un oficial
  // "officer" a secas queda en lectura.
  const isOfficerOfMatch = !staff && !admin && !!matchAllianceId && myOfficer?.alliance_id === matchAllianceId && myOfficer?.role === 'co_leader';
  const canManage = staff || isLeaderOfMatch || isOfficerOfMatch;
  // Partida interna (excluida de rankings globales): los managers no-staff
  // solo tocan resultados/ganadores en internas; en globales, solo staff.
  const matchTypeScope = match ? matchTypes.find((t) => t.id === match.match_type)?.scope : undefined;
  const isInternal = !!matchTypeScope && matchTypeScope !== 'global';
  // Puede tocar resultados/ganadores: staff siempre; liderazgo solo en internas.
  const canTouchResults = staff || (canManage && isInternal);
  // Inscripciones: staff siempre; el lider (fila admin_users) en las de su
  // alianza; el co-lider oficial solo en internas (misma frontera que el RLS).
  const canEditRegs = staff || isLeaderOfMatch || (isOfficerOfMatch && isInternal);

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

  // Catalogo de reglas: globales + las de la alianza elegida en las reglas.
  // Se recarga al abrir el modal de edicion o cambiar la alianza de reglas.
  const loadRuleCatalog = useCallback(async (aid: string | null) => {
    const out: { id: string; title: string; content: string; origin: string }[] = [];
    const { data: g } = await publicDb.from('rule_sections').select('id, title, content').is('alliance_id', null).eq('is_active', true).order('order_index');
    (g as { id: string; title: string; content: string }[] | null)?.forEach((s) => out.push({ id: s.id, title: s.title, content: s.content, origin: '📜 General' }));
    if (aid) {
      const { data: a } = await publicDb.from('rule_sections').select('id, title, content').eq('alliance_id', aid).eq('is_active', true).order('order_index');
      (a as { id: string; title: string; content: string }[] | null)?.forEach((s) => out.push({ id: `al_${s.id}`, title: s.title, content: s.content, origin: '🛡 Alianza' }));
    }
    setRuleCatalog(out);
  }, []);
  useEffect(() => { loadRuleCatalog(editMatch?.rules_alliance_id ?? null); }, [editMatch?.rules_alliance_id, loadRuleCatalog]);

  // Pegar una seccion del reglamento como texto en las reglas exclusivas.
  const appendRulesText = (current: string | null, title: string, content: string) =>
    `${current ? current.trimEnd() + '\n\n' : ''}## ${title}\n${content}\n`;
  const appendAllRules = (current: string | null) =>
    ruleCatalog.reduce((acc, r) => appendRulesText(acc, r.title, r.content), current ?? '');
  // Insertar donde este el cursor; sin cursor conocido, al principio (no al final).
  const insertRulesAtCursor = (current: string, text: string, cursor: number | null) => {
    if (cursor !== null && cursor >= 0 && cursor <= current.length) {
      return current.slice(0, cursor) + text + current.slice(cursor);
    }
    return text + (current ? '\n\n' + current : '');
  };
  const resetPicker = (target: 'new' | 'edit') => {
    setPickerTarget(target);
    setPickerPicks({});
    setPickerOrder([]);
    setPickerOpen(true);
  };
  const movePicked = (id: string, dir: -1 | 1) => {
    setPickerOrder((o) => {
      const i = o.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const c = [...o];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  };
  const confirmPicker = () => {
    const text = pickerOrder
      .map((id) => { const r = ruleCatalog.find((x) => x.id === id); return r ? `## ${r.title}\n${r.content}\n` : ''; })
      .filter(Boolean)
      .join('\n');
    if (!text) return;
    if (pickerTarget === 'edit' && editMatch) {
      setEditMatch({ ...editMatch, custom_rules_text: insertRulesAtCursor(editMatch.custom_rules_text ?? '', text, cursorEdit) });
    } else {
      setCustomNew((c) => insertRulesAtCursor(c, text, cursorNew));
    }
    flashAdded(`${pickerOrder.length} sección(es)`);
    setPickerOpen(false);
  };

  // Modal selector de secciones: lista completa legible + checkboxes + orden.
  const rulesPicker = pickerOpen ? (
    <Modal onClose={() => setPickerOpen(false)} width={640} zIndex={200}>
      <h3 style={{ margin: '0 0 6px', color: colors.text }}>☑️ Seleccionar secciones del reglamento</h3>
      <p style={{ fontSize: 12, color: colors.muted, margin: '0 0 10px' }}>
        Marca las cláusulas que aplican a esta partida. Léelas completas aquí, ordénalas con ↑ ↓ y se insertarán como texto editable donde tuvieras el cursor (o al principio).
      </p>
      {pickerOrder.length > 0 && (
        <div style={{ marginBottom: 10, padding: 8, borderRadius: 8, background: colors.bg, border: `1px solid ${colors.border}` }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: colors.text }}>Orden ({pickerOrder.length}):</p>
          {pickerOrder.map((id) => {
            const r = ruleCatalog.find((x) => x.id === id);
            if (!r) return null;
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.text, marginBottom: 4 }}>
                <span style={{ flex: 1 }}>• {r.title}</span>
                <Button type="button" variant="ghost" style={{ padding: '2px 8px' }} onClick={() => movePicked(id, -1)}>↑</Button>
                <Button type="button" variant="ghost" style={{ padding: '2px 8px' }} onClick={() => movePicked(id, 1)}>↓</Button>
                <Button type="button" variant="ghost" style={{ padding: '2px 8px' }}
                  onClick={() => { setPickerPicks((p) => ({ ...p, [id]: false })); setPickerOrder((o) => o.filter((x) => x !== id)); }}>✕</Button>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ maxHeight: '45vh', overflowY: 'auto', marginBottom: 10 }}>
        {ruleCatalog.map((r) => (
          <div key={r.id} style={{ marginBottom: 10, padding: 8, borderRadius: 8, background: colors.bg, border: `1px solid ${colors.border}` }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: colors.text, cursor: 'pointer', margin: 0 }}>
              <input type="checkbox" checked={!!pickerPicks[r.id]}
                onChange={(e) => {
                  const on = e.target.checked;
                  setPickerPicks((p) => ({ ...p, [r.id]: on }));
                  setPickerOrder((o) => (on ? [...o, r.id] : o.filter((x) => x !== r.id)));
                }} />
              <strong>{r.origin} · {r.title}</strong>
            </label>
            {r.content && <p style={{ fontSize: 12, color: colors.muted, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{r.content}</p>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={() => setPickerOpen(false)}>Cancelar</Button>
        <Button onClick={confirmPicker} disabled={!pickerOrder.length}>
          Insertar{pickerOrder.length ? ` ${pickerOrder.length} sección(es)` : ''}
        </Button>
      </div>
    </Modal>
  ) : null;

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
      use_global_rules: fd.get('use_global_rules') === 'on',
      use_teams: fd.get('use_teams') === 'on',
      rules_alliance_id: String(fd.get('rules_alliance_id') || '') || null,
      custom_rules_text: customNew.trim() || null,
      status: 'draft',
      created_by: admin?.id,
      // Oficial = arbitraje staff; el trigger rechaza a no-staff de todos modos.
      is_official: staff ? fd.get('is_official') === 'on' : false,
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
      is_official: editMatch.is_official,
      use_global_rules: editMatch.use_global_rules,
      rules_alliance_id: editMatch.rules_alliance_id,
      custom_rules_text: editMatch.custom_rules_text,
      use_teams: editMatch.use_teams,
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
    if (!canTouchResults) { say(staff ? 'Sin permiso' : 'Los resultados de partidas globales solo los edita el staff'); return; }
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
    if (!canTouchResults) { say(staff ? 'Sin permiso' : 'Los resultados de partidas globales solo los edita el staff'); return; }
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
      setCsvSource('csv');
      setCsvRows(rows);
    };
    reader.readAsText(f);
  }

  // ---- Importacion por API (kd-excel-proxy, rate limit GLOBAL 15s server-side) ----
  async function runApiImport() {
    const gid = (match?.game_id || '').trim() || window.prompt('ID de partida en Supremacy (game_id):')?.trim() || '';
    if (!gid || !/^\d+$/.test(gid)) { say('ID de partida invalido (solo numeros)'); return; }
    const remaining = apiImportRemaining();
    if (remaining > 0) { say(`Cuenta atras global: espera ${remaining}s`); return; }
    setApiBusy(true);
    try {
      const rows = await fetchKdRows(gid);
      markApiImport();
      setCsvSource('api');
      apiUnitsRef.current = new Map(rows.map((r) => [r.player_id, r.units ?? []]));
      setCsvRows(rows.map((r) => ({ player_id: r.player_id, kills: r.kills, deaths: r.deaths })));
      setCsvModal(true);
      say(`API: ${rows.length} jugadores (bots excluidos)`);
    } catch (e: any) {
      if (e instanceof ApiImportRateLimited) say(e.message);
      else say('API: ' + (e?.message ?? e));
    } finally {
      setApiBusy(false);
    }
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
      // Desglose por unidad (solo si vino de la API): reemplazo total de la
      // partida para reflejar el ultimo estado del exportador.
      const unitMap = apiUnitsRef.current;
      if (unitMap) {
        const flat: { match_id: string; player_id: number; unit_key: string; kills: number; deaths: number }[] = [];
        unitMap.forEach((units, pid) => units.forEach((u) => flat.push({ match_id: matchId, player_id: pid, unit_key: u.unit_key, kills: u.kills, deaths: u.deaths })));
        await publicDb.from('match_result_units').delete().eq('match_id', matchId);
        for (let i = 0; i < flat.length; i += 500) {
          const { error: uErr } = await publicDb.from('match_result_units').insert(flat.slice(i, i + 500));
          if (uErr) throw uErr;
        }
        apiUnitsRef.current = null;
      }
      const regRes = await ensureRegs(csvRows);
      let msg = `${csvSource === 'api' ? 'API' : 'CSV'} importado: ${csvRows.length} jugadores`;
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
      <>
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
          <div style={{ margin: '10px 0 4px', padding: 10, borderRadius: 8, background: colors.bg, border: `1px solid ${colors.border}` }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: colors.text }}>📜 Reglas de la partida</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', fontSize: 13, color: colors.text, cursor: 'pointer' }}>
              <input type="checkbox" name="use_global_rules" defaultChecked />
              Incluir reglamento general de AllianceHub
            </label>
            <label style={{ fontSize: 12, color: colors.muted }}>Reglamento de alianza (opcional)</label>
            <Select name="rules_alliance_id" defaultValue="" style={{ ...styles.input, marginBottom: 8 }}
              onChange={(e) => loadRuleCatalog(e.target.value || null)}>
              <option value="">-- Ninguno --</option>
              {alliances.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <label style={{ fontSize: 12, color: colors.muted }}>Añadir del reglamento (se copia como texto, editable después)</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <Select value={pickedRule} onChange={(e) => setPickedRule(e.target.value)} style={{ ...styles.input, flex: 1, marginBottom: 0 }}>
                <option value="">-- Elige sección --</option>
                {ruleCatalog.map((r) => <option key={r.id} value={r.id}>{r.origin} · {r.title}</option>)}
              </Select>
              <Button type="button" variant="ghost" disabled={!pickedRule}
                onClick={() => {
                  const r = ruleCatalog.find((x) => x.id === pickedRule);
                  if (r) { setCustomNew((c) => appendRulesText(c, r.title, r.content)); flashAdded(r.title); }
                }}>➕ Añadir</Button>
            </div>
            {addedMsg && <p style={{ fontSize: 12, color: colors.success, margin: '0 0 6px' }}>{addedMsg}</p>}
            <Button type="button" variant="ghost" style={{ marginBottom: 8 }} disabled={!ruleCatalog.length}
              onClick={() => { setCustomNew((c) => appendAllRules(c)); flashAdded('todo el reglamento'); }}>📥 Añadir todo el reglamento</Button>
            <Button type="button" variant="ghost" style={{ marginBottom: 8 }} disabled={!ruleCatalog.length}
              onClick={() => resetPicker('new')}>☑️ Seleccionar del reglamento…</Button>
            <label style={{ fontSize: 12, color: colors.muted }}>Reglas exclusivas de esta partida (texto libre, opcional)</label>
            <TextArea rows={4} value={customNew} onChange={(e) => setCustomNew(e.target.value)}
              onSelect={(e) => setCursorNew(e.currentTarget.selectionStart)}
              onClick={(e) => setCursorNew(e.currentTarget.selectionStart)}
              placeholder={'Ej: prohibido oro desde el dia 10...\nUsa "Seleccionar del reglamento" para marcar clausulas y pegarlas donde quieras.'} style={styles.input} />
          </div>
          {staff && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px', fontSize: 13, color: colors.text, cursor: 'pointer' }}>
              <input type="checkbox" name="is_official" />
              🏛 Oficial AllianceHub (arbitrada por staff, cuenta en el ranking oficial)
            </label>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px', fontSize: 13, color: colors.text, cursor: 'pointer' }}>
            <input type="checkbox" name="use_teams" />
            🛡 Usar equipos en esta partida (los jugadores podrán elegir equipo)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit">Crear partida</Button>
            <Link to="/admin/partidas" style={{ ...styles.btnGhost, padding: '10px 18px', textDecoration: 'none' }}>Cancelar</Link>
          </div>
        </form>
      </Reveal>
      {rulesPicker}
      </>
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
                {match.is_official && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,213,79,0.15)', color: colors.warning }}>🏛 Oficial</span>}
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
          {match.use_teams ? (
            <TeamsSection matchId={match.id} canManage={canManage} regs={regs ?? []} say={say} />
          ) : canManage ? (
            <p style={{ marginTop: 10, fontSize: 12, color: colors.muted }}>🛡 Esta partida no usa equipos. Actívalo en "Editar partida" para crear equipos y asignar jugadores.</p>
          ) : null}
          {staff && (
            <ResponsiblesManager matchId={match.id} onSaved={say} />
          )}
          <div style={{ marginTop: 14, borderTop: `1px dashed ${colors.border}`, paddingTop: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: colors.text }}>
              ❓ Preguntas de los jugadores
              {canManage ? <span style={{ fontWeight: 400, fontSize: 12, color: colors.muted }}> — respondes desde aquí; los jugadores ven la respuesta al instante en la ficha de la partida.</span> : null}
            </p>
            <MatchQuestions matchId={match.id} matchOpen={match.status === 'open'} canModerate={canManage} />
          </div>
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

      {canManage && (
        <Reveal>
          <div style={{ ...styles.card, marginTop: 14 }}>
            <h3 style={{ margin: '0 0 10px', color: colors.text }}>🛠️ Acciones de {staff ? 'admin' : 'gestión de la alianza'}</h3>
            {!staff && !isInternal && (
              <p style={{ fontSize: 12, color: colors.info, margin: '0 0 10px' }}>
                Partida de scope global: puedes gestionar la partida, pero resultados y ganadores los declara el staff.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {match.status === 'draft' && <Button onClick={() => updateStatus('open')}>Abrir registro</Button>}
              {match.status === 'open' && <Button onClick={() => updateStatus('in_progress')}>Iniciar partida</Button>}
              {match.status === 'in_progress' && <Button onClick={() => updateStatus('finished')}>Finalizar</Button>}
              <Button variant="ghost" onClick={() => setEditMatch({ ...match })}>Editar</Button>
              {canTouchResults && (
                <>
                  <Button variant="ghost" onClick={() => setCsvModal(true)}>📥 Importar CSV</Button>
                  <Button variant="ghost" disabled={apiBusy} onClick={runApiImport}>{apiBusy ? '⏳ Descargando...' : '📡 Importar por API'}</Button>
                  <Button variant="ghost" onClick={() => { setWinnerPicks([]); setWinnersModal(true); }}>🏆 Declarar ganadores</Button>
                </>
              )}
              <Button variant="danger" onClick={deleteMatch}>🗑 Eliminar</Button>
            </div>
          </div>
        </Reveal>
      )}

      <Reveal>
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ color: colors.text, margin: 0 }}>📝 Registrados ({regs?.length ?? 0})</h3>
            {canEditRegs && <Button onClick={() => setAddReg(true)}>+ Añadir</Button>}
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
                ...(canEditRegs ? [{ key: 'actions', header: '', render: (r: Reg) => (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditReg({ ...r })} title="Editar" style={miniBtn(colors.info)}>✎</button>
                    <button onClick={() => deleteReg(r)} title="Eliminar" style={miniBtn(colors.danger)}>🗑</button>
                    <button onClick={() => window.open(staff
                      ? `/admin/strikes?prefill_player=${r.player_id}&prefill_match=${matchId}`
                      : `/alianza/sanciones?prefill_player=${r.player_id}`, '_blank')} title="Sancionar" style={miniBtn(colors.warning)}>⚡</button>
                  </span>
                ) }] : []),
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
              {canTouchResults && <Button onClick={() => setAddResult(true)}>+ Añadir</Button>}
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
                ...(canTouchResults ? [{ key: 'actions', header: '', render: (r: Result) => (
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

      {rulesPicker}

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
          {/* Tipo de partida: solo staff puede cambiarlo (el trigger guard_match_type_change
              lo bloquearia para no-staff de todos modos). Sin el select, match_type
              viaja intacto al guardar. */}
          {staff ? (
            <>
              <label style={{ fontSize: 12, color: colors.muted }}>Tipo</label>
              <Select value={editMatch.match_type || 'internal'} onChange={(e) => setEditMatch({ ...editMatch, match_type: e.target.value })} style={styles.input}>
                {matchTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              {/* Solo staff: marca de arbitraje oficial (entra al ranking oficial). */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 4px', fontSize: 13, color: colors.text, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!editMatch.is_official}
                  onChange={(e) => setEditMatch({ ...editMatch, is_official: e.target.checked })} />
                🏛 Oficial AllianceHub (arbitrada por staff, cuenta en el ranking oficial)
              </label>
            </>
          ) : null}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 4px', fontSize: 13, color: colors.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!editMatch.use_teams}
              onChange={(e) => setEditMatch({ ...editMatch, use_teams: e.target.checked })} />
            🛡 Usar equipos en esta partida (los jugadores podrán elegir equipo)
          </label>
          <label style={{ fontSize: 12, color: colors.muted }}>Max jugadores</label>
          <Input type="number" value={editMatch.max_players || ''} onChange={(e) => setEditMatch({ ...editMatch, max_players: parseInt(e.target.value) || null })} style={styles.input} />
          <label style={{ fontSize: 12, color: colors.muted }}>Alianza</label>
          <Select value={editMatch.alliance_id || ''} onChange={(e) => setEditMatch({ ...editMatch, alliance_id: e.target.value })} style={styles.input}>
            <option value="">-- Sin alianza --</option>
            {alliances.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <label style={{ fontSize: 12, color: colors.muted }}>Descripcion</label>
          <TextArea rows={2} value={editMatch.description || ''} onChange={(e) => setEditMatch({ ...editMatch, description: e.target.value })} style={styles.input} />
          <div style={{ margin: '10px 0 4px', padding: 10, borderRadius: 8, background: colors.bg, border: `1px solid ${colors.border}` }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: colors.text }}>📜 Reglas de la partida</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', fontSize: 13, color: colors.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!editMatch.use_global_rules}
                onChange={(e) => setEditMatch({ ...editMatch, use_global_rules: e.target.checked })} />
              Incluir reglamento general de AllianceHub
            </label>
            <label style={{ fontSize: 12, color: colors.muted }}>Reglamento de alianza (opcional)</label>
            <Select value={editMatch.rules_alliance_id || ''} onChange={(e) => setEditMatch({ ...editMatch, rules_alliance_id: e.target.value || null })} style={{ ...styles.input, marginBottom: 8 }}>
              <option value="">-- Ninguno --</option>
              {alliances.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <label style={{ fontSize: 12, color: colors.muted }}>Añadir del reglamento (se copia como texto, editable después)</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <Select value={pickedRule} onChange={(e) => setPickedRule(e.target.value)} style={{ ...styles.input, flex: 1, marginBottom: 0 }}>
                <option value="">-- Elige sección --</option>
                {ruleCatalog.map((r) => <option key={r.id} value={r.id}>{r.origin} · {r.title}</option>)}
              </Select>
              <Button type="button" variant="ghost" disabled={!pickedRule}
                onClick={() => {
                  const r = ruleCatalog.find((x) => x.id === pickedRule);
                  if (r) { setEditMatch({ ...editMatch, custom_rules_text: appendRulesText(editMatch.custom_rules_text, r.title, r.content) }); flashAdded(r.title); }
                }}>➕ Añadir</Button>
            </div>
            {addedMsg && <p style={{ fontSize: 12, color: colors.success, margin: '0 0 6px' }}>{addedMsg}</p>}
            <Button type="button" variant="ghost" style={{ marginBottom: 8 }} disabled={!ruleCatalog.length}
              onClick={() => { setEditMatch({ ...editMatch, custom_rules_text: appendAllRules(editMatch.custom_rules_text) }); flashAdded('todo el reglamento'); }}>📥 Añadir todo el reglamento</Button>
            <Button type="button" variant="ghost" style={{ marginBottom: 8 }} disabled={!ruleCatalog.length}
              onClick={() => resetPicker('edit')}>☑️ Seleccionar del reglamento…</Button>
            <label style={{ fontSize: 12, color: colors.muted }}>Reglas exclusivas de esta partida (texto libre, opcional)</label>
            <TextArea rows={4} value={editMatch.custom_rules_text || ''} onChange={(e) => setEditMatch({ ...editMatch, custom_rules_text: e.target.value || null })}
              onSelect={(e) => setCursorEdit(e.currentTarget.selectionStart)}
              onClick={(e) => setCursorEdit(e.currentTarget.selectionStart)}
              style={styles.input} />
          </div>
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
        <Modal onClose={() => { setCsvModal(false); setCsvRows(null); apiUnitsRef.current = null; }} width={560}>
          <h3 style={{ margin: '0 0 12px', color: colors.text }}>{csvSource === 'api' ? '📡 Importar por API (resultados)' : '📥 Importar CSV de resultados'}</h3>
          {csvSource === 'api' ? (
            <p style={{ fontSize: 12, color: colors.muted }}>
              Datos descargados del exportador externo. Bots (UID {'<='} 0) excluidos automaticamente.
              Rate limit global: 1 descarga cada 15 s como minimo (seguridad).
            </p>
          ) : (
            <p style={{ fontSize: 12, color: colors.muted }}>Formato: <code>player_id,kills,deaths</code> (una fila por jugador, con header).</p>
          )}
          {csvSource !== 'api' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleCsvFile(f); }}
            onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv'; inp.onchange = () => { const f = inp.files?.[0]; if (f) handleCsvFile(f); }; inp.click(); }}
            style={{ border: `2px dashed ${colors.border}`, borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer', color: colors.muted, fontSize: 13 }}
          >Arrastra el CSV aqui o haz clic para seleccionar</div>
          )}
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
                <Button variant="ghost" onClick={() => { setCsvModal(false); setCsvRows(null); apiUnitsRef.current = null; }}>Cancelar</Button>
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
    <AdminGate allowManagers>
      <MatchDetail />
    </AdminGate>
  );
}

// ---- Sección de equipos de la partida ----
type Team = { id: string; match_id: string; name: string; color: string | null; sort_order: number; max_members: number | null };
type TeamMember = { team_id: string; player_id: number; added_by: string };

function TeamsSection({ matchId, canManage, regs, say }: { matchId: string; canManage: boolean; regs: Reg[]; say: (t: string) => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [newName, setNewName] = useState('');
  const [newMax, setNewMax] = useState('');
  const [editing, setEditing] = useState<Record<string, { name: string; max_members: string }>>({});
  const [picks, setPicks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [{ data: t }, { data: m }] = await Promise.all([
      publicDb.from('match_teams').select('*').eq('match_id', matchId).order('sort_order'),
      publicDb.from('match_team_members').select('team_id, player_id, added_by').eq('match_id', matchId),
    ]);
    setTeams((t as Team[] | null) ?? []);
    setMembers((m as TeamMember[] | null) ?? []);
  }, [matchId]);
  useEffect(() => { load(); }, [load]);

  const regName = (pid: number) => {
    const r = regs.find((x) => x.player_id === pid);
    return r?.player?.current_username ?? r?.username ?? `#${pid}`;
  };
  const teamCount = (tid: string) => members.filter((m) => m.team_id === tid).length;
  const regOptions = regs.filter((r) => ['confirmed', 'approved', 'pending'].includes(r.status));

  async function addTeam() {
    const name = newName.trim();
    if (!name) { say('Nombre de equipo obligatorio'); return; }
    const { error } = await publicDb.from('match_teams').insert({ match_id: matchId, name, max_members: parseInt(newMax) || null, sort_order: teams.length });
    if (error) { say('Error: ' + error.message); return; }
    say('Equipo creado'); setNewName(''); setNewMax(''); load();
  }
  async function saveTeam(t: Team) {
    const e = editing[t.id];
    if (!e) return;
    const { error } = await publicDb.from('match_teams').update({ name: e.name, max_members: parseInt(e.max_members) || null }).eq('id', t.id);
    if (error) { say('Error: ' + error.message); return; }
    say('Equipo actualizado'); setEditing((s) => { const c = { ...s }; delete c[t.id]; return c; }); load();
  }
  async function removeTeam(t: Team) {
    if (!window.confirm(`¿Eliminar el equipo "${t.name}" y sacar a sus miembros?`)) return;
    const { error } = await publicDb.from('match_teams').delete().eq('id', t.id);
    if (error) { say('Error: ' + error.message); return; }
    say('Equipo eliminado'); load();
  }
  async function assignPlayer(teamId: string) {
    const pid = parseInt(picks[teamId] || '', 10);
    if (!pid) { say('Elige un jugador'); return; }
    // Si el jugador ya estaba en otro equipo, el trigger/UNIQUE lo bloquea con
    // mensaje claro; el staff debe quitarlo primero (o usar el auto-movimiento
    // del propio jugador desde la página de la partida).
    const { error } = await publicDb.from('match_team_members').insert({ match_id: matchId, team_id: teamId, player_id: pid, added_by: 'admin' });
    if (error) { say('Error: ' + error.message); return; }
    say('Jugador asignado'); setPicks((p) => ({ ...p, [teamId]: '' })); load();
  }
  async function removeMember(teamId: string, pid: number) {
    const { error } = await publicDb.from('match_team_members').delete().eq('team_id', teamId).eq('player_id', pid);
    if (error) { say('Error: ' + error.message); return; }
    load();
  }

  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: colors.bg, border: `1px solid ${colors.border}` }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 14, color: colors.text }}>🛡 Equipos</h3>
      {teams.length === 0 && <p style={{ fontSize: 12, color: colors.muted, margin: '0 0 8px' }}>Aún no hay equipos en esta partida.</p>}
      {teams.map((t) => {
        const e = editing[t.id];
        const full = t.max_members !== null && teamCount(t.id) >= t.max_members;
        return (
          <div key={t.id} style={{ marginBottom: 10, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${full ? colors.warning : colors.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: colors.text }}>
                {t.color ? <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: t.color, marginRight: 6 }} /> : null}
                {t.name}
                <span style={{ fontWeight: 400, color: full ? colors.warning : colors.muted }}> · {teamCount(t.id)}{t.max_members !== null ? `/${t.max_members}` : ''}{full ? ' (lleno)' : ''}</span>
              </span>
              {canManage && !e && <Button variant="ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setEditing({ ...editing, [t.id]: { name: t.name, max_members: t.max_members ? String(t.max_members) : '' } })}>✏️</Button>}
              {canManage && !e && <Button variant="ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => removeTeam(t)}>🗑</Button>}
            </div>
            {canManage && e && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <Input value={e.name} onChange={(ev) => setEditing({ ...editing, [t.id]: { ...e, name: ev.target.value } })} style={{ ...styles.input, flex: 2, minWidth: 120 }} />
                <Input type="number" min={1} placeholder="Límite (vacío = sin límite)" value={e.max_members} onChange={(ev) => setEditing({ ...editing, [t.id]: { ...e, max_members: ev.target.value } })} style={{ ...styles.input, flex: 2, minWidth: 140 }} />
                <Button style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => saveTeam(t)}>Guardar</Button>
                <Button variant="ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setEditing((s) => { const c = { ...s }; delete c[t.id]; return c; })}>Cancelar</Button>
              </div>
            )}
            {members.filter((m) => m.team_id === t.id).map((m) => (
              <div key={m.player_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.text, marginBottom: 3 }}>
                <span style={{ flex: 1 }}>• {regName(m.player_id)}{m.added_by === 'player' ? <span style={{ color: colors.muted }}> (se apuntó solo)</span> : null}</span>
                {canManage && <Button variant="ghost" style={{ padding: '0 6px', fontSize: 12 }} onClick={() => removeMember(t.id, m.player_id)}>✕</Button>}
              </div>
            ))}
            {canManage && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <Select value={picks[t.id] || ''} onChange={(ev) => setPicks({ ...picks, [t.id]: ev.target.value })} style={{ ...styles.input, flex: 1, marginBottom: 0 }}>
                  <option value="">-- Asignar jugador registrado --</option>
                  {regOptions.map((r) => {
                    const inTeam = members.find((m) => m.player_id === r.player_id)?.team_id;
                    return <option key={r.player_id} value={r.player_id}>{regName(r.player_id)}{inTeam ? ` (en ${teams.find((x) => x.id === inTeam)?.name ?? 'otro equipo'})` : ''}</option>;
                  })}
                </Select>
                <Button style={{ padding: '6px 10px', fontSize: 12 }} disabled={full} onClick={() => assignPlayer(t.id)}>➕</Button>
              </div>
            )}
          </div>
        );
      })}
      {canManage && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <Input placeholder="Nombre del nuevo equipo" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ ...styles.input, flex: 2, minWidth: 140 }} />
          <Input type="number" min={1} placeholder="Límite (vacío = sin límite)" value={newMax} onChange={(e) => setNewMax(e.target.value)} style={{ ...styles.input, flex: 2, minWidth: 140 }} />
          <Button onClick={addTeam}>Crear equipo</Button>
        </div>
      )}
    </div>
  );
}
