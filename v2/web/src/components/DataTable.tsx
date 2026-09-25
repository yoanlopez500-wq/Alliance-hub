import type { ReactNode } from 'react';
import { colors } from '../theme';
import Loader from './Loader';
import EmptyState from './EmptyState';

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
};

/**
 * DataTable generica: reemplaza las ~6 tablas hand-rolled del v1.
 * <DataTable rows={...} columns={...} onRowClick={...} />
 */
export default function DataTable<T extends { id?: unknown }>({
  rows, columns, loading, empty, onRowClick,
}: {
  rows: T[] | null;
  columns: Column<T>[];
  loading?: boolean;
  empty?: string;
  onRowClick?: (row: T) => void;
}) {
  if (loading) return <Loader />;
  if (!rows || rows.length === 0) return <EmptyState message={empty ?? 'Sin datos'} />;
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${colors.border}`, borderRadius: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: colors.cardAlt, textAlign: 'left' }}>
            {columns.map((c) => (
              <th key={c.key} style={{ padding: '10px 14px', color: colors.muted, fontWeight: 600 }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={(row as any).id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                borderTop: `1px solid ${colors.border}`,
                cursor: onRowClick ? 'pointer' : undefined,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,143,0,0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '10px 14px', color: colors.text }}>
                  {c.render ? c.render(row) : String((row as any)[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
