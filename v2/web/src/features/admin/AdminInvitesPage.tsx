import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import { formatDate } from '../../lib/format';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Select } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { useAdmin } from '../../lib/admin';
import { generateInviteCode, ROLE_HIERARCHY } from '../../lib/invites';

interface Invite {
  id: string;
  code: string;
  role: string;
  used: boolean;
  created_at: string;
  expires_at: string;
}

/** AdminInvitesPage — puerto de admin-invites.js. */
function Invites() {
  const { admin } = useAdmin();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [role, setRole] = useState('alliance_leader');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  const load = useCallback(async () => {
    try {
      const { data, error: iErr } = await publicDb.from('admin_invites').select('*').order('created_at', { ascending: false });
      if (iErr) throw iErr;
      setInvites((data as Invite[]) || []);
    } catch (e: any) {
      setError(e.message || 'Error cargando invites');
      setInvites([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      if (!admin) { showToast('Debes iniciar sesión como admin'); return; }
      if ((ROLE_HIERARCHY[admin.role] || 0) < (ROLE_HIERARCHY[role] || 0)) {
        showToast('No puedes generar un código para un rol superior al tuyo');
        return;
      }
      // Código único (max 10 intentos)
      let code = '';
      let exists = true;
      let attempts = 0;
      while (exists && attempts < 10) {
        code = generateInviteCode();
        const { data: dup } = await publicDb.from('admin_invites').select('id').eq('code', code).maybeSingle();
        exists = !!dup;
        attempts++;
      }
      if (exists) { showToast('Error generando código único. Reintenta.'); return; }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const { error: insErr } = await publicDb.from('admin_invites').insert({
        code,
        role,
        created_by: admin.id,
        expires_at: expiresAt.toISOString(),
        used: false,
      });
      if (insErr) throw insErr;
      showToast('Código generado: ' + code);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Códigos de Invitación</h1>
      <p style={{ color: colors.muted, margin: '0 0 24px' }}>Genera y consulta códigos de invitación admin</p>

      {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}
      {toast && <div style={{ background: colors.success + '20', color: colors.success, padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>{toast}</div>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Rol</label>
          <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ minWidth: 200 }}>
            <option value="alliance_leader">Líder de alianza</option>
            <option value="event_admin">Event Admin</option>
            <option value="moderator">Moderador</option>
          </Select>
        </div>
        <Button onClick={generate} disabled={busy}>{busy ? 'Generando…' : '+ Generar código'}</Button>
      </div>

      {invites === null ? (
        <Loader />
      ) : invites.length === 0 ? (
        <EmptyState message="Sin códigos generados" />
      ) : (
        <div style={{ overflowX: 'auto', background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['Código', 'Rol', 'Estado', 'Creado', 'Expira'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: 12, color: colors.muted, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: 12, fontFamily: 'monospace', fontWeight: 700, color: colors.accent }}>{inv.code}</td>
                  <td style={{ padding: 12 }}>{inv.role}</td>
                  <td style={{ padding: 12 }}>
                    {inv.used
                      ? <Badge label="Usado" tone="active" />
                      : new Date(inv.expires_at) < new Date()
                        ? <Badge label="Expirado" tone="danger" />
                        : <Badge label="Activo" tone="warning" />}
                  </td>
                  <td style={{ padding: 12, fontSize: 12, color: colors.muted }}>{formatDate(inv.created_at)}</td>
                  <td style={{ padding: 12, fontSize: 12, color: colors.muted }}>{formatDate(inv.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminInvitesPage() {
  return (
    <AdminGate staffOnly>
      <Invites />
    </AdminGate>
  );
}
