import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Input, Select } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { loadAlliances, type Alliance } from '../../lib/admin';

interface Membership {
  id: string;
  player_id: number;
  alliance_id: string;
  status: string;
  role: string | null;
  players?: { current_username: string } | null;
}

interface Row {
  id: string;
  playerId: number;
  username: string;
  allianceLabel: string;
  kills: number;
  deaths: number;
  status: string;
  role: string | null;
}

const STATUS_TONE: Record<string, string> = {
  approved: 'active',
  pending: 'warning',
  rejected: 'danger',
};

const thStyle: React.CSSProperties = { textAlign: 'left', padding: 12, color: colors.muted, fontSize: 12, background: colors.cardAlt };

/** AdminAllianceMembersPage — puerto de admin/alliance-members.html (shell v1 sin JS propio; implementación funcional sobre alliance_memberships). */
function Members() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [allianceFilter, setAllianceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const als = await loadAlliances();
      setAlliances(als);
      let q = publicDb.from('alliance_memberships').select('*, players(current_username)').order('player_id');
      if (allianceFilter) q = q.eq('alliance_id', allianceFilter);
      const { data, error: mErr } = await q;
      if (mErr) throw mErr;
      const list = ((data as Membership[]) || []).slice(0, 300);

      // Estadísticas de kills/deaths desde la vista pública de rankings
      const ids = [...new Set(list.map((m) => m.player_id))];
      const stats: Record<number, { kills: number; deaths: number }> = {};
      if (ids.length > 0) {
        const { data: vrows } = await publicDb.from('public_rankings_view')
          .select('player_id, total_kills, total_deaths').in('player_id', ids);
        ((vrows as { player_id: number; total_kills: number; total_deaths: number }[]) || []).forEach((r) => {
          stats[r.player_id] = { kills: r.total_kills || 0, deaths: r.total_deaths || 0 };
        });
      }

      const mapped: Row[] = list.map((m) => {
        const alli = als.find((a) => a.id === m.alliance_id);
        const s = stats[m.player_id] || { kills: 0, deaths: 0 };
        return {
          id: m.id,
          playerId: m.player_id,
          username: m.players?.current_username || 'Jugador ' + m.player_id,
          allianceLabel: alli ? `${alli.name} [${alli.tag}]` : '-',
          kills: s.kills,
          deaths: s.deaths,
          status: m.status,
          role: m.role,
        };
      });
      setRows(mapped);
    } catch (e: any) {
      setError(e.message || 'Error cargando miembros');
      setRows([]);
    }
  }, [allianceFilter]);

  useEffect(() => { load(); }, [load]);

  async function approve(row: Row) {
    const { error } = await publicDb.from('alliance_memberships').update({ status: 'approved' }).eq('id', row.id);
    if (error) { setError(error.message); return; }
    await load();
  }

  async function reject(row: Row) {
    if (!window.confirm('¿Rechazar la solicitud de ' + row.username + '?')) return;
    const { error } = await publicDb.from('alliance_memberships').update({ status: 'rejected' }).eq('id', row.id);
    if (error) { setError(error.message); return; }
    await load();
  }

  async function remove(row: Row) {
    if (!window.confirm('¿Eliminar a ' + row.username + ' de la alianza?')) return;
    const { error } = await publicDb.from('alliance_memberships').delete().eq('id', row.id);
    if (error) { setError(error.message); return; }
    await load();
  }

  const filtered = (rows || []).filter((r) => {
    if (!search) return true;
    return r.username.toLowerCase().includes(search.toLowerCase()) || String(r.playerId).includes(search);
  });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Miembros de Alianzas</h1>
      <p style={{ color: colors.muted, margin: '0 0 24px' }}>Membresías y solicitudes de unión</p>

      {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Select value={allianceFilter} onChange={(e) => setAllianceFilter(e.target.value)} style={{ minWidth: 220 }}>
          <option value="">Todas las alianzas</option>
          {alliances.map((a) => <option key={a.id} value={a.id}>{a.name} [{a.tag}]</option>)}
        </Select>
        <Input placeholder="Buscar miembro…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
      </div>

      {rows === null ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <EmptyState message="No hay miembros" />
      ) : (
        <div style={{ overflowX: 'auto', background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Jugador</th>
                <th style={thStyle}>Alianza</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Kills</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Deaths</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: 12 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{r.username}</p>
                    <p style={{ margin: 0, fontSize: 11, color: colors.muted }}>#{r.playerId}{r.role ? ` · ${r.role}` : ''}</p>
                  </td>
                  <td style={{ padding: 12 }}>{r.allianceLabel}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{r.kills}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{r.deaths}</td>
                  <td style={{ padding: 12 }}>
                    <Badge label={(r.status || '?').toUpperCase()} tone={STATUS_TONE[r.status] || 'neutral'} />
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {r.status === 'pending' && (
                        <>
                          <Button style={{ fontSize: 11 }} onClick={() => approve(r)}>Aprobar</Button>
                          <Button variant="danger" style={{ fontSize: 11 }} onClick={() => reject(r)}>Rechazar</Button>
                        </>
                      )}
                      {r.status === 'approved' && (
                        <Button variant="danger" style={{ fontSize: 11 }} onClick={() => remove(r)}>Expulsar</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminAllianceMembersPage() {
  return (
    <AdminGate staffOnly>
      <Members />
    </AdminGate>
  );
}
