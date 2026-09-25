import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { colors } from '../../theme';
import DataTable from '../../components/DataTable';
import Reveal from '../../components/Reveal';

type Alliance = {
  id: string; name: string; tag: string; description: string | null;
  member_count?: number | null;
  profile?: { accent_color?: string; welcome_text?: string | null } | null;
};

/**
 * Directorio publico de alianzas (v2): la puerta de entrada al perfil
 * publico de cada alianza (tablon, reglamento, partidas, miembros).
 * Lectura anon, sin login.
 */
export default function AlianzasPage() {
  const { data: alliances, loading, error } = useApi<Alliance[]>(async () => {
    const { data, error: e } = await publicDb
      .from('alliances')
      .select('id, name, tag, description, profile')
      .order('name');
    if (e) throw new Error(e.message);
    return data as Alliance[];
  }, []);

  return (
    <div>
      <Reveal>
        <h1 style={{ color: colors.text }}>Alianzas</h1>
        <p style={{ color: colors.muted, marginTop: -8 }}>
          Directorio público: toca una alianza para ver su perfil, tablón, reglamento y miembros.
        </p>
      </Reveal>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      <Reveal delay={80}>
        <DataTable<Alliance>
          rows={alliances}
          loading={loading}
          empty="Todavía no hay alianzas registradas"
          onRowClick={(a) => { window.location.href = `/alianzas/${a.id}`; }}
          columns={[
            {
              key: 'name', header: 'Alianza',
              render: (a) => (
                <Link to={`/alianzas/${a.id}`} onClick={(e) => e.stopPropagation()}
                  style={{ color: a.profile?.accent_color ?? colors.accent, fontWeight: 700, textDecoration: 'none' }}>
                  {a.name} <span style={{ color: colors.muted, fontWeight: 500 }}>[{a.tag}]</span>
                </Link>
              ),
            },
            {
              key: 'description', header: 'Presentación',
              render: (a) => (
                <span style={{ color: colors.muted }}>
                  {a.profile?.welcome_text || a.description || '—'}
                </span>
              ),
            },
          ]}
        />
      </Reveal>
    </div>
  );
}
