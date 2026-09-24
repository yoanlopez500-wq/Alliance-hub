import { useState } from 'react';
import { serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/DataTable';
import Badge from '../../components/Badge';

type MatchType = {
  id: string; name: string; description: string | null; color: string;
  scope: 'global' | 'internal_standard' | 'exclusive';
  alliance_id: string | null; order_index: number;
};

const SCOPE_LABEL: Record<MatchType['scope'], { label: string; tone: string }> = {
  global: { label: 'Global', tone: 'global' },
  internal_standard: { label: 'Interna estándar', tone: 'internal_standard' },
  exclusive: { label: 'Exclusiva', tone: 'exclusive' },
};

/**
 * Panel superadmin de tipos de partida (reemplaza los hardcodeos del v1).
 */
export default function MatchTypesPage() {
  const [nuevo, setNuevo] = useState({ id: '', name: '', description: '', scope: 'global' as MatchType['scope'] });
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: types, loading, error, reload } = useApi<MatchType[]>(
    () => serverApi.get('/match-types'),
    []
  );

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    try {
      await serverApi.post('/match-types', nuevo);
      setFeedback(`Tipo "${nuevo.name}" creado.`);
      setNuevo({ id: '', name: '', description: '', scope: 'global' });
      reload();
    } catch (e2: any) {
      setFeedback(`Error: ${e2.message}`);
    }
  }

  async function toggle(t: MatchType) {
    await serverApi.put(`/match-types/${t.id}`, { ...t, is_active: true /* placeholder */ });
    reload();
  }

  return (
    <div>
      <h1 style={{ color: '#fff' }}>Tipos de partida</h1>
      <p style={{ color: '#9fa8da', marginTop: -8 }}>
        Superadmin. Las exclusivas solo las usa la alianza asignada (el servidor y la base lo validan).
      </p>
      {error && <p style={{ color: '#ef5350' }}>{error}</p>}
      {feedback && <p style={{ color: '#4fc3f7' }}>{feedback}</p>}

      <form onSubmit={crear} style={{
        display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
        background: '#11183a', padding: 14, borderRadius: 12, border: '1px solid #1a237e',
      }}>
        <input placeholder="slug (ej: guerra_32)" value={nuevo.id} onChange={(e) => setNuevo({ ...nuevo, id: e.target.value })}
          style={{ flex: 1, minWidth: 140, padding: '10px 12px', borderRadius: 8, border: '1px solid #1a237e', background: '#0d1330', color: '#e8eaf6' }} />
        <input placeholder="Nombre" value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
          style={{ flex: 1, minWidth: 140, padding: '10px 12px', borderRadius: 8, border: '1px solid #1a237e', background: '#0d1330', color: '#e8eaf6' }} />
        <input placeholder="Descripción" value={nuevo.description} onChange={(e) => setNuevo({ ...nuevo, description: e.target.value })}
          style={{ flex: 2, minWidth: 200, padding: '10px 12px', borderRadius: 8, border: '1px solid #1a237e', background: '#0d1330', color: '#e8eaf6' }} />
        <select value={nuevo.scope} onChange={(e) => setNuevo({ ...nuevo, scope: e.target.value as MatchType['scope'] })}
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #1a237e', background: '#0d1330', color: '#e8eaf6' }}>
          <option value="global">Global</option>
          <option value="internal_standard">Interna estándar</option>
          <option value="exclusive">Exclusiva</option>
        </select>
        <button type="submit" style={{
          background: 'linear-gradient(90deg,#ff6f00,#ff8f00)', color: '#fff',
          border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
        }}>Crear</button>
      </form>

      <DataTable<MatchType>
        rows={types}
        loading={loading}
        columns={[
          { key: 'id', header: 'Slug' },
          { key: 'name', header: 'Nombre' },
          { key: 'description', header: 'Descripción' },
          {
            key: 'scope', header: 'Alcance',
            render: (t) => <Badge label={SCOPE_LABEL[t.scope].label} tone={SCOPE_LABEL[t.scope].tone} />,
          },
          { key: 'order_index', header: 'Orden' },
        ]}
      />
    </div>
  );
}
