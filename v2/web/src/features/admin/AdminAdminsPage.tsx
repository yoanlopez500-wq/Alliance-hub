import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors, styles } from '../../theme';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Select } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { loadAlliances, useAdmin, type Alliance } from '../../lib/admin';
import { formatDate } from '../../lib/format';

interface AdminRow {
  id: string;
  display_name: string | null;
  role: string;
  status: string;
  alliance_id: string | null;
  supremacy_player_id: number | null;
  created_at: string;
}

type DiscordLink = { admin_user_id: string; discord_user_id: string; enabled: boolean };

const ROLES = ['superadmin', 'event_admin', 'alliance_leader', 'moderator'];

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

/**
 * AdminAdminsPage — gestión de admins.
 * Todos los staff ven la lista. SOLO superadmin ve los controles:
 * rol, suspender/activar, alianza asignada, Discord ID de los avisos y prueba de DM.
 */
function Admins() {
  const { admin: me } = useAdmin();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [links, setLinks] = useState<Map<string, DiscordLink>>(new Map());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [roleModal, setRoleModal] = useState<AdminRow | null>(null);
  const [newRole, setNewRole] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Ediciones Discord en curso (por admin)
  const [discordDrafts, setDiscordDrafts] = useState<Map<string, string>>(new Map());

  const isSuperadmin = me?.role === 'superadmin';

  const load = useCallback(async () => {
    setError('');
    try {
      const als = await loadAlliances();
      setAlliances(als);
      const { data, error: aErr } = await publicDb.from('admin_users').select('*').order('created_at', { ascending: false });
      if (aErr) throw aErr;
      const list = (data as AdminRow[]) || [];
      setAdmins(list);
      // Links de Discord de los staff (superadmin ve todos; staff solo el suyo)
      const { data: lks } = await publicDb.from('staff_discord_links').select('*');
      const map = new Map<string, DiscordLink>();
      ((lks as DiscordLink[]) || []).forEach((l) => map.set(l.admin_user_id, l));
      setLinks(map);
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

  async function assignAlliance(a: AdminRow, allianceId: string) {
    setBusyId(a.id);
    setError(''); setNotice('');
    const { error } = await publicDb.from('admin_users').update({ alliance_id: allianceId || null }).eq('id', a.id);
    if (error) setError(error.message);
    else { setNotice(`✓ Alianza actualizada para ${a.display_name || 'admin'}.`); await load(); }
    setBusyId(null);
  }

  async function saveDiscord(a: AdminRow) {
    const raw = (discordDrafts.get(a.id) ?? links.get(a.id)?.discord_user_id ?? '').trim();
    setError(''); setNotice('');
    if (!/^[0-9]{5,25}$/.test(raw)) { setError('ID de Discord inválido: solo números (5-25 dígitos).'); return; }
    setBusyId(a.id);
    const { error } = await publicDb.from('staff_discord_links').upsert({
      admin_user_id: a.id, discord_user_id: raw, enabled: links.get(a.id)?.enabled ?? true,
      updated_at: new Date().toISOString(),
    });
    if (error) setError(error.message);
    else { setNotice(`✓ Discord guardado para ${a.display_name || 'admin'}.`); await load(); }
    setBusyId(null);
  }

  async function toggleDiscordEnabled(a: AdminRow) {
    const cur = links.get(a.id);
    if (!cur) return;
    setBusyId(a.id);
    const { error } = await publicDb.from('staff_discord_links').update({ enabled: !cur.enabled, updated_at: new Date().toISOString() }).eq('admin_user_id', a.id);
    if (error) setError(error.message);
    else await load();
    setBusyId(null);
  }

  async function removeDiscord(a: AdminRow) {
    if (!window.confirm(`¿Quitar el Discord vinculado de ${a.display_name || 'este admin'}?`)) return;
    setBusyId(a.id);
    const { error } = await publicDb.from('staff_discord_links').delete().eq('admin_user_id', a.id);
    if (error) setError(error.message);
    else await load();
    setBusyId(null);
  }

  async function testDiscord(a: AdminRow) {
    setBusyId(a.id); setError(''); setNotice('');
    try {
      if (a.id === me?.id) {
        const { error } = await publicDb.rpc('staff_discord_test');
        if (error) throw error;
      } else {
        const { error } = await publicDb.rpc('superadmin_discord_test', { p_admin_user_id: a.id });
        if (error) throw error;
      }
      setNotice(`📨 Prueba de DM enviada a ${a.display_name || 'admin'}.`);
    } catch (e: any) {
      setError('✖ ' + (e.message || 'Error al enviar la prueba'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Administradores</h1>
      <p style={{ color: colors.muted, margin: '0 0 24px' }}>
        Gestión de cuentas de administración
        {isSuperadmin && ' · controles completos de superadmin'}
      </p>

      {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}
      {notice && <div style={{ color: colors.success, marginBottom: 12 }}>{notice}</div>}

      {admins === null ? (
        <Loader />
      ) : admins.length === 0 ? (
        <EmptyState message="No hay admins registrados" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {admins.map((a) => {
            const alli = a.alliance_id ? alliances.find((x) => x.id === a.alliance_id) : null;
            const link = links.get(a.id);
            const isStaffRole = a.role === 'superadmin' || a.role === 'event_admin' || a.role === 'moderator';
            return (
              <div key={a.id} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>
                      {a.display_name || 'Admin'}
                      {a.id === me?.id && <span style={{ color: colors.muted, fontSize: 12 }}> (tú)</span>}
                    </h3>
                    <p style={{ fontSize: 12, color: colors.muted, margin: '6px 0 0', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {alli ? `${alli.name} [${alli.tag}]` : 'Sin alianza'} |
                      <Badge label={ROLE_LABEL[a.role] || a.role} tone={ROLE_TONE[a.role] || 'neutral'} />
                      <Badge label={a.status === 'active' ? 'ACTIVO' : a.status === 'suspended' ? 'SUSPENDIDO' : (a.status || '?')} tone={a.status === 'active' ? 'active' : 'danger'} />
                      {a.supremacy_player_id ? <span>Jugador #{a.supremacy_player_id}</span> : null}
                      <span>{formatDate(a.created_at)}</span>
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

                {/* ---- Controles superadmin ---- */}
                {isSuperadmin && (
                  <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 12, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: colors.muted, width: 140 }}>Alianza asignada</span>
                      <Select
                        value={a.alliance_id ?? ''}
                        disabled={busyId === a.id}
                        onChange={(e) => assignAlliance(a, e.target.value)}
                        style={{ width: 260 }}
                      >
                        <option value="">Sin alianza</option>
                        {alliances.map((al) => <option key={al.id} value={al.id}>{al.name} [{al.tag}]</option>)}
                      </Select>
                      {a.role === 'alliance_leader' && !a.alliance_id && (
                        <span style={{ fontSize: 12, color: colors.warning }}>⚠ Líder sin alianza: no verá su panel</span>
                      )}
                    </div>

                    {isStaffRole && (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: colors.muted, width: 140 }}>Discord (avisos DM)</span>
                        <input
                          value={discordDrafts.has(a.id) ? discordDrafts.get(a.id)! : (link?.discord_user_id ?? '')}
                          onChange={(e) => setDiscordDrafts(new Map(discordDrafts).set(a.id, e.target.value))}
                          placeholder="ID numérico de Discord"
                          style={{ ...styles.input, width: 200, marginBottom: 0 }}
                        />
                        <Button style={{ fontSize: 12 }} disabled={busyId === a.id} onClick={() => saveDiscord(a)}>
                          Guardar
                        </Button>
                        {link && (
                          <>
                            <Button variant="ghost" style={{ fontSize: 12 }} disabled={busyId === a.id} onClick={() => toggleDiscordEnabled(a)}>
                              {link.enabled ? '🔔 Activos' : '🔕 Desactivados'}
                            </Button>
                            <Button variant="ghost" style={{ fontSize: 12 }} disabled={busyId === a.id} onClick={() => testDiscord(a)}>
                              📨 Probar
                            </Button>
                            <Button variant="danger" style={{ fontSize: 12 }} disabled={busyId === a.id} onClick={() => removeDiscord(a)}>
                              Quitar
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
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
