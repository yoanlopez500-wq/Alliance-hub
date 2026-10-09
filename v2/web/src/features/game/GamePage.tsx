import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { publicDb, getSessionToken } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { usePlayerSession } from '../../lib/playerSession';
import {
  getSanctionSummary, isPlayerSanctioned, hasRuleConsent, setRuleConsent,
  type PlayerSanctionState,
} from '../../lib/sanctions';
import { compareMatchResults } from '../../lib/ranking';
import { colors, styles } from '../../theme';
import { formatDate, STATUS_LABELS, STATUS_COLORS, TYPE_LABELS, badgeStyle } from '../../lib/format';
import { MatchTypeBadge } from '../../lib/matchTypes';
import Loader from '../../components/Loader';
import MatchQuestions from '../match/MatchQuestions';
import { ResponsiblesCard } from '../match/MatchResponsibles';
import DataTable from '../../components/DataTable';
import Button from '../../components/Button';
import Reveal from '../../components/Reveal';

type Match = {
  id: string; name: string; description: string | null; status: string;
  match_type: string | null; category: string | null; alliance_id: string | null;
  alliance_a_id: string | null; alliance_b_id: string | null;
  is_private: boolean; share_token: string | null; winners_declared: boolean;
  requires_approval: boolean; game_id: string | null; password: string | null;
  game_password: string | null; max_players: number | null; created_at: string;
  csv_imported: boolean; is_official: boolean;
  use_global_rules: boolean; rules_alliance_id: string | null; custom_rules_text: string | null;
  use_teams: boolean;
};
type Team = { id: string; name: string; color: string | null; sort_order: number; max_members: number | null };
type TeamMember = { team_id: string; player_id: number };
type Alliance = { id: string; name: string; tag: string };

/**
 * Partida (puerto de game.js v1): header, gate de privacidad por token,
 * gate de reglas (consentimiento local) antes de mostrar credenciales,
 * veredicto de sancion, ganadores/podium, registrados y resultados
 * con desempate determinista.
 */
export default function GamePage() {
  const { id: matchId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('token');
  const { session } = usePlayerSession();
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentScroll, setConsentScroll] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const { data, loading, error, reload } = useApi<{
    match: Match; alliances: Record<string, Alliance>; me: {
      regStatus: string | null; player: PlayerSanctionState | null;
    }; ruleBlocks: { heading: string; content: string }[];
      teams: Team[]; teamMembers: TeamMember[]; teamNames: Record<number, string>; teamRegs: number[];
  } | { private: true }>(async () => {
    const { data: match, error: e } = await publicDb.from('matches').select('*').eq('id', matchId).single();
    if (e || !match) throw new Error('Partida no encontrada');
    const m = match as Match;
    if (m.is_private && m.share_token !== shareToken) return { private: true };

    const ids = [m.alliance_id, m.alliance_a_id, m.alliance_b_id].filter(Boolean) as string[];
    const alliances: Record<string, Alliance> = {};
    if (ids.length) {
      const { data: als } = await publicDb.from('alliances').select('id, name, tag').in('id', ids);
      (als as Alliance[] | null)?.forEach((a) => { alliances[a.id] = a; });
    }

    const pid = session?.playerId ?? null;
    let me = { regStatus: null as string | null, player: null as PlayerSanctionState | null };
    if (pid) {
      const [{ data: reg }, { data: player }] = await Promise.all([
        publicDb.from('match_registrations').select('status').eq('match_id', matchId).eq('player_id', pid).maybeSingle(),
        publicDb.from('players').select('status, banned_until, suspended_until, suspension_reason').eq('id', pid).maybeSingle(),
      ]);
      me = { regStatus: reg?.status ?? null, player: (player as PlayerSanctionState | null) ?? null };
    }

    // Documento de reglas segun la config de la partida: global + reglamento de
    // alianza indicada + reglas exclusivas. Si nada aplica, texto generico (mismo
    // comportamiento que antes para partidas legacy sin configurar).
    type Sec = { title: string; content: string };
    const ruleBlocks: { heading: string; content: string }[] = [];
    const cfg = m as Match;
    if (cfg.use_global_rules) {
      const { data: secs } = await publicDb.from('rule_sections').select('title, content').is('alliance_id', null).eq('is_active', true).order('order_index');
      (secs as Sec[] | null)?.forEach((s) => ruleBlocks.push({ heading: `📜 ${s.title}`, content: s.content }));
    }
    if (cfg.rules_alliance_id) {
      const { data: secs } = await publicDb.from('rule_sections').select('title, content').eq('alliance_id', cfg.rules_alliance_id).eq('is_active', true).order('order_index');
      const list = (secs as Sec[] | null) ?? [];
      if (list.length) {
        const alName = alliances[cfg.rules_alliance_id]?.name;
        ruleBlocks.push({ heading: `🛡 Reglamento de ${alName ?? 'la alianza'}`, content: '' });
        list.forEach((s) => ruleBlocks.push({ heading: s.title, content: s.content }));
      }
    }
    if (cfg.custom_rules_text) {
      ruleBlocks.push({ heading: '⚔️ Reglas exclusivas de esta partida', content: cfg.custom_rules_text });
    }
    if (!ruleBlocks.length) {
      ruleBlocks.push({
        heading: '📜 Reglamento de AllianceHub',
        content: 'Al participar en las partidas de AllianceHub aceptas el reglamento completo disponible en la seccion Reglas. Las infracciones son sancionadas con strikes, penalizaciones de kills efectivas o suspensiones segun su gravedad. El uso de multicuentas, exploits o conducta toxica esta prohibido y puede resultar en ban permanente.',
      });
    }

    // Equipos de la partida (si el staff los activo)
    let teams: Team[] = [];
    let teamMembers: TeamMember[] = [];
    let teamNames: Record<number, string> = {};
    let teamRegs: number[] = [];
    if (cfg.use_teams) {
      const [{ data: t }, { data: tm }] = await Promise.all([
        publicDb.from('match_teams').select('*').eq('match_id', matchId).order('sort_order'),
        publicDb.from('match_team_members').select('team_id, player_id').eq('match_id', matchId),
      ]);
      teams = (t as Team[] | null) ?? [];
      teamMembers = (tm as TeamMember[] | null) ?? [];
      const { data: regs } = await publicDb.from('match_registrations').select('player_id').eq('match_id', matchId).in('status', ['confirmed', 'approved']);
      teamRegs = ((regs as { player_id: number }[] | null) ?? []).map((r) => r.player_id);
      const ids = [...new Set([...teamMembers.map((x) => x.player_id), ...teamRegs])];
      if (ids.length) {
        const { data: ps } = await publicDb.from('players').select('id, current_username').in('id', ids);
        (ps as { id: number; current_username: string | null }[] | null)?.forEach((p) => { teamNames[p.id] = p.current_username ?? `#${p.id}`; });
      }
    }
    return { match: m, alliances, me, ruleBlocks, teams, teamMembers, teamNames, teamRegs };
  }, [matchId, session?.playerId]);

  if (loading) return <Loader />;
  if (error) return <p style={{ color: colors.danger }}>{String(error)}</p>;
  if (!data) return null;
  if ('private' in data) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: colors.danger }}>Partida Privada</h2>
        <p style={{ color: colors.muted }}>Necesitas un enlace de invitacion.</p>
        <Link to="/partidas" style={{ color: colors.accent, fontWeight: 700 }}>&larr; Volver</Link>
      </div>
    );
  }

  const { match: m, alliances, me, ruleBlocks, teams, teamMembers, teamNames, teamRegs } = data;
  const pid = session?.playerId ?? null;
  // Huella del documento de reglas: si el staff cambia las reglas de la partida,
  // el consentimiento previo queda invalidado y hay que re-aceptar.
  const rulesFingerprint = ruleBlocks.map((b) => `${b.heading}\n${b.content}`).join('\n---\n');
  const sanctioned = isPlayerSanctioned(me.player);
  const summary = getSanctionSummary(me.player);
  const confirmed = me.regStatus === 'confirmed' || me.regStatus === 'approved';
  const isRegistered = !!me.regStatus;

  let allianceLabel = '🌐 Global';
  if (m.match_type === 'internal' && m.alliance_id && alliances[m.alliance_id]) {
    const a = alliances[m.alliance_id];
    allianceLabel = `🚩 ${a.name} [${a.tag}]`;
  } else if (m.match_type === 'duel' && m.alliance_a_id && m.alliance_b_id && alliances[m.alliance_a_id] && alliances[m.alliance_b_id]) {
    allianceLabel = `⚔️ ${alliances[m.alliance_a_id].name} vs ${alliances[m.alliance_b_id].name}`;
  }

  const showCredentials = !sanctioned && (
    m.requires_approval ? confirmed : isRegistered
  );
  const showWaiting = !sanctioned && m.requires_approval && me.regStatus === 'pending';
  const hasConsent = pid ? hasRuleConsent(pid, matchId, rulesFingerprint) : false;
  const gidClean = String(m.game_id || '').trim();
  const joinUrl = /^\d{5,}$/.test(gidClean) ? `https://www.supremacy1914.es/game.php?bust=1#/game_info/:gameID=${gidClean}` : null;

  return (
    <div>
      <Reveal>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {(() => {
            const st = STATUS_COLORS[m.status] ?? { bg: 'rgba(255,193,7,0.15)', color: '#ffd54f' };
            return <span style={badgeStyle(st.bg, st.color)}>{STATUS_LABELS[m.status] ?? m.status}</span>;
          })()}
          <MatchTypeBadge typeId={m.match_type} />
          {m.is_official && <span style={badgeStyle('rgba(255,213,79,0.15)', '#ffd54f')} title="Arbitrada por el staff de AllianceHub: cuenta en el ranking oficial">🏛 Oficial</span>}
          {(m.password || m.game_password) && <span style={badgeStyle('rgba(255,193,7,0.15)', '#ffd54f')}>🔒</span>}
          {m.requires_approval && <span style={badgeStyle('rgba(255,193,7,0.15)', '#ffd54f')}>👁 Con Aprobacion</span>}
          {m.winners_declared && <span style={badgeStyle('rgba(255,235,59,0.15)', '#ffee58')}>🏆 Ganadores</span>}
        </div>
        <h1 style={{ color: colors.text, margin: '0 0 4px' }}>{m.name}</h1>
        {m.description && <p style={{ color: colors.muted, margin: '0 0 8px' }}>{m.description}</p>}
        <p style={{ color: colors.muted, fontSize: 13 }}>
          📅 {formatDate(m.created_at)} | {allianceLabel} | 👥 Max {m.max_players}
        </p>
        <div style={{ marginTop: 12 }}>
          {m.status === 'open' && !isRegistered && !session && (
            <Link to="/login"><Button>Identifícate para registrarte</Button></Link>
          )}
          {m.status === 'open' && !isRegistered && session && (
            <Link to={`/registro?match=${m.id}`}><Button>Registrarme</Button></Link>
          )}
          {confirmed && <span style={badgeStyle('rgba(76,175,80,0.15)', colors.success)}>✓ Registrado</span>}{' '}
          {me.regStatus === 'pending' && <span style={badgeStyle('rgba(255,193,7,0.15)', '#ffd54f')}>⏳ Esperando aprobacion</span>}
        </div>
      </Reveal>

      {sanctioned && (
        <div style={{ ...styles.card, marginTop: 20, textAlign: 'center', borderColor: colors.danger }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🚫</div>
          <h2 style={{ color: colors.danger, margin: 0 }}>Cuenta restringida</h2>
          <p style={{ color: colors.muted }}>{summary.reason || 'Has recibido una sancion.'}</p>
          <p style={{ color: '#ffd54f' }}>Tiempo restante: {summary.remainingText || 'permanente'}</p>
        </div>
      )}

      {showCredentials && (
        <div style={{ ...styles.card, marginTop: 20 }} className="ah-glow">
          <h3 style={{ color: colors.text, marginTop: 0 }}>🔑 Credenciales de la partida</h3>
          {hasConsent ? (
            <>
              <p style={{ color: colors.muted }}>ID de partida: <strong style={{ color: colors.text }}>{m.game_id || '---'}</strong></p>
              <p style={{ color: colors.muted }}>Contraseña: <strong style={{ color: colors.text }}>{m.password || m.game_password || '---'}</strong></p>
              {joinUrl && <a href={joinUrl} target="_blank" rel="noreferrer"><Button>Abrir en Supremacy 1914</Button></a>}
            </>
          ) : (
            <>
              <p style={{ color: colors.muted }}>Debes aceptar el reglamento para ver las credenciales.</p>
              <Button onClick={() => setConsentOpen(true)}>Leer reglamento y aceptar</Button>
            </>
          )}
        </div>
      )}
      {showWaiting && (
        <div style={{ ...styles.card, marginTop: 20 }}>
          <p style={{ color: '#ffd54f', margin: 0 }}>⏳ Tu registro esta pendiente de aprobacion por un administrador.</p>
        </div>
      )}
      {confirmed && !sanctioned && (
        <div style={{ marginTop: 16 }}>
          <Link to={`/reportar?match_id=${m.id}`} style={{ color: colors.accent, fontWeight: 700 }}>🚨 Reportar jugador de esta partida</Link>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <Link to="/reglas" style={{ color: colors.muted }}>📜 Ver reglamento</Link>
      </div>

      {m.winners_declared && <Winners matchId={matchId} />}
      {m.use_teams && (
        <TeamsBlock
          matchId={matchId}
          teams={teams}
          members={teamMembers}
          names={teamNames}
          regs={teamRegs}
          myPlayerId={pid}
          canPick={!sanctioned && confirmed}
          reload={reload}
        />
      )}
      <div style={{ ...styles.card, marginTop: 20 }}>
        <h3 style={{ color: colors.text, marginTop: 0 }}>❓ Dudas y contactos</h3>
        <ResponsiblesCard matchId={matchId} />
        <MatchQuestions matchId={matchId} matchOpen={m.status === 'open'} canModerate={false} />
      </div>
      <Registrations matchId={matchId} />
      <Results matchId={matchId} csvImported={m.csv_imported} />

      {consentOpen && pid && (
        <RuleGateModal
          blocks={ruleBlocks}
          scrolled={consentScroll}
          onScroll={() => setConsentScroll(true)}
          checked={consentChecked}
          onCheck={setConsentChecked}
          onCancel={() => setConsentOpen(false)}
          onConfirm={() => { setRuleConsent(pid, matchId, rulesFingerprint); setConsentOpen(false); }}
        />
      )}
    </div>
  );
}

function Winners({ matchId }: { matchId: string }) {
  const { data, loading } = useApi(async () => {
    const [{ data: winners }, { data: regs }] = await Promise.all([
      publicDb.from('public_match_winners_view').select('*').eq('match_id', matchId).order('position', { ascending: true }),
      publicDb.from('match_registrations').select('player_id').eq('match_id', matchId),
    ]);
    const valid = new Set(((regs as { player_id: number }[] | null) ?? []).map((r) => r.player_id));
    return ((winners as { player_id: number; current_username?: string; position: number }[] | null) ?? [])
      .filter((w) => valid.has(w.player_id));
  }, [matchId]);
  if (loading || !data || data.length === 0) return null;
  const medals = ['🥇', '🥈', '🥉'];
  const stylesPodium = [
    'rgba(255,235,59,0.1)', 'rgba(255,255,255,0.04)', 'rgba(255,143,0,0.1)',
  ];
  return (
    <Reveal>
      <div style={{ ...styles.card, marginTop: 24 }}>
        <h3 style={{ color: colors.text, marginTop: 0 }}>🏆 Ganadores</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {data.slice(0, 3).map((w, i) => (
            <div key={w.player_id} style={{ borderRadius: 10, padding: 16, textAlign: 'center', background: stylesPodium[i], border: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: 28 }}>{medals[i]}</div>
              <p style={{ fontSize: 11, fontWeight: 700, color: colors.muted, margin: '4px 0' }}>{i + 1} Lugar</p>
              <p style={{ color: colors.text, fontWeight: 700, margin: 0 }}>{w.current_username || `Jugador ${w.player_id}`}</p>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

function Registrations({ matchId }: { matchId: string }) {
  type Reg = { id: number; player_id: number; username?: string; nation?: string; registered_at: string };
  const { data, loading } = useApi<Reg[]>(async () => {
    const { data: regs, error } = await publicDb.from('match_registrations')
      .select('player_id, nation, registered_at')
      .eq('match_id', matchId).eq('status', 'confirmed')
      .order('registered_at', { ascending: false });
    if (error) throw new Error(error.message);
    const list = ((regs as Reg[] | null) ?? []).map((r) => ({ ...r, id: r.player_id }));
    // match_registrations no tiene username (ni FK a players): lookup en players como hace el v1.
    const ids = list.map((r) => r.player_id).filter(Boolean);
    if (ids.length === 0) return list;
    const { data: players } = await publicDb.from('players').select('id, current_username').in('id', ids);
    const names = new Map<number, string>(((players as { id: number; current_username: string }[] | null) ?? []).map((p) => [p.id, p.current_username]));
    return list.map((r) => ({ ...r, username: names.get(r.player_id) }));
  }, [matchId]);
  if (loading || !data || data.length === 0) return null;
  return (
    <Reveal>
      <div style={{ marginTop: 24 }}>
        <h3 style={{ color: colors.text }}>✅ Registrados</h3>
        <DataTable<Reg>
          rows={data}
          columns={[
            { key: 'player', header: 'Jugador', render: (r) => <Link to={`/jugador/${r.player_id}`} style={{ color: colors.accent }}>{r.username || `Jugador ${r.player_id}`}</Link> },
            { key: 'nation', header: 'Nacion', render: (r) => <span style={{ color: colors.muted }}>{r.nation || '-'}</span> },
          ]}
        />
      </div>
    </Reveal>
  );
}

type Result = { id: number; player_id: number; username?: string; nation?: string; kills: number; deaths: number; kd_ratio: number };

function Results({ matchId, csvImported }: { matchId: string; csvImported: boolean }) {
  const { data, loading } = useAsyncResults(matchId, csvImported);
  if (!csvImported) {
    return <div style={{ marginTop: 24 }}><EmptyNotice text="Resultados no registrados todavia" /></div>;
  }
  if (loading) return <Loader />;
  if (!data || data.length === 0) return <EmptyNotice text="Resultados no registrados todavia" />;

  return (
    <Reveal>
      <div style={{ marginTop: 24 }}>
        <h3 style={{ color: colors.text }}>📊 Resultados</h3>
        <DataTable<Result>
          rows={data}
          columns={[
            { key: 'pos', header: '#', render: (r) => <PosCell row={r} rows={data} /> },
            { key: 'nation', header: 'Nacion', render: (r) => <span style={{ color: colors.muted }}>{r.nation || '-'}</span> },
            { key: 'player', header: 'Jugador', render: (r) => <Link to={`/jugador/${r.player_id}`} style={{ color: colors.accent }}>{r.username}</Link> },
            { key: 'kills', header: 'Bajas', render: (r) => <span style={{ color: colors.success, fontWeight: 700, display: 'block', textAlign: 'right' }}>{(r.kills || 0).toLocaleString()}</span> },
            { key: 'deaths', header: 'Muertes', render: (r) => <span style={{ color: colors.danger, display: 'block', textAlign: 'right' }}>{(r.deaths || 0).toLocaleString()}</span> },
            { key: 'kd', header: 'K/D', render: (r) => <span style={{ color: (r.kd_ratio || 0) >= 1 ? colors.success : '#ffd54f', fontWeight: 700, display: 'block', textAlign: 'right' }}>{r.kd_ratio || 0}</span> },
          ]}
        />
      </div>
    </Reveal>
  );
}

function useAsyncResults(matchId: string, csvImported: boolean) {
  return useApi<(Result & { username: string })[]>(async () => {
    if (!csvImported) return [];
    const [{ data: results }, { data: regs }] = await Promise.all([
      publicDb.from('match_results').select('player_id, nation, kills, deaths, kd_ratio').eq('match_id', matchId).order('kd_ratio', { ascending: false }),
      publicDb.from('match_registrations').select('player_id').eq('match_id', matchId),
    ]);
    const rows = ((results as Result[] | null) ?? []).map((r) => ({ ...r, id: r.player_id }));
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((r) => r.player_id))];
    const { data: players } = await publicDb.from('public_players_view').select('id, current_username').in('id', ids);
    const names: Record<number, string> = {};
    ((players as { id: number; current_username: string }[] | null) ?? []).forEach((p) => { names[p.id] = p.current_username; });
    return rows
      .map((r) => ({ ...r, username: names[r.player_id] || '?' }))
      .sort(compareMatchResults((r) => (r as Result).username || ''));
  }, [matchId, csvImported]);
}

function PosCell({ row, rows }: { row: { player_id: number }; rows: { player_id: number }[] }) {
  const idx = rows.findIndex((r) => r.player_id === row.player_id);
  return <span style={{ color: idx < 3 ? '#ffee58' : colors.muted, fontWeight: 700 }}>{idx + 1}</span>;
}

function EmptyNotice({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 16px', color: colors.muted, border: `1px dashed ${colors.border}`, borderRadius: 12 }}>
      {text}
    </div>
  );
}

function RuleGateModal({
  blocks, scrolled, onScroll, checked, onCheck, onCancel, onConfirm,
}: {
  blocks: { heading: string; content: string }[];
  scrolled: boolean;
  onScroll: () => void;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Cuando cambian los bloques (llegan async), re-evaluar si hay overflow:
  // sin overflow => scrolled automatico, si no el boton quedaria bloqueado.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 20) onScroll();
  }, [blocks, onScroll]);
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onCancel}>
      <div style={{ ...styles.card, maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: colors.text, marginTop: 0 }}>📜 Reglamento de la partida</h3>
        <div
          ref={(el) => {
            scrollRef.current = el;
            // Fix: si el documento cabe sin scroll (reglas cortas), el evento
            // onScroll jamas dispara y el boton quedaba bloqueado. Al montar,
            // si no hay overflow se considera "leido hasta el final".
            if (el && el.scrollHeight <= el.clientHeight + 20) onScroll();
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) onScroll();
          }}
          style={{ overflowY: 'auto', flex: 1, minHeight: 200, color: colors.muted, fontSize: 14, lineHeight: 1.6, paddingRight: 6 }}
        >
          {blocks.map((b, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <h4 style={{ color: colors.text, margin: '0 0 6px', fontSize: 14 }}>{b.heading}</h4>
              {b.content && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{b.content}</p>}
            </div>
          ))}
          <p style={{ marginBottom: 0 }}>Desliza hasta el final y marca la casilla para confirmar que leiste y aceptas el reglamento.</p>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0', color: colors.text, fontSize: 14 }}>
          <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
          He leido y acepto el reglamento
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button disabled={!checked || !scrolled} onClick={onConfirm}>Aceptar y continuar</Button>
        </div>
      </div>
    </div>
  );
}

// ---- Bloque de equipos de la partida (lectura publica; auto-gestion del jugador) ----
function TeamsBlock({ matchId, teams, members, names, regs, myPlayerId, canPick, reload }: {
  matchId: string;
  teams: { id: string; name: string; color: string | null; sort_order: number; max_members: number | null }[];
  members: { team_id: string; player_id: number }[];
  names: Record<number, string>;
  regs: number[];
  myPlayerId: number | null;
  canPick: boolean;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [inviteTarget, setInviteTarget] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const myTeam = myPlayerId ? members.find((x) => x.player_id === myPlayerId)?.team_id ?? null : null;

  async function invite(teamId: string) {
    const token = getSessionToken();
    const target = Number(inviteTarget);
    if (!token || !target) return;
    setBusy(true);
    const { error } = await publicDb.rpc('player_invite_to_team', { p_match_id: matchId, p_team_id: teamId, p_target_player_id: target, p_token: token });
    setBusy(false);
    if (error) window.alert(error.message);
    else {
      setInviteMsg(`✓ ${names[target] ?? `#${target}`} añadido a tu equipo`);
      setInviteTarget('');
      setTimeout(() => setInviteMsg(''), 2500);
    }
    reload();
  }

  async function join(teamId: string) {
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    const { error } = await publicDb.rpc('player_join_team', { p_match_id: matchId, p_team_id: teamId, p_token: token });
    setBusy(false);
    if (error) window.alert(error.message);
    reload();
  }
  async function leave() {
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    const { error } = await publicDb.rpc('player_leave_team', { p_match_id: matchId, p_token: token });
    setBusy(false);
    if (error) window.alert(error.message);
    reload();
  }

  return (
    <div style={{ ...styles.card, marginTop: 20 }}>
      <h3 style={{ color: colors.text, marginTop: 0 }}>🛡 Equipos</h3>
      {teams.length === 0 && <p style={{ color: colors.muted, margin: 0 }}>Los equipos de esta partida aún no se han configurado.</p>}
      {teams.map((t) => {
        const roster = members.filter((x) => x.team_id === t.id);
        const full = t.max_members !== null && roster.length >= t.max_members;
        return (
          <div key={t.id} style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: colors.bg, border: `1px solid ${full ? colors.warning : colors.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <strong style={{ flex: 1, color: colors.text, fontSize: 14 }}>
                {t.color ? <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: t.color, marginRight: 6 }} /> : null}
                {t.name}
                <span style={{ fontWeight: 400, color: full ? colors.warning : colors.muted }}> · {roster.length}{t.max_members !== null ? `/${t.max_members}` : ''}{full ? ' (lleno)' : ''}</span>
              </strong>
              {canPick && myTeam !== t.id && (
                <Button disabled={busy || full} onClick={() => join(t.id)} style={{ padding: '4px 10px', fontSize: 12 }}>
                  {myTeam ? 'Cambiarme aquí' : 'Unirme'}
                </Button>
              )}
              {canPick && myTeam === t.id && (
                <Button variant="ghost" disabled={busy} onClick={leave} style={{ padding: '4px 10px', fontSize: 12 }}>Salir del equipo</Button>
              )}
            </div>
            {roster.length === 0 && <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Sin miembros todavía.</p>}
            {roster.map((x) => (
              <p key={x.player_id} style={{ margin: '0 0 3px', fontSize: 13, color: colors.text }}>
                • {names[x.player_id] ?? `#${x.player_id}`}{myPlayerId === x.player_id ? ' (tú)' : ''}
              </p>
            ))}
            {canPick && myTeam === t.id && (() => {
              const teamed = new Set(members.map((x) => x.player_id));
              const candidates = regs.filter((pid) => !teamed.has(pid) && pid !== myPlayerId);
              return (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${colors.border}` }}>
                  {inviteMsg && <p style={{ margin: '0 0 6px', fontSize: 12, color: colors.success }}>{inviteMsg}</p>}
                  {candidates.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>No quedan jugadores registrados sin equipo para invitar.</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select value={inviteTarget} onChange={(e) => setInviteTarget(e.target.value)} style={{ ...styles.input, flex: 1, minWidth: 140, marginBottom: 0, padding: '6px 8px', fontSize: 12 }}>
                        <option value="">Invitar a un jugador…</option>
                        {candidates.map((pid) => <option key={pid} value={String(pid)}>{names[pid] ?? `#${pid}`}</option>)}
                      </select>
                      <Button disabled={busy || !inviteTarget || full} onClick={() => invite(t.id)} style={{ padding: '4px 10px', fontSize: 12 }}>Invitar</Button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}
      {canPick && !myTeam && <p style={{ fontSize: 12, color: colors.muted, margin: '4px 0 0' }}>Elige tu equipo con "Unirme". Puedes cambiarte hasta que la partida empiece.</p>}
    </div>
  );
}
