import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import AdminGate from '../../components/AdminGate';
import { useAdmin, loadAlliances, allianceById, badge, type Alliance } from '../../lib/admin';
import { formatDate } from '../../lib/format';
import { colors, styles } from '../../theme';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';

/** AdminMatchesPage — puerto de admin-matches.js (lista con filtro por alianza para lideres). */
function Matches() {
  const { admin } = useAdmin();
  const isLeader = admin?.role === 'alliance_leader' && !!admin.alliance_id;
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [matches, setMatches] = useState<any[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setMatches(null);
    const als = await loadAlliances();
    setAlliances(als);
    let q = publicDb.from('matches').select('*').order('created_at', { ascending: false }).limit(50);
    if (isLeader && admin?.alliance_id) q = q.eq('alliance_id', admin.alliance_id);
    if (statusFilter) q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) { setMatches([]); return; }
    setMatches((data as any[]) ?? []);
  }, [isLeader, admin?.alliance_id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = (matches ?? []).filter((m) => (m.name || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ color: colors.text, margin: 0, flex: 1 }}>🎯 Partidas</h1>
        <input placeholder="Buscar..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...styles.input, width: 180, marginBottom: 0 }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...styles.input, width: 'auto', marginBottom: 0 }}>
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="open">Abierta</option>
          <option value="in_progress">En curso</option>
          <option value="finished">Finalizada</option>
        </select>
        {!isLeader && <Link to="/admin/partida?action=new" style={{ ...styles.btnPrimary, padding: '8px 14px', textDecoration: 'none', fontSize: 13 }}>+ Nueva partida</Link>}
      </div>
      {!matches ? <Loader /> : filtered.length === 0 ? (
        <p style={{ color: colors.muted, textAlign: 'center', padding: '24px 0' }}>No hay partidas. Crea la primera.</p>
      ) : filtered.map((m) => {
        const alli = allianceById(alliances, m.alliance_id);
        return (
          <Link key={m.id} to={`/admin/partida?id=${m.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ ...styles.card, marginBottom: 10 }} className="ah-glow-hover">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', color: colors.text }}>{m.name || 'Partida'}{alli ? ` [${alli.tag}]` : ''}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>{formatDate(m.created_at)} | Max: {m.max_players || '-'} jugadores</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {badge(m.status)}
                  {m.match_type === 'duel' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(239,83,80,0.15)', color: colors.danger }}>DUELO</span>}
                  {m.match_type === 'internal' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(79,195,247,0.15)', color: colors.info }}>INTERNA</span>}
                  {(m.match_type !== 'duel' && m.match_type !== 'internal') && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(206,147,216,0.15)', color: colors.purple }}>GLOBAL</span>}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function AdminMatchesPage() {
  return (
    <AdminGate>
      <Reveal><Matches /></Reveal>
    </AdminGate>
  );
}
