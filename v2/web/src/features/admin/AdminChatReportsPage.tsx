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

interface ChatReport {
  id: string;
  channel: string | null;
  reported_message_id: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  reason: string | null;
  context_messages: unknown;
  status: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution: string | null;
  reported_at: string | null;
}

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };

const STATUS_TONE: Record<string, string> = {
  pending: 'warning',
  reviewed: 'global',
  resolved: 'active',
  dismissed: 'neutral',
};

/** AdminChatReportsPage — puerto de admin/chat-reports.html (shell v1 sin JS propio; implementación funcional sobre chat_reports). */
function ChatReports() {
  const [reports, setReports] = useState<ChatReport[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [actionReport, setActionReport] = useState<ChatReport | null>(null);
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      let q = publicDb.from('chat_reports').select('*').order('reported_at', { ascending: false }).limit(100);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error: rErr } = await q;
      if (rErr) throw rErr;
      setReports((data as ChatReport[]) || []);
    } catch (e: any) {
      setError(e.message || 'Error cargando reportes');
      setReports([]);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function resolve(status: 'resolved' | 'dismissed') {
    if (!actionReport) return;
    setSaving(true);
    try {
      const { data: sessData } = await publicDb.auth.getSession();
      const { error } = await publicDb.from('chat_reports').update({
        status,
        reviewed_by: sessData.session?.user.id || null,
        reviewed_at: new Date().toISOString(),
        resolution: resolution.trim() || null,
      }).eq('id', actionReport.id);
      if (error) throw error;
      setActionReport(null);
      setResolution('');
      await load();
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Reportes de Chat</h1>
          <p style={{ color: colors.muted, margin: 0 }}>Mensajes reportados por la comunidad</p>
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 180 }}>
          <option value="all">Todos</option>
          <option value="pending">Pendientes</option>
          <option value="reviewed">Revisados</option>
          <option value="resolved">Resueltos</option>
          <option value="dismissed">Desestimados</option>
        </Select>
      </div>

      {error && <div style={{ color: colors.danger, margin: '12px 0' }}>{error}</div>}

      {reports === null ? (
        <Loader />
      ) : reports.length === 0 ? (
        <EmptyState message="No hay reportes de chat" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {reports.map((r) => (
            <div key={r.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                    <strong style={{ fontSize: 14 }}>{r.channel || 'Canal desconocido'}</strong>
                    <Badge label={(r.status || 'pending').toUpperCase()} tone={STATUS_TONE[r.status || 'pending'] || 'warning'} />
                  </div>
                  <p style={{ fontSize: 13, margin: '0 0 6px' }}><strong>Reportante:</strong> {r.reporter_name || r.reporter_id || 'Anónimo'}</p>
                  {r.reason && <p style={{ fontSize: 13, margin: '0 0 6px' }}><strong>Motivo:</strong> {r.reason}</p>}
                  {r.resolution && <p style={{ fontSize: 13, color: colors.success, margin: '0 0 6px' }}><strong>Resolución:</strong> {r.resolution}</p>}
                  <p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>
                    {r.reported_at ? formatDate(r.reported_at) : ''}
                    {r.reported_message_id ? ` · Mensaje: ${r.reported_message_id}` : ''}
                  </p>
                </div>
                {(r.status === 'pending' || r.status === null) && (
                  <Button style={{ fontSize: 12 }} onClick={() => { setActionReport(r); setResolution(''); }}>Revisar</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {actionReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 480, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Revisar reporte — {actionReport.channel}</h3>
            <p style={{ fontSize: 14 }}><strong>Mensaje reportado:</strong> {actionReport.reported_message_id}</p>
            <label style={labelStyle}>Resolución</label>
            <TextArea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} placeholder="Decisión del moderador…" style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button onClick={() => resolve('resolved')} disabled={saving}>Resolver</Button>
              <Button variant="ghost" onClick={() => resolve('dismissed')} disabled={saving}>Desestimar</Button>
              <Button variant="ghost" onClick={() => setActionReport(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminChatReportsPage() {
  return (
    <AdminGate staffOnly>
      <ChatReports />
    </AdminGate>
  );
}
