import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import { formatDate, formatDateTime } from '../../lib/format';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Select, TextArea } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';

interface ReviewItem {
  id: string;
  strike_id: string;
  player_id: number;
  player_name: string | null;
  strike_type_name: string | null;
  reason: string | null;
  status: string;
  committee_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface PrecedentOpt { id: string; title: string }

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };

/**
 * AdminReviewCommitteePage — puerto de admin/review-committee.html.
 * Nota: en v1 el pageScript (admin-review-committee.js) estaba vacío, la página
 * tenía shell pero sin lógica. Aquí se porta el shell completo (stats, tabs,
 * modal aprobar/rechazar) con carga defensiva: si la tabla de revisiones no
 * existe en el proyecto, la página muestra estado vacío en lugar de romper.
 */
function ReviewCommittee() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [pending, setPending] = useState<ReviewItem[] | null>(null);
  const [history, setHistory] = useState<ReviewItem[] | null>(null);
  const [precedents, setPrecedents] = useState<PrecedentOpt[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [error, setError] = useState('');

  // Modal
  const [actionItem, setActionItem] = useState<ReviewItem | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [actionPrecedent, setActionPrecedent] = useState('');
  const [actionComment, setActionComment] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data: pData } = await publicDb.from('strike_review_requests')
        .select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(50);
      const pList = (pData as ReviewItem[]) || [];
      setPending(pList);
      setStats((s) => ({ ...s, pending: pList.length }));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: hData } = await publicDb.from('strike_review_requests')
        .select('*').neq('status', 'pending').order('reviewed_at', { ascending: false }).limit(50);
      const hList = ((hData as ReviewItem[]) || []).filter((h) => h.reviewed_at && new Date(h.reviewed_at) >= today);
      setHistory(hList);
      setStats((s) => ({
        ...s,
        approved: hList.filter((h) => h.status === 'approved').length,
        rejected: hList.filter((h) => h.status === 'rejected').length,
      }));

      const { data: prData } = await publicDb.from('rule_precedents').select('id, title').order('title');
      setPrecedents((prData as PrecedentOpt[]) || []);
    } catch (e: any) {
      setError('');
      setPending([]);
      setHistory([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAction(item: ReviewItem, type: 'approve' | 'reject') {
    setActionItem(item);
    setActionType(type);
    setActionPrecedent('');
    setActionComment('');
  }

  async function confirmAction() {
    if (!actionItem) return;
    setSaving(true);
    try {
      const { data: sessData } = await publicDb.auth.getSession();
      const session = sessData.session;
      const payload: Record<string, unknown> = {
        status: actionType === 'approve' ? 'approved' : 'rejected',
        committee_comment: actionComment.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session?.user.id || null,
      };
      if (actionType === 'approve' && actionPrecedent) payload.precedent_id = actionPrecedent;
      const { error } = await publicDb.from('strike_review_requests').update(payload).eq('id', actionItem.id);
      if (error) throw error;
      setActionItem(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error guardando decisión');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>🛠️ Comité de Revisión</h1>
          <p style={{ color: colors.muted, margin: 0 }}>Aprobar o rechazar strikes con nuevos precedentes propuestos.</p>
        </div>
        <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 999, fontWeight: 700, background: colors.border, color: colors.muted }}>Comité</span>
      </div>

      {error && <div style={{ color: colors.danger, margin: '12px 0' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '20px 0' }}>
        {([
          ['Pendientes', stats.pending, colors.accent],
          ['Aprobados (hoy)', stats.approved, colors.success],
          ['Rechazados (hoy)', stats.rejected, colors.danger],
        ] as [string, number, string][]).map(([label, value, color]) => (
          <div key={label} style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 12, color: colors.muted }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 20, borderBottom: `1px solid ${colors.border}` }}>
        <button onClick={() => setTab('pending')} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'pending' ? colors.accent : 'transparent'}`, color: tab === 'pending' ? colors.accent : colors.muted, padding: '0 0 10px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>⏳ Pendientes</button>
        <button onClick={() => setTab('history')} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'history' ? colors.accent : 'transparent'}`, color: tab === 'history' ? colors.accent : colors.muted, padding: '0 0 10px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>📋 Historial</button>
      </div>

      {tab === 'pending' ? (
        pending === null ? <Loader /> : pending.length === 0 ? <EmptyState message="No hay revisiones pendientes" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((item) => (
              <div key={item.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Strike — {item.player_name || 'Jugador ' + item.player_id}</h3>
                    <p style={{ fontSize: 13, color: colors.muted, margin: '4px 0 0' }}>{item.strike_type_name || 'Tipo desconocido'}</p>
                    {item.reason && <p style={{ fontSize: 13, margin: '6px 0 0' }}>{item.reason}</p>}
                    <p style={{ fontSize: 12, color: colors.muted, margin: '6px 0 0' }}>{formatDate(item.created_at)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button onClick={() => openAction(item, 'approve')}>Aprobar</Button>
                    <Button variant="danger" onClick={() => openAction(item, 'reject')}>Rechazar</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        history === null ? <Loader /> : history.length === 0 ? <EmptyState message="Sin historial reciente" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((item) => (
              <div key={item.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Strike — {item.player_name || 'Jugador ' + item.player_id}</h3>
                    {item.committee_comment && <p style={{ fontSize: 13, color: colors.muted, margin: '4px 0 0' }}>{item.committee_comment}</p>}
                    <p style={{ fontSize: 12, color: colors.muted, margin: '6px 0 0' }}>{item.reviewed_at ? formatDateTime(item.reviewed_at) : ''}</p>
                  </div>
                  <Badge label={item.status === 'approved' ? 'APROBADO' : 'RECHAZADO'} tone={item.status === 'approved' ? 'active' : 'danger'} />
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {actionItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', color: '#0f172a', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>{actionType === 'approve' ? 'Aprobar Strike' : 'Rechazar Strike'}</h3>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Precedente a vincular (opcional)</label>
            <Select value={actionPrecedent} onChange={(e) => setActionPrecedent(e.target.value)} style={{ width: '100%', background: '#fff', color: '#0f172a', borderColor: '#cbd5e1', marginBottom: 12 }}>
              <option value="">Crear nuevo precedente…</option>
              {precedents.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Comentario del comité</label>
            <TextArea value={actionComment} onChange={(e) => setActionComment(e.target.value)} rows={3} placeholder="Razón de la decisión…" style={{ width: '100%', background: '#fff', color: '#0f172a', borderColor: '#cbd5e1' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setActionItem(null)}>Cancelar</Button>
              <Button onClick={confirmAction} disabled={saving} style={actionType === 'reject' ? { background: colors.danger } : undefined}>
                {saving ? 'Guardando…' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminReviewCommitteePage() {
  return (
    <AdminGate staffOnly>
      <ReviewCommittee />
    </AdminGate>
  );
}
