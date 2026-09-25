import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import AdminGate from '../../components/AdminGate';
import { useAdmin, loadAlliances, allianceById, badge, type Alliance } from '../../lib/admin';
import { colors, styles } from '../../theme';
import DataTable from '../../components/DataTable';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';

interface Row {
  id: number; username: string; allianceLabel: string;
  kills: number; deaths: number; kd: string; status: string;
}

/** AdminPlayersPage — puerto de admin-players.js. */
function Players() {
  const { admin } = useAdmin();
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const als = await loadAlliances();
    setAlliances(als);
    let q = publicDb.from('players').select('*');
    if (statusFilter) q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) { setRows([]); return; }
    const players = (data as any[]) ?? [];
    const ids = players.map((p) => p.id);
    let stats: Record<number, { kills: number; deaths: number; games: number }> = {};
    if (ids.length) {
      const { data: vrows } = await publicDb.from('public_rankings_view')
        .select('player_id, total_kills, total_deaths, games_played').in('player_id', ids);
      (vrows || []).forEach((r: any) => {
        stats[r.player_id] = { kills: r.total_kills || 0, deaths: r.total_deaths || 0, games: r.games_played || 0 };
      });
    }
    const mapped: Row[] = players.map((p) => {
      const s = stats[p.id] || { kills: 0, deaths: 0, games: 0 };
      const alli = allianceById(als, p.alliance_id);
      return {
        id: p.id,
        username: p.current_username || 'Sin nombre',
        allianceLabel: alli ? `${alli.name} [${alli.tag}]` : '-',
        kills: s.kills, deaths: s.deaths,
        kd: s.deaths > 0 ? (s.kills / s.deaths).toFixed(2) : s.kills > 0 ? s.kills.toFixed(2) : '0.00',
        status: p.status || 'active',
      };
    }).sort((a, b) => b.kills - a.kills);
    setRows(mapped.slice(0, 100));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function revokeBan(playerId: number) {
    if (!window.confirm('Revocar la restriccion de este jugador?')) return;
    try {
      const { error } = await publicDb.from('players').update({
        status: 'active', banned_until: null, suspended_until: null, suspension_reason: null,
      }).eq('id', playerId);
      if (error) throw error;
      setToast('Restriccion revocada');
      setTimeout(() => setToast(null), 2500);
      load();
    } catch (e: any) {
      setToast('Error: ' + (e?.message ?? e));
      setTimeout(() => setToast(null), 3000);
    }
  }

  const filtered = (rows ?? []).filter((r) => r.username.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ color: colors.text, margin: 0, flex: 1 }}>👥 Jugadores</h1>
        <input placeholder="Buscar..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...styles.input, width: 180, marginBottom: 0 }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...styles.input, width: 'auto', marginBottom: 0 }}>
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="banned">Baneados</option>
          <option value="suspended">Suspendidos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>
      {!rows ? <Loader /> : (
        <DataTable
          rows={filtered}
          empty="No hay jugadores"
          columns={[
            { key: 'username', header: 'Jugador', render: (r) => <strong style={{ color: colors.text }}>{r.username}</strong> },
            { key: 'alliance', header: 'Alianza', render: (r) => <span style={{ color: colors.muted }}>{r.allianceLabel}</span> },
            { key: 'kills', header: 'Bajas', render: (r) => <span style={{ textAlign: 'right', display: 'block' }}>{r.kills}</span> },
            { key: 'deaths', header: 'Muertes', render: (r) => <span style={{ textAlign: 'right', display: 'block' }}>{r.deaths}</span> },
            { key: 'kd', header: 'K/D', render: (r) => <span style={{ textAlign: 'right', display: 'block', fontWeight: 700 }}>{r.kd}</span> },
            { key: 'status', header: 'Estado', render: (r) => (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {badge(r.status)}
                {(r.status === 'banned' || r.status === 'suspended') && (
                  <button onClick={() => revokeBan(r.id)} style={{ background: 'none', border: 'none', color: colors.success, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Revocar</button>
                )}
              </span>
            ) },
            { key: 'view', header: '', render: (r) => <Link to={`/jugador/${r.id}`} style={{ color: colors.accent, fontSize: 12, fontWeight: 700 }}>Ver</Link> },
          ]}
        />
      )}
      {toast && <p style={{ color: colors.info, fontSize: 13, marginTop: 10 }}>{toast}</p>}
    </div>
  );
}

export default function AdminPlayersPage() {
  return (
    <AdminGate staffOnly>
      <Reveal><Players /></Reveal>
    </AdminGate>
  );
}
