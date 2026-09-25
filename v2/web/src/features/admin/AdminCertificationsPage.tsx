import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import { formatDate } from '../../lib/format';
import AdminGate from '../../components/AdminGate';
import { Select } from '../../components/Field';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';

interface LeaderRequest {
  id: string;
  player_id: number;
  display_name: string;
  alliance_name: string;
  alliance_tag: string;
  alliance_description: string | null;
  discord_handle: string | null;
  member_count: number | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'PENDIENTE', color: colors.warning },
  under_review: { label: 'EN REVISIÓN', color: colors.info },
  approved: { label: 'APROBADO', color: colors.success },
  rejected: { label: 'RECHAZADO', color: colors.danger },
};

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20 };

/** AdminCertificationsPage — puerto de admin-certifications.js (solo lectura). */
function Certifications() {
  const [requests, setRequests] = useState<LeaderRequest[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState({ pending: 0, under_review: 0, approved: 0, rejected: 0 });

  const load = useCallback(async () => {
    try {
      let q = publicDb.from('alliance_leader_requests').select('*').order('created_at', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      setRequests((data as LeaderRequest[]) || []);

      const { data: statsData } = await publicDb.from('alliance_leader_requests').select('status');
      const counts = { pending: 0, under_review: 0, approved: 0, rejected: 0 };
      ((statsData as { status: string }[]) || []).forEach((s) => {
        if (counts[s.status as keyof typeof counts] !== undefined) counts[s.status as keyof typeof counts]++;
      });
      setStats(counts);
    } catch (e) {
      console.error('[Certifications]', e);
      setRequests([]);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Certificaciones</h1>
          <p style={{ color: colors.muted, margin: 0 }}>Vista de solo lectura de solicitudes de liderazgo</p>
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 180 }}>
          <option value="all">Todas</option>
          <option value="pending">Pendientes</option>
          <option value="under_review">En revisión</option>
          <option value="approved">Aprobadas</option>
          <option value="rejected">Rechazadas</option>
        </Select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '20px 0' }}>
        {([
          ['Pendientes', stats.pending, colors.warning],
          ['En revisión', stats.under_review, colors.info],
          ['Aprobadas', stats.approved, colors.success],
          ['Rechazadas', stats.rejected, colors.danger],
        ] as [string, number, string][]).map(([label, value, color]) => (
          <div key={label} style={{ ...cardStyle, textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 12, color: colors.muted }}>{label}</div>
          </div>
        ))}
      </div>

      {requests === null ? (
        <Loader />
      ) : requests.length === 0 ? (
        <EmptyState message="No hay solicitudes" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map((r) => {
            const meta = STATUS_META[r.status] || { label: r.status, color: colors.muted };
            return (
              <div key={r.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 18 }}>{r.alliance_name} <span style={{ color: colors.muted }}>[{r.alliance_tag}]</span></h3>
                    <p style={{ fontSize: 13, color: colors.muted, margin: '6px 0 0' }}>
                      Solicitante: <strong style={{ color: colors.text }}>{r.display_name || 'N/A'}</strong> (ID: {r.player_id})
                    </p>
                    {r.alliance_description && <p style={{ fontSize: 13, color: colors.muted, margin: '8px 0 0' }}>{r.alliance_description}</p>}
                    <p style={{ fontSize: 12, color: colors.muted, margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span>👥 Miembros: {r.member_count || '?'}</span>
                      <span>💬 Discord: {r.discord_handle || '-'}</span>
                      <span>📅 {formatDate(r.created_at)}</span>
                    </p>
                  </div>
                  <span style={{ background: meta.color + '20', color: meta.color, padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{meta.label}</span>
                </div>
                {r.rejection_reason && <p style={{ fontSize: 13, color: colors.danger, margin: '10px 0 0' }}>Motivo: {r.rejection_reason}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminCertificationsPage() {
  return (
    <AdminGate staffOnly>
      <Certifications />
    </AdminGate>
  );
}
