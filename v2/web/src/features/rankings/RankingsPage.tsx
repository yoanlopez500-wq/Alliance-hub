import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import {
  fetchAllRows, makeBayesScorer, compareBy, SORT_MODES,
  getSavedSortMode, saveSortMode, type SortMode,
} from '../../lib/ranking';
import { computeEffectiveKills, attachStrikeTypes } from '../../lib/sanctions';
import { formatDate, formatDateTime } from '../../lib/format';
import { colors, styles } from '../../theme';
import DataTable from '../../components/DataTable';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';
import SortExplainer from '../../components/SortExplainer';
import JugadoresPage from '../players/JugadoresPage';

type Tab = 'players' | 'alliances' | 'duels' | 'strikes' | 'market';

interface RankingRow {
  id: number;
  username: string;
  allianceId: number | null;
  kills: number;
  deaths: number;
  games: number;
  p1: number;
  p2: number;
  p3: number;
}

interface Ctx {
  nullified: Record<number, number>;
  sanctions: Record<number, { kills_after: number | null; penalty_pct: number }>;
  strikes: Record<number, any[]>;
}

function effKillsOf(p: RankingRow, ctx: Ctx): number {
  const sanc = ctx.sanctions[p.id];
  const nullified = ctx.nullified[p.id] || 0;
  if (sanc && sanc.kills_after != null) {
    return Math.max(0, Math.round(p.kills * (1 - (sanc.penalty_pct || 0) / 100) - nullified));
  }
  return computeEffectiveKills(p.kills, ctx.strikes[p.id] || [], nullified).effKills;
}

function penaltyOf(p: RankingRow, ctx: Ctx): number {
  const sanc = ctx.sanctions[p.id];
  if (sanc && sanc.penalty_pct != null) return sanc.penalty_pct;
  return computeEffectiveKills(p.kills, ctx.strikes[p.id] || [], ctx.nullified[p.id] || 0).penaltyPct;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'players', label: 'Jugadores' },
  { id: 'alliances', label: 'Alianzas' },
  { id: 'duels', label: 'Duelos' },
  { id: 'strikes', label: 'Strikes' },
  { id: 'market', label: '🤝 Mercado' },
];

/** RankingsPage — puerto de rankings.js: 4 tabs + score Bayesiano C=3. */
export default function RankingsPage() {
  const [tabParam] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = tabParam.get('tab') as Tab | null;
    return t && TABS.some((x) => x.id === t) ? t : 'players';
  });
  const [allianceMap, setAllianceMap] = useState<Record<number, { name: string; tag: string | null }>>({});
  const [allianceList, setAllianceList] = useState<{ id: number; name: string }[]>([]);
  const [filterAlliance, setFilterAlliance] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(getSavedSortMode);
  const [priors, setPriors] = useState<{ priorK: number; priorD: number; C: number } | null>(null);
  const [podiumByPlayer, setPodiumByPlayer] = useState<Record<number, { p1: number; p2: number; p3: number }>>({});
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [players, setPlayers] = useState<RankingRow[] | null>(null);
  const [alliances, setAlliances] = useState<any[] | null>(null);
  const [duels, setDuels] = useState<{ matches: any[]; alliances: Record<number, any>; standings: any[] } | null>(null);
  const [strikes, setStrikes] = useState<any[] | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // ---- Carga de contexto compartido (nulificados, sanciones, strikes) ----
  useEffect(() => {
    (async () => {
      const nullified: Record<number, number> = {};
      const sanctions: Ctx['sanctions'] = {};
      const strikesMap: Record<number, any[]> = {};
      try {
        const { data: nk } = await publicDb.from('match_nullified_kills').select('player_id, kills_nullified');
        (nk || []).forEach((r: any) => { nullified[r.player_id] = (nullified[r.player_id] || 0) + (r.kills_nullified || 0); });
      } catch (e) { console.error('[Rankings] nullified:', e); }
      try {
        const { data: sc } = await publicDb.from('player_sanctions')
          .select('player_id, kills_after, penalty_pct, created_at').order('created_at', { ascending: false });
        (sc || []).forEach((s: any) => {
          if (!sanctions[s.player_id]) sanctions[s.player_id] = { kills_after: s.kills_after, penalty_pct: s.penalty_pct || 0 };
        });
      } catch (e) { console.error('[Rankings] sanciones:', e); }
      try {
        const { data: st } = await publicDb.from('player_strikes')
          .select('player_id, strike_type_id, status, is_active, expires_at').eq('is_active', true);
        const withTypes = await attachStrikeTypes(st || [], () =>
          publicDb.from('strike_types').select('*').then((r) => r.data || []));
        withTypes.forEach((s: any) => {
          if (!strikesMap[s.player_id]) strikesMap[s.player_id] = [];
          strikesMap[s.player_id].push(s);
        });
      } catch (e) { console.error('[Rankings] strikes:', e); }
      setCtx({ nullified, sanctions, strikes: strikesMap });
    })();
  }, []);

  // ---- Podios por jugador (top 1/2/3 por partida valida) ----
  useEffect(() => {
    (async () => {
      try {
        const { data } = await publicDb.from('public_player_podium_stats').select('*');
        const map: Record<number, { p1: number; p2: number; p3: number }> = {};
        (data || []).forEach((r: any) => {
          map[r.player_id] = { p1: Number(r.podium_1 || 0), p2: Number(r.podium_2 || 0), p3: Number(r.podium_3 || 0) };
        });
        setPodiumByPlayer(map);
      } catch (e) { console.error('[Rankings] podios:', e); }
    })();
  }, []);

  // ---- Alianzas (mapa + selector de filtro) ----
  useEffect(() => {
    (async () => {
      try {
        const { data } = await publicDb.from('alliances').select('id, name, tag').order('name');
        const map: Record<number, { name: string; tag: string | null }> = {};
        (data || []).forEach((a: any) => { map[a.id] = { name: a.name, tag: a.tag }; });
        setAllianceMap(map);
        setAllianceList((data || []).map((a: any) => ({ id: a.id, name: a.name })));
      } catch (e) { console.error('[Rankings] alianzas:', e); }
    })();
  }, []);

  // ---- Tab jugadores ----
  const loadPlayers = useCallback(async () => {
    if (!ctx) return;
    try {
      const allRows = await fetchAllRows<any>((from, to) =>
        Promise.resolve(publicDb.from('public_rankings_view').select('*').order('player_id', { ascending: true }).range(from, to)));
      const mapped: RankingRow[] = allRows.map((r) => ({
        id: r.player_id,
        username: r.current_username,
        allianceId: r.current_alliance_id ?? null,
        kills: r.total_kills || 0,
        deaths: r.total_deaths || 0,
        games: r.games_played || 0,
        p1: podiumByPlayer[r.player_id]?.p1 || 0,
        p2: podiumByPlayer[r.player_id]?.p2 || 0,
        p3: podiumByPlayer[r.player_id]?.p3 || 0,
      }));
      const acc = {
        eff: (p: RankingRow) => { const v = effKillsOf(p, ctx); return isFinite(v) ? v : 0; },
        deaths: (p: RankingRow) => p.deaths,
        games: (p: RankingRow) => p.games,
      };
      const scorer = makeBayesScorer(mapped, acc);
      setPriors({ priorK: scorer.priorK, priorD: scorer.priorD, C: scorer.C });
      const full = {
        ...acc,
        score: scorer.score,
        name: (p: RankingRow) => p.username,
      };
      let rows = mapped;
      if (filterAlliance) rows = rows.filter((p) => p.allianceId === Number(filterAlliance));
      const cmp = compareBy(sortMode, full);
      setPlayers(rows.slice().sort(cmp));
    } catch (e) {
      console.error('[Rankings] jugadores:', e);
      setPlayers([]);
    }
  }, [ctx, filterAlliance, sortMode, podiumByPlayer]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  // ---- Tab alianzas ----
  useEffect(() => {
    if (tab !== 'alliances' || alliances !== null) return;
    (async () => {
      try {
        const { data: list } = await publicDb.from('alliances').select('*');
        const { data: stats } = await publicDb.from('public_alliance_rankings_view')
          .select('alliance_id, member_count, total_kills');
        const byId: Record<number, any> = {};
        (stats || []).forEach((s: any) => { byId[s.alliance_id] = s; });
        const merged = (list || []).map((a: any) => ({
          ...a,
          member_count: byId[a.id]?.member_count || 0,
          total_kills: byId[a.id]?.total_kills || 0,
        })).sort((a: any, b: any) => b.total_kills - a.total_kills);
        setAlliances(merged);
      } catch (e) { console.error('[Rankings] alianzas ranking:', e); setAlliances([]); }
    })();
  }, [tab, alliances]);

  // ---- Tab duelos ----
  useEffect(() => {
    if (tab !== 'duels' || duels !== null) return;
    (async () => {
      try {
        const { data: matches } = await publicDb.from('public_matches_view')
          .select('id, name, alliance_id, status, match_type, created_at')
          .eq('match_type', 'duel').order('created_at', { ascending: false }).limit(20);
        const ids = ((matches || []) as any[]).map((m) => m.alliance_id).filter(Boolean);
        let alliancesData: Record<number, any> = {};
        if (ids.length > 0) {
          const { data: ad } = await publicDb.from('alliances').select('id, name, tag').in('id', ids);
          (ad || []).forEach((a: any) => { alliancesData[a.id] = a; });
        }
        const { data: standings } = await publicDb.from('public_duel_standings_view')
          .select('alliance_id, name, tag, duels_played, duels_won, duels_lost, duels_drawn, duel_points');
        const sorted = ((standings || []) as any[]).sort((a, b) => (b.duel_points || 0) - (a.duel_points || 0));
        setDuels({ matches: matches || [], alliances: alliancesData, standings: sorted });
      } catch (e) { console.error('[Rankings] duelos:', e); setDuels({ matches: [], alliances: {}, standings: [] }); }
    })();
  }, [tab, duels]);

  // ---- Tab strikes ----
  useEffect(() => {
    if (tab !== 'strikes' || strikes !== null || !ctx) return;
    (async () => {
      try {
        const counts: Record<number, number> = {};
        Object.entries(ctx.strikes).forEach(([pid, arr]) => { counts[Number(pid)] = arr.length; });
        const ids = Object.keys(counts).map(Number);
        let playersMap: Record<number, any> = {};
        if (ids.length > 0) {
          const { data: pv } = await publicDb.from('public_players_view')
            .select('id, current_username, current_alliance_id, status, last_seen').in('id', ids);
          (pv || []).forEach((p: any) => { playersMap[p.id] = p; });
        }
        const rows = Object.entries(counts)
          .map(([pid, count]) => ({ player: playersMap[Number(pid)] ?? { id: Number(pid), current_username: '?' }, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 50);
        setStrikes(rows);
      } catch (e) { console.error('[Rankings] strikes:', e); setStrikes([]); }
    })();
  }, [tab, strikes, ctx]);

  const tagOf = (aid: number | null | undefined) => (aid && allianceMap[aid]?.tag) || '-';

  const STATUS_BADGES: Record<string, { label: string; color: string }> = {
    finished: { label: 'FINALIZADO', color: colors.success },
    in_progress: { label: 'EN CURSO', color: colors.info },
  };

  const statusBadgePlayer = (status: string | null | undefined) => {
    const map: Record<string, { label: string; color: string }> = {
      active: { label: 'ACTIVO', color: colors.success },
      banned: { label: 'BANEADO', color: colors.danger },
      suspended: { label: 'SUSPENDIDO', color: colors.warning },
      inactive: { label: 'INACTIVO', color: colors.muted },
    };
    const s = map[status || 'active'] || map.inactive;
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${s.color}22`, color: s.color }}>{s.label}</span>;
  };

  const rankedRows = useMemo(() => {
    if (!players || !ctx) return null;
    return players.map((p, i) => {
      const eff = effKillsOf(p, ctx);
      const penalty = penaltyOf(p, ctx);
      const kd = p.deaths > 0 ? (eff / p.deaths).toFixed(2) : eff > 0 ? eff.toFixed(2) : '0';
      const avg = p.games > 0 ? (eff / p.games).toFixed(1) : '0.0';
      return {
        ...p, rank: i + 1, eff, penalty, kd, avg,
        allianceTag: tagOf(p.allianceId),
      };
    });
  }, [players, ctx, allianceMap]);

  function onSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (SORT_MODES.some((m) => m.id === v)) {
      setSortMode(v as SortMode);
      saveSortMode(v);
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <Reveal>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <h1 style={{ color: colors.text, margin: 0 }}>🏆 Rankings</h1>
          <button onClick={() => setShowHelp((v) => !v)} style={{ ...styles.btnGhost, padding: '6px 12px' }} title="Como funcionan los rankings">?</button>
        </div>
        {showHelp && <SortExplainer activeId={sortMode} priors={priors} />}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${colors.border}`, marginBottom: 16, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              fontWeight: 700, fontSize: 14, minWidth: 90,
              color: tab === t.id ? colors.accent : colors.muted,
              borderBottom: tab === t.id ? `2px solid ${colors.accent}` : '2px solid transparent',
            }}>{t.label}</button>
          ))}
        </div>
      </Reveal>

      {tab === 'players' && (
        <Reveal>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <select value={filterAlliance} onChange={(e) => setFilterAlliance(e.target.value)} style={{ ...styles.input, width: 'auto', marginBottom: 0 }}>
              <option value="">Todas las alianzas</option>
              {allianceList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={sortMode} onChange={onSortChange} style={{ ...styles.input, width: 'auto', marginBottom: 0 }}>
              {SORT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          {!rankedRows ? <Loader /> : (
            <DataTable
              rows={rankedRows}
              empty="Sin datos de rankings publicos"
              columns={[
                { key: 'rank', header: '#', render: (r) => (
                  <span style={{ color: r.rank <= 3 ? colors.warning : colors.muted, fontWeight: 800 }}>
                    {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}
                  </span>
                ) },
                { key: 'username', header: 'Jugador', render: (r) => (
                  <span>
                    <Link to={`/jugador/${r.id}`} style={{ color: colors.accent, fontWeight: 600 }}>{r.username}</Link>
                    {r.penalty > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 4, background: 'rgba(239,83,80,0.2)', color: colors.danger, marginLeft: 6 }}>-{r.penalty}%</span>}
                  </span>
                ) },
                { key: 'allianceTag', header: 'Alianza', render: (r) => <span style={{ color: colors.muted }}>{r.allianceTag}</span> },
                { key: 'podiums', header: 'Podios', render: (r) => (
                  <span style={{ color: colors.muted, fontSize: 12, whiteSpace: 'nowrap' }} title="Top 1 / Top 2 / Top 3 por partida valida">
                    🥇{r.p1} 🥈{r.p2} 🥉{r.p3}
                  </span>
                ) },
                { key: 'games', header: 'Partidas', render: (r) => <span style={{ textAlign: 'right', display: 'block', color: colors.muted }}>{r.games}</span> },
                { key: 'eff', header: 'Bajas validas', render: (r) => <span style={{ textAlign: 'right', display: 'block', fontWeight: 700, color: r.eff > 0 ? colors.success : colors.muted, textDecoration: r.penalty > 0 ? 'line-through' : 'none' }}>{r.eff}</span> },
                { key: 'deaths', header: 'Muertes', render: (r) => <span style={{ textAlign: 'right', display: 'block', color: colors.muted }}>{r.deaths}</span> },
                { key: 'kd', header: 'K/D', render: (r) => <span style={{ textAlign: 'right', display: 'block', fontWeight: 700 }}>{r.kd}</span> },
                { key: 'avg', header: 'Prom', render: (r) => <span style={{ textAlign: 'right', display: 'block', color: colors.warning }}>{r.avg}</span> },
                { key: 'pen', header: '', render: (r) => r.penalty > 0 ? <span title="Penalizacion por strikes/sanciones" style={{ color: colors.danger }}>⚡</span> : null },
              ]}
            />
          )}
        </Reveal>
      )}

      {tab === 'alliances' && (
        <Reveal>
          {!alliances ? <Loader /> : alliances.length === 0 ? <p style={{ color: colors.muted, textAlign: 'center' }}>Sin alianzas registradas</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {alliances.map((a, i) => (
                <Link key={a.id} to={`/alianzas/${a.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ ...styles.card, transition: 'border-color 0.2s' }} className="ah-glow-hover">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: colors.accent }}>#{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, color: colors.text, fontSize: 17 }}>{a.name}</h3>
                        <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>[{a.tag || '-'}]</p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                      <div style={{ background: colors.bg, borderRadius: 8, padding: 8, textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 11, color: colors.muted }}>Miembros</p>
                        <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>{a.member_count || 0}</p>
                      </div>
                      <div style={{ background: colors.bg, borderRadius: 8, padding: 8, textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 11, color: colors.muted }}>Bajas</p>
                        <p style={{ margin: 0, fontWeight: 700, color: colors.success }}>{(a.total_kills || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Reveal>
      )}

      {tab === 'duels' && (
        <Reveal>
          {!duels ? <Loader /> : (
            <>
              {duels.matches.length === 0 ? (
                <p style={{ color: colors.muted, textAlign: 'center', padding: '24px 0' }}>Sin duelos registrados</p>
              ) : duels.matches.map((d) => {
                const alli = duels.alliances[d.alliance_id] || {};
                const sb = STATUS_BADGES[d.status] || { label: (d.status || 'ABIERTO').toUpperCase(), color: colors.warning };
                return (
                  <div key={d.id} style={{ ...styles.card, marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ color: colors.text }}>{d.name || 'Duelo'}</strong>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${sb.color}22`, color: sb.color }}>{sb.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: colors.muted }}>
                      Alianza: {alli.name || 'N/A'}{alli.tag ? ` [${alli.tag}]` : ''} | {formatDate(d.created_at)}
                    </div>
                  </div>
                );
              })}
              <h3 style={{ color: colors.text, marginTop: 24 }}>Clasificacion de Duelos</h3>
              {duels.standings.length === 0 ? (
                <p style={{ color: colors.muted, textAlign: 'center', padding: '16px 0' }}>Aun no hay duelos finalizados</p>
              ) : (
                <DataTable
                  rows={duels.standings.map((s, i) => ({ alliance_id: s.alliance_id, rank: i + 1, name: s.name, tag: s.tag, duels_played: s.duels_played, duels_won: s.duels_won, duels_lost: s.duels_lost, duels_drawn: s.duels_drawn, duel_points: s.duel_points, id: i + 1 }))}
                  columns={[
                    { key: 'rank', header: '#', render: (r) => <span style={{ color: colors.muted, fontWeight: 700 }}>{r.rank}</span> },
                    { key: 'name', header: 'Alianza' },
                    { key: 'tag', header: 'Tag', render: (r) => <span style={{ color: colors.muted }}>[{r.tag || '-'}]</span> },
                    { key: 'duels_played', header: 'Jugados', render: (r) => <span style={{ textAlign: 'right', display: 'block' }}>{r.duels_played}</span> },
                    { key: 'duels_won', header: 'Ganados', render: (r) => <span style={{ textAlign: 'right', display: 'block', color: colors.success }}>{r.duels_won}</span> },
                    { key: 'duels_lost', header: 'Perdidos', render: (r) => <span style={{ textAlign: 'right', display: 'block', color: colors.danger }}>{r.duels_lost}</span> },
                    { key: 'duels_drawn', header: 'Empatados', render: (r) => <span style={{ textAlign: 'right', display: 'block', color: colors.muted }}>{r.duels_drawn}</span> },
                    { key: 'duel_points', header: 'Puntos', render: (r) => <span style={{ textAlign: 'right', display: 'block', fontWeight: 700, color: colors.accent }}>{r.duel_points}</span> },
                  ]}
                />
              )}
            </>
          )}
        </Reveal>
      )}

      {tab === 'strikes' && (
        <Reveal>
          {!strikes ? <Loader /> : (
            <DataTable
              rows={strikes.map((r) => ({ ...r, id: r.player.id }))}
              empty="Sin strikes registrados"
              columns={[
                { key: 'player', header: 'Jugador', render: (r) => (
                  <Link to={`/jugador/${r.player.id}`} style={{ color: colors.accent, fontWeight: 600 }}>{r.player.current_username || '?'}</Link>
                ) },
                { key: 'tag', header: 'Alianza', render: (r) => <span style={{ color: colors.muted }}>{tagOf(r.player.current_alliance_id)}</span> },
                { key: 'count', header: 'Strikes', render: (r) => <span style={{ textAlign: 'right', display: 'block', fontWeight: 700, color: colors.danger }}>{r.count}</span> },
                { key: 'status', header: 'Estado', render: (r) => statusBadgePlayer(r.player.status) },
                { key: 'last_seen', header: 'Ultima vez', render: (r) => <span style={{ fontSize: 12, color: colors.muted }}>{r.player.last_seen ? formatDateTime(r.player.last_seen) : '-'}</span> },
              ]}
            />
          )}
        </Reveal>
      )}

      {tab === 'market' && <JugadoresPage />}
    </div>
  );
}
