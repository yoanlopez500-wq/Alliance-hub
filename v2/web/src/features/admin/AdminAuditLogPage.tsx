import { publicDb } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import Badge from '../../components/Badge';
import Section from '../../components/Section';
import { colors } from '../../theme';

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  table_name: string | null;
  row_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Auditoria — log de acciones administrativas (admin_audit_log).
 */
export default function AdminAuditLogPage() {
  const { data, loading, error } = useApi<AuditRow[]>(async () => {
    const { data, error: e } = await publicDb
      .from('admin_audit_log')
      .select('id, actor_id, actor_name, action, table_name, row_id, old_data, new_data, created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (e) throw new Error(e.message);
    return (data ?? []) as AuditRow[];
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ color: colors.text, margin: '0 0 4px' }}>🧾 Auditoría</h1>
      <p style={{ color: colors.muted, margin: '0 0 20px' }}>
        Registro de las últimas acciones administrativas de la plataforma.
      </p>
      {loading && <p style={{ color: colors.muted }}>Cargando…</p>}
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {data && (
        <Section title={`Últimas ${data.length} entradas`}>
          {data.length === 0 && <p style={{ color: colors.muted }}>Sin registros todavía.</p>}
          {data.map((r) => (
            <div key={r.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              gap: 12, padding: '10px 0', borderBottom: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 14, flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{r.action}</span>
                {r.actor_name && (
                  <span style={{ color: colors.muted, fontSize: 12 }}> · {r.actor_name}</span>
                )}
                {r.table_name && (
                  <span style={{ color: colors.muted, fontSize: 12 }}>
                    {' '}→ {r.table_name}{r.row_id ? `: ${String(r.row_id).slice(0, 8)}…` : ''}
                  </span>
                )}
                {(r.old_data || r.new_data) && (
                  <div style={{ color: colors.muted, fontSize: 12, marginTop: 2, wordBreak: 'break-all' }}>
                    {r.new_data ? JSON.stringify(r.new_data).slice(0, 160) : JSON.stringify(r.old_data).slice(0, 160)}
                  </div>
                )}
              </div>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {r.table_name && <Badge label={r.table_name} tone="neutral" />}
                <span style={{ color: colors.muted, fontSize: 12 }}>
                  {new Date(r.created_at).toLocaleString('es-ES')}
                </span>
              </span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
