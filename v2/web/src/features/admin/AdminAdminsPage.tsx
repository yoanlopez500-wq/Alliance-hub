import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Select } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { loadAlliances, useAdmin, type Alliance } from '../../lib/admin';

interface AdminRow {
  id: string;
  display_name: string | null;
  role: string;
  status: string;
  alliance_id: string | null;
}

const ROLE_TONE: Record<string, string> = {
  superadmin: 'danger',
  event_admin: 'purple',
  alliance_leader: 'active',
  moderator: 'warning',
};

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'SUPERADMIN',
  event_admin: 'EVENT ADMIN',
  alliance_leader: 'LÍDER',
  moderator: 'MODERADOR',
};

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };

/** AdminAdminsPage — puerto de admin-admins.js. */
function Admins() {
  const { admin: me } = useAdmin();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [error, setError] = useState('');
  const [roleModal, setRoleModal] = useState<AdminRow | null>(null);
  const [newRole, setNewRole] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const als = await loadAlliances();
      setAlliances(als);
      const { data, error: aErr } = await publicDb.from('admin_users').select('*').order('created_at', { ascending: false });
      if (aErr) throw aErr;
      setAdmins((data as AdminRow[]) || []);
    } catch (e: any) {
      setError(e.message || 'Error');
      setAdmins([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeRole() {
    if (!roleModal) return;
    const { error } = await publicDb.from('admin_users').update({ role: newRole }).eq('id', roleModal.id);
    if (error) { setError(error.message); return; }
    setRoleModal(null);
    await load();
  }

  async function toggleStatus(a: AdminRow) {
    const newStatus = a.status === 'active' ? 'suspended' : 'active';
    if (!window.confirm((newStatus === 'active' ? '¿Activar' : '¿Suspender') + ' este administrador?')) return;
    const { error } = await publicDb.from('admin_users').update({ status: newStatus }).eq('id', a.id);
    if (error) { setError(error.message); return; }
    await load();
  }

  const isSuperadmin = me?.role === 'superadmin';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Administradores</h1>
      <p style={{ color: colors.muted, margin: '0 0 24px' }}>Gestión de cuentas de administración</p>

      {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}

      {admins === null ? (
        <Loader />
      ) : admins.length === 0 ? (
        <EmptyState message="No hay admins registrados" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {admins.map((a) => {
            const alli = a.alliance_id ? alliances.find((x) => x.id === a.alliance_id) : null;
            return (
              <div key={a.id} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{a.display_name || 'Admin'}</h3>
                    <p style={{ fontSize: 12, color: colors.muted, margin: '6px 0 0', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {alli ? `${alli.name} [${alli.tag}]` : 'Sin alianza'} |
                      <Badge label={ROLE_LABEL[a.role] || a.role} tone={ROLE_TONE[a.role] || 'neutral'} />
                      <Badge label={a.status === 'active' ? 'ACTIVO' : a.status === 'suspended' ? 'SUSPENDIDO' : (a.status || '?')} tone={a.status === 'active' ? 'active' : 'danger'} />
                    </p>
                  </div>
                  {isSuperadmin && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="ghost" style={{ fontSize: 12 }} onClick={() => { setRoleModal(a); setNewRole(a.role); }}>Cambiar rol</Button>
                      <Button variant="danger" style={{ fontSize: 12 }} onClick={() => toggleStatus(a)}>
                        {a.status === 'active' ? 'Suspender' : 'Activar'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {roleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Cambiar rol — {roleModal.display_name || 'Admin'}</h3>
            <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Nuevo rol</label>
            <Select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ width: '100%', marginBottom: 16 }}>
              {['superadmin', 'event_admin', 'alliance_leader', 'moderator'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
            </Select>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={changeRole}>Guardar</Button>
              <Button variant="ghost" onClick={() => setRoleModal(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminAdminsPage() {
  return (
    <AdminGate staffOnly>
      <Admins />
    </AdminGate>
  );
}
