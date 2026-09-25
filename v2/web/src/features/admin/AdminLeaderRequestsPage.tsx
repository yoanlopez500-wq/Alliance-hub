import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import { formatDate } from '../../lib/format';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Select, TextArea } from '../../components/Field';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { useAdmin } from '../../lib/admin';
import { generateInviteCode } from '../../lib/invites';

interface LeaderRequest {
  id: string;
  player_id: number;
  display_name: string;
  supremacy_player_id: number | null;
  alliance_name: string;
  alliance_tag: string;
  alliance_description: string | null;
  discord_handle: string | null;
  member_count: number | null;
  evidence_url: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

interface LeaderInvite {
  id: string;
  player_id: number;
  used: boolean;
  expires_at: string | null;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'PENDIENTE', color: colors.warning },
  under_review: { label: 'EN REVISIÓN', color: colors.info },
  approved: { label: 'APROBADO', color: colors.success },
  rejected: { label: 'RECHAZADO', color: colors.danger },
};

const INVITE_STATUS_META: Record<string, { label: string; color: string }> = {
  used: { label: 'INVITE USADA', color: colors.success },
  valid: { label: 'INVITE VÁLIDA', color: colors.info },
  expired: { label: 'INVITE EXPIRADA', color: colors.warning },
  missing: { label: 'SIN INVITE', color: colors.danger },
};

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };
const kvStyle: React.CSSProperties = { background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12 };

function leaderInviteStatus(invites: LeaderInvite[] | undefined): 'used' | 'valid' | 'expired' | 'missing' {
  if (!invites || invites.length === 0) return 'missing';
  const now = new Date();
  if (invites.some((i) => i.used)) return 'used';
  const hasValid = invites.some((i) => !i.used && (!i.expires_at || new Date(i.expires_at) > now));
  return hasValid ? 'valid' : 'expired';
}

/** AdminLeaderRequestsPage — puerto de admin-leader-requests.js. */
function LeaderRequests() {
  const { admin } = useAdmin();
  const [requests, setRequests] = useState<LeaderRequest[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [invitesByPlayer, setInvitesByPlayer] = useState<Record<number, LeaderInvite[]>>({});
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [approveTarget, setApproveTarget] = useState<LeaderRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaderRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [inviteModal, setInviteModal] = useState<{ alliance: string; player: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const canWrite = admin?.role === 'superadmin' || admin?.role === 'event_admin';

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  const load = useCallback(async () => {
    setError('');
    try {
      let q = publicDb.from('alliance_leader_requests').select('*').order('created_at', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error: rErr } = await q;
      if (rErr) throw rErr;
      const list = (data as LeaderRequest[]) || [];
      setRequests(list);

      const approvedPlayerIds = list.filter((r) => r.status === 'approved').map((r) => r.player_id);
      const map: Record<number, LeaderInvite[]> = {};
      if (approvedPlayerIds.length > 0) {
        try {
          const { data: invites } = await publicDb.from('admin_invites')
            .select('id, player_id, used, expires_at')
            .eq('role', 'alliance_leader')
            .in('player_id', approvedPlayerIds);
          ((invites as LeaderInvite[]) || []).forEach((inv) => {
            if (!map[inv.player_id]) map[inv.player_id] = [];
            map[inv.player_id].push(inv);
          });
        } catch (invEx) { console.error('[Requests] Error cargando invites:', invEx); }
      }
      setInvitesByPlayer(map);
    } catch (e: any) {
      setError(e.message || 'Error cargando solicitudes');
      setRequests([]);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function regenerateInvite(r: LeaderRequest) {
    if (!canWrite) { showToast('No tienes permisos para esta acción'); return; }
    setBusy(true);
    try {
      let { data: alliance } = await publicDb.from('alliances').select('id').eq('name', r.alliance_name).maybeSingle();
      if (!alliance && r.alliance_tag) {
        const res = await publicDb.from('alliances').select('id').eq('tag', r.alliance_tag).maybeSingle();
        alliance = res.data;
      }
      if (!alliance) {
        showToast('Error: no existe la alianza "' + r.alliance_name + '" en el sistema.');
        return;
      }
      const inviteCode = generateInviteCode();
      const { error: iErr } = await publicDb.from('admin_invites').insert({
        code: inviteCode,
        role: 'alliance_leader',
        created_by: admin?.id,
        player_id: r.player_id,
        alliance_id: (alliance as { id: string }).id,
        used: false,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (iErr) throw iErr;
      showToast('Nuevo código generado: ' + inviteCode + ' (expira en 7 días)');
      await load();
    } catch (e: any) {
      showToast('Error regenerando invite: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmApprove() {
    if (!canWrite) { showToast('No tienes permisos para esta acción'); return; }
    if (!approveTarget) return;
    const r = approveTarget;
    setApproveTarget(null);
    setBusy(true);
    try {
      const { data: existing } = await publicDb.from('alliances').select('id').eq('name', r.alliance_name).maybeSingle();
      let allianceId: string;
      if (existing) {
        allianceId = (existing as { id: string }).id;
      } else {
        const { data: newAlliance, error: ae } = await publicDb.from('alliances').insert({
          name: r.alliance_name,
          tag: r.alliance_tag,
          description: r.alliance_description || '',
          leader_id: r.player_id,
          status: 'active',
        }).select('id').single();
        if (ae) throw ae;
        allianceId = (newAlliance as { id: string }).id;
      }

      const { error: pe } = await publicDb.from('players').update({ current_alliance_id: allianceId }).eq('id', r.player_id);
      if (pe) throw pe;

      const { error: me } = await publicDb.from('alliance_memberships').insert({
        player_id: r.player_id,
        alliance_id: allianceId,
        role: 'leader',
        status: 'approved',
        requested_by: 'leader',
      });
      if (me) {
        if (me.code === '23505') {
          await publicDb.from('alliance_memberships').update({ role: 'leader', status: 'approved' })
            .eq('player_id', r.player_id).eq('alliance_id', allianceId);
        } else {
          throw me;
        }
      }

      const { error: re } = await publicDb.from('alliance_leader_requests').update({
        status: 'approved',
        reviewed_by: admin?.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', r.id);
      if (re) throw re;

      const inviteCode = generateInviteCode();
      const { error: ie } = await publicDb.from('admin_invites').insert({
        code: inviteCode,
        role: 'alliance_leader',
        created_by: admin?.id,
        player_id: r.player_id,
        alliance_id: allianceId,
        used: false,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (ie) {
        showToast('Alianza creada pero error al generar código de invitación');
        await load();
        return;
      }

      setInviteModal({ alliance: r.alliance_name, player: r.display_name, code: inviteCode });
      showToast('Solicitud aprobada. Alianza creada y código generado.');
      await load();
    } catch (e: any) {
      showToast('Error: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReject() {
    if (!canWrite) { showToast('No tienes permisos para esta acción'); return; }
    if (!rejectTarget) return;
    const r = rejectTarget;
    setRejectTarget(null);
    setBusy(true);
    try {
      const { error } = await publicDb.from('alliance_leader_requests').update({
        status: 'rejected',
        reviewed_by: admin?.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectReason.trim() || null,
      }).eq('id', r.id);
      if (error) throw error;
      showToast('Solicitud rechazada.');
      await load();
    } catch (e: any) {
      showToast('Error: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function copyInviteCode() {
    if (!inviteModal) return;
    navigator.clipboard.writeText(inviteModal.code).then(
      () => showToast('Código copiado al portapapeles'),
      () => showToast('No se pudo copiar: ' + inviteModal.code),
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Solicitudes de Liderazgo</h1>
          <p style={{ color: colors.muted, margin: 0 }}>Aprueba o rechaza solicitudes de nuevos líderes de alianza</p>
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 180 }}>
          <option value="all">Todas</option>
          <option value="pending">Pendientes</option>
          <option value="under_review">En revisión</option>
          <option value="approved">Aprobadas</option>
          <option value="rejected">Rechazadas</option>
        </Select>
      </div>

      {error && <div style={{ color: colors.danger, margin: '12px 0' }}>{error}</div>}
      {toast && <div style={{ background: colors.success + '20', color: colors.success, padding: '10px 14px', borderRadius: 8, margin: '12px 0' }}>{toast}</div>}
      {busy && <Loader label="Procesando…" />}

      {requests === null ? (
        <Loader />
      ) : requests.length === 0 ? (
        <EmptyState message="No hay solicitudes" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {requests.map((r) => {
            const meta = STATUS_META[r.status] || { label: r.status, color: colors.muted };
            const displayDesc = r.alliance_description
              ? r.alliance_description.length > 160 ? r.alliance_description.substring(0, 160) + '…' : r.alliance_description
              : 'Sin descripción';
            const invSt = leaderInviteStatus(invitesByPlayer[r.player_id]);
            const invMeta = INVITE_STATUS_META[invSt];
            const actionable = r.status === 'pending' || r.status === 'under_review';
            return (
              <div key={r.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{r.display_name || 'Jugador ' + r.player_id}</h3>
                    <p style={{ fontSize: 13, color: colors.accent, margin: '2px 0 0', fontWeight: 700 }}>{r.alliance_name} [{r.alliance_tag}]</p>
                  </div>
                  <span style={{ background: meta.color + '20', color: meta.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{meta.label}</span>
                </div>

                <p style={{ fontSize: 13, color: colors.muted, margin: 0 }}>{displayDesc}</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div style={kvStyle}><span style={{ color: colors.muted }}>ID Jugador:</span> <span style={{ fontFamily: 'monospace' }}>{r.player_id}</span></div>
                  <div style={kvStyle}><span style={{ color: colors.muted }}>Miembros:</span> {r.member_count || '?'}</div>
                  <div style={kvStyle}><span style={{ color: colors.muted }}>Discord:</span> {r.discord_handle || '-'}</div>
                  {r.evidence_url && (
                    <div style={kvStyle}><a href={r.evidence_url} target="_blank" rel="noreferrer" style={{ color: colors.info }}>Ver evidencia</a></div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: colors.muted, borderTop: `1px solid ${colors.border}`, paddingTop: 8, marginTop: 'auto' }}>
                  <span>Solicitado {formatDate(r.created_at)}</span>
                  {r.rejection_reason && <span style={{ color: colors.danger }}>Motivo: {r.rejection_reason}</span>}
                </div>

                {actionable ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button onClick={() => setApproveTarget(r)} disabled={!canWrite} style={{ flex: 1, background: colors.success }}>✓ Aprobar</Button>
                    <Button variant="danger" onClick={() => { setRejectTarget(r); setRejectReason(''); }} disabled={!canWrite} style={{ flex: 1 }}>✕ Rechazar</Button>
                  </div>
                ) : r.status === 'approved' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ background: invMeta.color + '20', color: invMeta.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, alignSelf: 'flex-start' }}>{invMeta.label}</span>
                    {(invSt === 'expired' || invSt === 'missing') && (
                      <Button onClick={() => regenerateInvite(r)} disabled={!canWrite} style={{ background: colors.info }}>⟳ Regenerar invite</Button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal aprobar */}
      {approveTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 480, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Aprobar solicitud</h3>
            <p style={{ fontSize: 14 }}>
              ¿Aprobar a <strong style={{ color: colors.accent }}>{approveTarget.display_name}</strong> como líder de{' '}
              <strong style={{ color: colors.accent }}>{approveTarget.alliance_name} [{approveTarget.alliance_tag}]</strong>?
            </p>
            <p style={{ fontSize: 13, color: colors.muted }}>Se creará la alianza, se asignará como líder y se generará un código de invitación.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button onClick={confirmApprove} disabled={busy}>Confirmar</Button>
              <Button variant="ghost" onClick={() => setApproveTarget(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rechazar */}
      {rejectTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 480, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Rechazar solicitud</h3>
            <p style={{ fontSize: 14 }}>
              ¿Rechazar la solicitud de <strong style={{ color: colors.danger }}>{rejectTarget.display_name}</strong> para liderar{' '}
              <strong style={{ color: colors.danger }}>{rejectTarget.alliance_name}</strong>?
            </p>
            <label style={labelStyle}>Motivo (opcional)</label>
            <TextArea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button variant="danger" onClick={confirmReject} disabled={busy}>Rechazar</Button>
              <Button variant="ghost" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal invite generado */}
      {inviteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.accent}`, borderRadius: 16, padding: 24, maxWidth: 440, width: '100%', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>✓ Código de invitación generado</h3>
            <p style={{ fontSize: 14 }}>{inviteModal.player} — <strong>{inviteModal.alliance}</strong></p>
            <div style={{ background: colors.bg, border: `1px dashed ${colors.accent}`, borderRadius: 10, padding: '14px 20px', margin: '14px 0', fontFamily: 'monospace', fontSize: 22, letterSpacing: 2, color: colors.accent, fontWeight: 700 }}>
              {inviteModal.code}
            </div>
            <p style={{ fontSize: 12, color: colors.muted }}>Válido por 7 días. Compártelo solo con el líder.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Button onClick={copyInviteCode}>Copiar código</Button>
              <Button variant="ghost" onClick={() => setInviteModal(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminLeaderRequestsPage() {
  return (
    <AdminGate staffOnly>
      <LeaderRequests />
    </AdminGate>
  );
}
