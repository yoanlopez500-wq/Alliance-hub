import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import { formatDate } from '../../lib/format';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Input, Select, TextArea } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { useAdmin } from '../../lib/admin';

interface Officer {
  id: string;
  player_id: number;
  role: string;
  title: string | null;
  permissions: Record<string, boolean> | null;
  appointed_at: string;
}

const PERM_LABELS: Record<string, string> = {
  manage_members: '👥 Miembros',
  create_matches: '🎮 Partidas',
  manage_duels: '⚔️ Duelos',
  view_strikes: '⚡ Strikes',
  view_reports: '🚨 Reportes',
  edit_rules: '📜 Reglas',
  send_notifications: '📣 Notif.',
  manage_officers: '⭐ Equipo',
};

const CO_LEADER_PERMS = {
  manage_members: true, create_matches: true, manage_duels: true,
  view_strikes: true, view_reports: true, edit_rules: true,
  send_notifications: true, manage_officers: false,
};

const OFFICER_PERMS = {
  manage_members: true, create_matches: true, manage_duels: false,
  view_strikes: true, view_reports: true, edit_rules: false,
  send_notifications: false, manage_officers: false,
};

const thStyle: React.CSSProperties = { textAlign: 'left', padding: 12, color: colors.muted, fontSize: 12, background: colors.cardAlt };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', marginBottom: 12 };

/** AdminOfficersPage — puerto de admin-officers.js (solo líder de alianza). */
function Officers() {
  const { admin } = useAdmin();
  const navigate = useNavigate();
  const [officers, setOfficers] = useState<Officer[] | null>(null);
  const [stats, setStats] = useState({ total: 0, officers: 0, coleaders: 0, duels: 0 });
  const [error, setError] = useState('');

  const [offPlayerId, setOffPlayerId] = useState('');
  const [offRole, setOffRole] = useState('officer');
  const [offTitle, setOffTitle] = useState('');
  const [transferPlayerId, setTransferPlayerId] = useState('');
  const [transferReason, setTransferReason] = useState('');

  const isLeader = admin?.role === 'alliance_leader';
  const myAllianceId = admin?.alliance_id || null;

  const loadStats = useCallback(async () => {
    if (!myAllianceId) return;
    const { count: total } = await publicDb.from('alliance_memberships').select('*', { count: 'exact', head: true }).eq('alliance_id', myAllianceId).eq('status', 'approved');
    const { count: officersCount } = await publicDb.from('alliance_officers').select('*', { count: 'exact', head: true }).eq('alliance_id', myAllianceId).eq('role', 'officer');
    const { count: coleaders } = await publicDb.from('alliance_officers').select('*', { count: 'exact', head: true }).eq('alliance_id', myAllianceId).eq('role', 'co_leader');
    const { count: duels } = await publicDb.from('matches').select('*', { count: 'exact', head: true }).eq('alliance_id', myAllianceId).eq('match_type', 'duel');
    setStats({ total: total || 0, officers: officersCount || 0, coleaders: coleaders || 0, duels: duels || 0 });
  }, [myAllianceId]);

  const loadOfficers = useCallback(async () => {
    if (!myAllianceId) return;
    const { data, error: oErr } = await publicDb.from('alliance_officers')
      .select('*')
      .eq('alliance_id', myAllianceId)
      .order('appointed_at', { ascending: false });
    if (oErr) { setError('Error cargando oficiales'); setOfficers([]); return; }
    setOfficers((data as Officer[]) || []);
  }, [myAllianceId]);

  useEffect(() => {
    if (!isLeader) return;
    loadOfficers();
    loadStats();
  }, [isLeader, loadOfficers, loadStats]);

  async function appointOfficer() {
    if (!offPlayerId.trim() || !myAllianceId) { setError('Completa los campos'); return; }
    try {
      const { data: sessData } = await publicDb.auth.getSession();
      const { error } = await publicDb.from('alliance_officers').insert({
        alliance_id: myAllianceId,
        player_id: parseInt(offPlayerId.trim()),
        role: offRole,
        title: offTitle.trim() || (offRole === 'co_leader' ? 'Co-Líder' : 'Oficial'),
        appointed_by: sessData.session?.user.id,
        permissions: offRole === 'co_leader' ? CO_LEADER_PERMS : OFFICER_PERMS,
      });
      if (error) { setError(error.message); return; }
      setOffPlayerId('');
      setOffTitle('');
      await loadOfficers();
      await loadStats();
    } catch (e: any) {
      setError(e.message || 'Error');
    }
  }

  async function removeOfficer(id: string) {
    if (!window.confirm('¿Remover a este oficial?')) return;
    const { error } = await publicDb.from('alliance_officers').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    await loadOfficers();
    await loadStats();
  }

  async function transferLeadership() {
    if (!transferPlayerId.trim() || !myAllianceId) { setError('Completa los campos'); return; }
    if (!window.confirm('⚠ ¿Estás seguro? Esta acción transfiere el liderazgo PERMANENTEMENTE.')) return;
    try {
      const { data: sessData } = await publicDb.auth.getSession();
      const adminId = sessData.session?.user.id;
      const myPlayerId = (admin as unknown as { supremacy_player_id?: number })?.supremacy_player_id;

      await publicDb.from('leader_transfer_log').insert({
        alliance_id: myAllianceId,
        from_player_id: myPlayerId || null,
        to_player_id: parseInt(transferPlayerId.trim()),
        transferred_by: adminId,
        reason: transferReason.trim() || 'Transferencia de liderazgo',
      });
      await publicDb.from('alliances').update({ leader_id: parseInt(transferPlayerId.trim()) }).eq('id', myAllianceId);
      await publicDb.from('alliance_officers').insert({
        alliance_id: myAllianceId,
        player_id: myPlayerId || 0,
        role: 'co_leader',
        title: 'Fundador',
        appointed_by: adminId,
      });
      setTimeout(() => navigate('/admin'), 2000);
    } catch (e: any) {
      setError(e.message || 'Error');
    }
  }

  if (admin && !isLeader) {
    return (
      <AdminGate>
        <div style={{ maxWidth: 600, margin: '60px auto', padding: 24, textAlign: 'center' }}>
          <h2>Solo líderes de alianza</h2>
          <p style={{ color: colors.muted }}>Esta página es exclusiva para líderes de alianza.</p>
        </div>
      </AdminGate>
    );
  }

  return (
    <AdminGate>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Oficiales y Equipo</h1>
        <p style={{ color: colors.muted, margin: '0 0 24px' }}>Gestión de oficiales, co-líderes y transferencia de liderazgo</p>

        {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
          {([
            ['Miembros', stats.total],
            ['Oficiales', stats.officers],
            ['Co-líderes', stats.coleaders],
            ['Duelos', stats.duels],
          ] as [string, number][]).map(([label, value]) => (
            <div key={label} style={{ background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: colors.accent }}>{value}</div>
              <div style={{ fontSize: 12, color: colors.muted }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>Nombrar oficial</h3>
            <label style={labelStyle}>ID del jugador</label>
            <Input value={offPlayerId} onChange={(e) => setOffPlayerId(e.target.value)} style={inputStyle} placeholder="12345" />
            <label style={labelStyle}>Rol</label>
            <Select value={offRole} onChange={(e) => setOffRole(e.target.value)} style={inputStyle}>
              <option value="officer">⭐ Oficial</option>
              <option value="co_leader">👑 Co-Líder</option>
            </Select>
            <label style={labelStyle}>Título</label>
            <Input value={offTitle} onChange={(e) => setOffTitle(e.target.value)} style={inputStyle} placeholder="Oficial de reclutamiento…" />
            <Button onClick={appointOfficer}>Nombrar</Button>
          </div>

          <div style={{ background: colors.cardAlt, border: `1px solid ${colors.danger}44`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ marginTop: 0, color: colors.danger }}>⚠ Transferir liderazgo</h3>
            <label style={labelStyle}>ID del nuevo líder</label>
            <Input value={transferPlayerId} onChange={(e) => setTransferPlayerId(e.target.value)} style={inputStyle} placeholder="12345" />
            <label style={labelStyle}>Motivo</label>
            <TextArea value={transferReason} onChange={(e) => setTransferReason(e.target.value)} rows={2} style={inputStyle} placeholder="Razón de la transferencia…" />
            <Button variant="danger" onClick={transferLeadership}>Transferir</Button>
          </div>
        </div>

        <h3>Equipo actual</h3>
        {officers === null ? (
          <Loader />
        ) : officers.length === 0 ? (
          <EmptyState message="Sin oficiales nombrados" />
        ) : (
          <div style={{ overflowX: 'auto', background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Jugador</th>
                  <th style={thStyle}>Rol</th>
                  <th style={thStyle}>Título</th>
                  <th style={thStyle}>Permisos</th>
                  <th style={thStyle}>Nombrado</th>
                  <th style={thStyle}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {officers.map((o) => {
                  const permList = Object.entries(o.permissions || {}).filter(([, v]) => v).map(([k]) => PERM_LABELS[k] || k).join(', ');
                  return (
                    <tr key={o.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: 12, fontWeight: 600 }}>Jugador #{o.player_id}</td>
                      <td style={{ padding: 12 }}>
                        <Badge label={o.role === 'co_leader' ? '👑 Co-Líder' : '⭐ Oficial'} tone={o.role === 'co_leader' ? 'active' : 'global'} />
                      </td>
                      <td style={{ padding: 12 }}>{o.title || '-'}</td>
                      <td style={{ padding: 12, fontSize: 12, color: colors.muted, maxWidth: 260 }}>{permList || 'Sin permisos'}</td>
                      <td style={{ padding: 12, fontSize: 12, color: colors.muted }}>{formatDate(o.appointed_at)}</td>
                      <td style={{ padding: 12 }}>
                        <Button variant="danger" style={{ fontSize: 11 }} onClick={() => removeOfficer(o.id)}>Remover</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminGate>
  );
}

export default function AdminOfficersPage() {
  return <Officers />;
}
