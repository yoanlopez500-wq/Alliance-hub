import { useState } from 'react';
import { serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/DataTable';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import { Input, TextArea, Select } from '../../components/Field';
import { styles, colors } from '../../theme';

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

  if (error && /superadmin/.test(error)) {
    return <p style={{ color: colors.muted }}>Este panel es exclusivo del superadmin.</p>;
  }

  return (
    <div>
      <h1 style={{ color: colors.text }}>Tipos de partida</h1>
      <p style={{ color: colors.muted, marginTop: -8 }}>
        Superadmin. Las exclusivas solo las usa la alianza asignada (el servidor y la base lo validan).
      </p>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {feedback && <p style={{ color: colors.info }}>{feedback}</p>}

      <form onSubmit={crear} style={{ ...styles.card, display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <Input placeholder="slug (ej: guerra_32)" value={nuevo.id} onChange={(e) => setNuevo({ ...nuevo, id: e.target.value })}
          style={{ flex: 1, minWidth: 140, marginBottom: 0 }} />
        <Input placeholder="Nombre" value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
          style={{ flex: 1, minWidth: 140, marginBottom: 0 }} />
        <Input placeholder="Descripción" value={nuevo.description} onChange={(e) => setNuevo({ ...nuevo, description: e.target.value })}
          style={{ flex: 2, minWidth: 200, marginBottom: 0 }} />
        <Select value={nuevo.scope} onChange={(e) => setNuevo({ ...nuevo, scope: e.target.value as MatchType['scope'] })}
          style={{ width: 170, marginBottom: 0 }}>
          <option value="global">Global</option>
          <option value="internal_standard">Interna estándar</option>
          <option value="exclusive">Exclusiva</option>
        </Select>
        <Button type="submit">Crear</Button>
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
