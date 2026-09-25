import { useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import AdminGate from '../../components/AdminGate';
import { Select } from '../../components/Field';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import {
  fetchAllRows, makeBayesScorer, compareBy, getSavedSortMode, saveSortMode,
  SORT_MODES, type SortMode,
} from '../../lib/ranking';
import { fetchMatchTypes, internalTypeIdsCached, notInValue } from '../../lib/matchTypes';
import { loadAlliances, type Alliance } from '../../lib/admin';

interface PlayerRow {
  id: number;
  username: string;
  alliance_id: string | null;
  kills: number;
  deaths: number;
  games: number;
  score: number;
  rank: number;
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: 12, color: colors.muted, fontSize: 12, background: colors.cardAlt };

/** AdminRankingsPage — puerto de admin-rankings.js (mismo motor Bayesiano C=3 que el ranking público). */
function AdminRankings() {
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>(getSavedSortMode());
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setError('');
      try {
        const als = await loadAlliances();
        setAlliances(als);

        // 1) Resultados de partidas públicas (paginación completa)
        const internalIds = await internalTypeIdsCached();
        const results = await fetchAllRows<{ player_id: number; kills: number; deaths: number; match_id: string }>((from, to) =>
          Promise.resolve(
            publicDb.from('match_results')
              .select('player_id, kills, deaths, match_id, matches!inner(match_type)')
              .not('matches.match_type', 'in', notInValue(internalIds))
              .order('id', { ascending: true })
              .range(from, to),
          ),
        );

        // 2) Solo jugadores registrados en cada partida
        const matchIds = [...new Set(results.map((r) => r.match_id).filter(Boolean))];
        const validRegistrations: Record<string, boolean> = {};
        const CHUNK = 100;
        for (let ci = 0; ci < matchIds.length; ci += CHUNK) {
          const { data: regs, error: regErr } = await publicDb.from('match_registrations')
            .select('match_id, player_id')
            .in('match_id', matchIds.slice(ci, ci + CHUNK));
          if (regErr) throw regErr;
          ((regs as { match_id: string; player_id: number }[]) || []).forEach((r) => {
            validRegistrations[r.match_id + ':' + r.player_id] = true;
          });
        }

        const stats: Record<number, { kills: number; deaths: number; games: number }> = {};
        results.forEach((r) => {
          if (!validRegistrations[r.match_id + ':' + r.player_id]) return;
          if (!stats[r.player_id]) stats[r.player_id] = { kills: 0, deaths: 0, games: 0 };
          stats[r.player_id].kills += r.kills || 0;
          stats[r.player_id].deaths += r.deaths || 0;
          stats[r.player_id].games += 1;
        });

        const playerIds = Object.keys(stats).map(Number);
        let playersData: PlayerRow[] = [];
        if (playerIds.length > 0) {
          const { data: players, error: pErr } = await publicDb.from('players')
            .select('id, current_username, current_alliance_id')
            .in('id', playerIds);
          if (pErr) throw pErr;
          playersData = ((players as { id: number; current_username: string; current_alliance_id: string | null }[]) || []).map((p) => {
            const s = stats[p.id] || { kills: 0, deaths: 0, games: 0 };
            return {
              id: p.id,
              username: p.current_username,
              alliance_id: p.current_alliance_id,
              kills: s.kills,
              deaths: s.deaths,
              games: s.games,
              score: 0,
              rank: 0,
            };
          });
        }

        // Score Bayesiano C=3
        const scorer = makeBayesScorer(playersData, {
          eff: (p) => p.kills,
          deaths: (p) => p.deaths,
          games: (p) => p.games,
        });
        playersData = playersData.map((p) => ({ ...p, score: scorer.score(p) }));

        const acc = {
          score: (p: PlayerRow) => p.score,
          games: (p: PlayerRow) => p.games,
          deaths: (p: PlayerRow) => p.deaths,
          eff: (p: PlayerRow) => p.kills,
          name: (p: PlayerRow) => p.username,
        };
        playersData = playersData.slice().sort(compareBy(sortMode, acc)).map((p, i) => ({ ...p, rank: i + 1 }));
        setRows(playersData);
      } catch (e: any) {
        setError(e.message || 'Error cargando rankings');
        setRows([]);
      }
    })();
  }, [sortMode]);

  function onSortChange(mode: SortMode) {
    setSortMode(mode);
    saveSortMode(mode);
  }

  const allianceName = (id: string | null) => alliances.find((a) => a.id === id)?.name || '-';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Rankings Admin</h1>
          <p style={{ color: colors.muted, margin: 0 }}>Vista administrativa del ranking (score Bayesiano C=3)</p>
        </div>
        <Select value={sortMode} onChange={(e) => onSortChange(e.target.value as SortMode)} style={{ minWidth: 200 }}>
          {SORT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </Select>
      </div>

      {error && <div style={{ color: colors.danger, margin: '12px 0' }}>{error}</div>}

      {rows === null ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState message="Sin datos" />
      ) : (
        <div style={{ overflowX: 'auto', background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, marginTop: 20 }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Jugador</th>
                <th style={thStyle}>Alianza</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Kills</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Deaths</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>K/D</th>
                <th style={thStyle}>Partidas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills > 0 ? p.kills.toFixed(2) : '0.00';
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{p.rank}</td>
                    <td style={{ padding: 12, fontWeight: 600 }}>{p.username}</td>
                    <td style={{ padding: 12, color: colors.muted }}>{allianceName(p.alliance_id)}</td>
                    <td style={{ padding: 12, textAlign: 'right' }}>{p.kills}</td>
                    <td style={{ padding: 12, textAlign: 'right' }}>{p.deaths}</td>
                    <td style={{ padding: 12, textAlign: 'right' }}>{kd}</td>
                    <td style={{ padding: 12 }}>{p.games} partidas</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminRankingsPage() {
  return (
    <AdminGate staffOnly>
      <AdminRankings />
    </AdminGate>
  );
}
