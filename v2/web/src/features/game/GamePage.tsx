import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { usePlayerSession } from '../../lib/playerSession';
import {
  getSanctionSummary, isPlayerSanctioned, hasRuleConsent, setRuleConsent,
  type PlayerSanctionState,
} from '../../lib/sanctions';
import { compareMatchResults } from '../../lib/ranking';
import { colors, styles } from '../../theme';
import { formatDate, STATUS_LABELS, STATUS_COLORS, TYPE_LABELS, badgeStyle } from '../../lib/format';
import Loader from '../../components/Loader';
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
  csv_imported: boolean;
};
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

  const { data, loading, error } = useApi<{
    match: Match; alliances: Record<string, Alliance>; me: {
      regStatus: string | null; player: PlayerSanctionState | null;
    };
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
    return { match: m, alliances, me };
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

  const { match: m, alliances, me } = data;
  const pid = session?.playerId ?? null;
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
  const hasConsent = pid ? hasRuleConsent(pid, matchId) : false;
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
          {m.match_type === 'duel' && <span style={badgeStyle('rgba(239,83,80,0.15)', colors.danger)}>{TYPE_LABELS.duel}</span>}
          {m.match_type === 'internal' && <span style={badgeStyle('rgba(33,150,243,0.15)', colors.info)}>{TYPE_LABELS.internal}</span>}
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
      <Registrations matchId={matchId} />
      <Results matchId={matchId} csvImported={m.csv_imported} />

      {consentOpen && pid && (
        <RuleGateModal
          scrolled={consentScroll}
          onScroll={() => setConsentScroll(true)}
          checked={consentChecked}
          onCheck={setConsentChecked}
          onCancel={() => setConsentOpen(false)}
          onConfirm={() => { setRuleConsent(pid, matchId); setConsentOpen(false); }}
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
      .select('player_id, username, nation, registered_at')
      .eq('match_id', matchId).eq('status', 'confirmed')
      .order('registered_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((regs as Reg[] | null) ?? []).map((r) => ({ ...r, id: r.player_id }));
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
  scrolled, onScroll, checked, onCheck, onCancel, onConfirm,
}: {
  scrolled: boolean;
  onScroll: () => void;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onCancel}>
      <div style={{ ...styles.card, maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: colors.text, marginTop: 0 }}>📜 Reglamento de la partida</h3>
        <div
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) onScroll();
          }}
          style={{ overflowY: 'auto', flex: 1, minHeight: 200, color: colors.muted, fontSize: 14, lineHeight: 1.6, paddingRight: 6 }}
        >
          <p>Al participar en las partidas de AllianceHub aceptas el reglamento completo disponible en la seccion Reglas.</p>
          <p>Las infracciones son sancionadas con strikes, penalizaciones de kills efectivas o suspensiones segun su gravedad.</p>
          <p>El uso de multicuentas, exploits o conducta toxica esta prohibido y puede resultar en ban permanente.</p>
          <p>Los resultados se calculan con las bajas efectivas: los strikes aplican penalizaciones segun su formula.</p>
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
