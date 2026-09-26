import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import { formatDate, formatDateTime } from '../../lib/format';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Select, TextArea } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';

interface Report {
  id: string;
  reported_player_id: number;
  reported_player_name: string | null;
  player_id: number;
  player_name: string | null;
  match_id: string | null;
  rule_section_id: string | null;
  report_type: string | null;
  description: string;
  status: string;
  admin_response: string | null;
  strike_applied: boolean | null;
  evidence_urls: string[] | null;
  created_at: string;
}

interface RuleOpt { id: string; title: string }

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'PENDIENTE', color: colors.warning },
  investigating: { label: 'EN INVESTIGACIÓN', color: colors.info },
  resolved: { label: 'RESUELTO', color: colors.success },
  dismissed: { label: 'DESESTIMADO', color: colors.muted },
};

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };

function ReportStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || { label: status || '?', color: colors.muted };
  return <span style={{ background: meta.color + '20', color: meta.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{meta.label}</span>;
}

/** AdminReportsPage — puerto de admin-reports.js. */
function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [rules, setRules] = useState<RuleOpt[]>([]);
  const [ruleFilter, setRuleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Report | null>(null);
  const [adminResponse, setAdminResponse] = useState('');
  const [precedents, setPrecedents] = useState<{ title: string; description: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const ruleMap: Record<string, string> = Object.fromEntries(rules.map((r) => [r.id, r.title]));

  const loadReports = useCallback(async () => {
    setError('');
    try {
      let q = publicDb.from('player_reports').select('*, evidence_urls').order('created_at', { ascending: false }).limit(50);
      if (ruleFilter) q = q.eq('rule_section_id', ruleFilter);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error: rErr } = await q;
      if (rErr) throw rErr;
      setReports((data as Report[]) || []);
    } catch (e: any) {
      setError(e.message || 'Error cargando reportes');
      setReports([]);
    }
  }, [ruleFilter, statusFilter]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await publicDb.from('rule_sections').select('id, title').order('order_index');
        setRules((data as RuleOpt[]) || []);
      } catch { /* filtros opcionales */ }
    })();
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  async function openDetail(r: Report) {
    setDetail(r);
    setAdminResponse(r.admin_response || '');
    setPrecedents([]);
    if (r.rule_section_id) {
      try {
        const { data } = await publicDb.from('rule_precedents').select('title, description').eq('rule_section_id', r.rule_section_id);
        setPrecedents((data as { title: string; description: string }[]) || []);
      } catch { /* precedentes opcionales */ }
    }
  }

  async function setStatus(status: 'resolved' | 'dismissed') {
    if (!detail) return;
    setSaving(true);
    try {
      const { data: sessData } = await publicDb.auth.getSession();
      const session = sessData.session;
      if (!session) throw new Error('Sesión admin no encontrada');
      const payload: Record<string, unknown> = {
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: session.user.id,
      };
      if (adminResponse.trim()) payload.admin_response = adminResponse.trim();
      const { error: uErr } = await publicDb.from('player_reports').update(payload).eq('id', detail.id);
      if (uErr) throw uErr;
      setDetail(null);
      await loadReports();
    } catch (e: any) {
      setError(e.message || 'Error actualizando reporte');
    } finally {
      setSaving(false);
    }
  }

  function applyStrikeFromReport(r: Report) {
    const p = new URLSearchParams();
    p.set('prefill_report', r.id);
    if (r.reported_player_id) p.set('prefill_player', String(r.reported_player_id));
    if (r.match_id) p.set('prefill_match', r.match_id);
    // Client-side: una recarga completa a /admin/strikes?... perderia la query
    // en el redirect del 404.html de GitHub Pages (morfa en el 404 de la SPA).
    navigate('/admin/conducta?tab=strikes&' + p.toString());
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Reportes de Jugadores</h1>
      <p style={{ color: colors.muted, margin: '0 0 24px' }}>Revisa y resuelve los reportes de la comunidad</p>

      {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Regla</label>
          <Select value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">Todas las reglas</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </Select>
        </div>
        <div>
          <label style={labelStyle}>Estado</label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 180 }}>
            <option value="all">Todos</option>
            <option value="pending">Pendientes</option>
            <option value="investigating">En investigación</option>
            <option value="resolved">Resueltos</option>
            <option value="dismissed">Desestimados</option>
          </Select>
        </div>
      </div>

      {reports === null ? (
        <Loader />
      ) : reports.length === 0 ? (
        <EmptyState message="No hay reportes" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reports.map((r) => (
            <div key={r.id} style={{ ...cardStyle, cursor: 'pointer' }} onClick={() => openDetail(r)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Reporte contra {r.reported_player_name || 'jugador #' + r.reported_player_id}</h3>
                  <p style={{ fontSize: 13, color: colors.muted, margin: '6px 0 0' }}>{(r.description || '').substring(0, 120)}{(r.description || '').length > 120 ? '…' : ''}</p>
                </div>
                <ReportStatusBadge status={r.status} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                <Badge label={r.rule_section_id && ruleMap[r.rule_section_id] ? ruleMap[r.rule_section_id] : 'Regla #' + r.rule_section_id} tone="global" />
                {r.evidence_urls && r.evidence_urls.length > 0 && <Badge label={'📷 ' + r.evidence_urls.length} tone="warning" />}
                {r.strike_applied && <Badge label="⚡ Strike" tone="purple" />}
                <span style={{ fontSize: 12, color: colors.muted }}>{formatDate(r.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setDetail(null)}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Reporte contra {detail.reported_player_name || 'jugador #' + detail.reported_player_id}</h3>
            <div style={{ marginBottom: 12 }}><ReportStatusBadge status={detail.status} /></div>
            <p style={{ fontSize: 14 }}><strong>Reportante:</strong> {detail.player_name || 'jugador #' + detail.player_id}</p>
            <p style={{ fontSize: 14 }}><strong>Descripción:</strong> {detail.description}</p>
            <p style={{ fontSize: 14 }}><strong>Regla:</strong> {detail.rule_section_id && ruleMap[detail.rule_section_id] ? ruleMap[detail.rule_section_id] : 'Regla #' + detail.rule_section_id}</p>
            {detail.admin_response && <p style={{ fontSize: 13, color: colors.muted }}><strong>Respuesta admin:</strong> {detail.admin_response}</p>}
            <p style={{ fontSize: 12, color: colors.muted }}>Fecha: {formatDateTime(detail.created_at)}</p>

            {detail.evidence_urls && detail.evidence_urls.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: colors.accent, margin: '12px 0 8px' }}>📷 Evidencia adjunta:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {detail.evidence_urls.filter((u) => typeof u === 'string' && /^(https?:\/\/|\/|\.\.?\/)/i.test(u.trim())).map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer">
                      {/\.(webm|mp4|mov)(\?|$)/i.test(u)
                        ? <video src={u} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8 }} />
                        : <img src={u} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8 }} />}
                    </a>
                  ))}
                </div>
              </>
            )}

            {precedents.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: colors.accent, margin: '12px 0 8px' }}>⚖️ Precedentes relacionados:</h4>
                {precedents.map((p, i) => (
                  <p key={i} style={{ fontSize: 13, margin: '4px 0' }}>• <strong>{p.title}:</strong> {p.description}</p>
                ))}
              </>
            )}

            <label style={{ ...labelStyle, marginTop: 16 }}>Respuesta del admin</label>
            <TextArea value={adminResponse} onChange={(e) => setAdminResponse(e.target.value)} rows={3} placeholder="Respuesta visible para el reportante…" style={{ width: '100%' }} />

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Button onClick={() => setStatus('resolved')} disabled={saving || detail.status === 'resolved'}>Resolver</Button>
              <Button variant="ghost" onClick={() => setStatus('dismissed')} disabled={saving || detail.status === 'dismissed'}>Desestimar</Button>
              <Button variant="danger" onClick={() => applyStrikeFromReport(detail)}>Aplicar strike</Button>
              <Button variant="ghost" onClick={() => setDetail(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <AdminGate staffOnly>
      <Reports />
    </AdminGate>
  );
}
