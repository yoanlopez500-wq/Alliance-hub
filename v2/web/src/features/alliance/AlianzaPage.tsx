import { useParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';

type Alliance = {
  id: string; name: string; tag: string; description: string | null;
  profile: {
    banner_url?: string | null; logo_url?: string | null; accent_color?: string;
    welcome_text?: string | null;
    community_links?: { type: string; label: string; url: string }[];
  } | null;
};

const COMMUNITY_COLORS: Record<string, string> = {
  whatsapp: '#25d366', discord: '#5865f2', telegram: '#229ed9', web: '#9fa8da',
};

/**
 * Perfil publico de alianza (v2): hero, comunidad, tablon (suyo + global),
 * reglamento propio, partidas y miembros. Lectura publica via anon key.
 */
export default function AlianzaPage() {
  const { id = '' } = useParams();
  const accent = '#ff8f00';

  const { data, loading, error } = useApi(async () => {
    const [a, ann, rules, members, matches] = await Promise.all([
      publicDb.from('alliances').select('id, name, tag, description, profile').eq('id', id).single(),
      publicDb.from('public_alliance_announcements_view')
        .select('id, alliance_id, title, body, image_url, is_pinned, created_at')
        .or(`alliance_id.eq.${id},alliance_id.is.null`)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(21),
      publicDb.from('rule_sections').select('id, title, content').eq('alliance_id', id).eq('is_active', true).order('order_index'),
      publicDb.from('alliance_memberships')
        .select('player_id, players:player_id(current_username)')
        .eq('alliance_id', id).eq('status', 'approved'),
      publicDb.from('public_matches_view').select('id, name, match_type, status').eq('alliance_id', id).limit(12),
    ]);
    if (a.error) throw new Error(a.error.message);
    return {
      alliance: a.data as Alliance,
      announcements: ann.data ?? [],
      rules: rules.data ?? [],
      members: members.data ?? [],
      matches: matches.data ?? [],
    };
  }, [id]);

  if (loading) return <Loader />;
  if (error || !data) return <p style={{ color: '#ef5350' }}>{error ?? 'Alianza no encontrada'}</p>;

  const { alliance, announcements, rules, members, matches } = data;
  const p = alliance.profile ?? {};
  const banner = p.banner_url;
  const logo = p.logo_url;
  const links = Array.isArray(p.community_links) ? p.community_links : [];

  return (
    <div>
      <div style={{
        borderRadius: 16, overflow: 'hidden', border: '1px solid #1a237e', marginBottom: 20,
        background: banner ? `center/cover url(${banner})` : '#11183a',
        minHeight: 180, display: 'flex', alignItems: 'flex-end',
      }}>
        <div style={{
          width: '100%', padding: 20,
          background: 'linear-gradient(transparent, rgba(4,6,20,0.92))',
          display: 'flex', gap: 16, alignItems: 'center',
        }}>
          {logo && <img src={logo} alt={alliance.name} style={{ width: 64, height: 64, borderRadius: 12, border: `2px solid ${accent}` }} />}
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, color: '#fff' }}>{alliance.name}</h1>
            <p style={{ margin: '2px 0 0', color: '#9fa8da' }}>[{alliance.tag}] · {members.length} miembros</p>
            {p.welcome_text && <p style={{ margin: '6px 0 0', color: '#e8eaf6', fontSize: 14 }}>{p.welcome_text}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {links.filter((l) => l.url?.startsWith('https://')).map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                background: COMMUNITY_COLORS[l.type] ?? '#9fa8da', color: '#fff',
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none',
              }}>{l.label || l.type}</a>
            ))}
          </div>
        </div>
      </div>

      {alliance.description && (
        <p style={{ color: '#9fa8da', marginTop: -8 }}>{alliance.description}</p>
      )}

      <Section title="Tablón de anuncios">
        {announcements.length === 0 && <p style={{ color: '#9fa8da' }}>Sin anuncios vigentes.</p>}
        {announcements.map((an: any) => (
          <div key={an.id} style={{ background: '#11183a', border: '1px solid #1a237e', borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              {an.is_pinned && <Badge label="fijado" tone="internal_standard" />}
              {!an.alliance_id && <Badge label="AllianceHub" tone="global" />}
              <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>{an.title}</h3>
            </div>
            {an.image_url && <img src={an.image_url} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 8 }} />}
            {an.body && <p style={{ color: '#e8eaf6', margin: 0, fontSize: 14, whiteSpace: 'pre-wrap' }}>{an.body}</p>}
          </div>
        ))}
      </Section>

      {rules.length > 0 && (
        <Section title="Reglamento de la alianza">
          {rules.map((r: any) => (
            <details key={r.id} style={{ background: '#11183a', border: '1px solid #1a237e', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
              <summary style={{ color: '#ff8f00', fontWeight: 700, cursor: 'pointer' }}>{r.title}</summary>
              <p style={{ color: '#e8eaf6', fontSize: 14, whiteSpace: 'pre-wrap' }}>{r.content}</p>
            </details>
          ))}
        </Section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Section title={`Partidas (${matches.length})`}>
          {matches.map((m: any) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a237e', fontSize: 14 }}>
              <span style={{ color: '#e8eaf6' }}>{m.name}</span>
              <Badge label={m.match_type} />
            </div>
          ))}
        </Section>
        <Section title={`Miembros (${members.length})`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(members as any[]).map((m) => (
              <span key={m.player_id} style={{
                background: '#11183a', border: '1px solid #1a237e', borderRadius: 20,
                padding: '6px 12px', fontSize: 13, color: '#e8eaf6',
              }}>{m.players?.current_username ?? `#${m.player_id}`}</span>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 13, color: '#9fa8da', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</h2>
      {children}
    </div>
  );
}
