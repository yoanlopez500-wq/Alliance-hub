import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { usePlayerSession } from '../../lib/playerSession';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import { MatchTypeBadge } from '../../lib/matchTypes';
import Section from '../../components/Section';
import { PrestigeBadgeList } from '../../components/PrestigeBadge';
import type { PrestigeDefinition } from '../../lib/prestige';
import { colors, styles } from '../../theme';

type Alliance = {
  id: string; name: string; tag: string; description: string | null;
  profile: {
    banner_url?: string | null; logo_url?: string | null; accent_color?: string;
    welcome_text?: string | null;
    community_links?: { type: string; label: string; url: string }[];
  } | null;
};

type Membership = { id: string; alliance_id: string; status: string };

const COMMUNITY_COLORS: Record<string, string> = {
  whatsapp: '#25d366', discord: '#5865f2', telegram: '#229ed9', web: colors.muted, // colores de marca (whatsapp/discord/telegram)
};

/**
 * Perfil publico de alianza (v2): hero, comunidad, tablon (suyo + global),
 * reglamento propio, partidas y miembros. Lectura publica via anon key.
 * Con sesion de jugador permite solicitar entrada a la alianza.
 */
export default function AlianzaPage() {
  const { id = '' } = useParams();
  const { session } = usePlayerSession();
  const playerId = session?.playerId ?? null;
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

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

  // Prestigios de alianza desbloqueados (evaluados en vivo por formula)
  const { data: prestiges } = useApi<PrestigeDefinition[]>(async () => {
    if (!id) return [];
    const { data, error: pErr } = await publicDb.rpc('alliance_prestiges', { p_alliance_id: id });
    if (pErr) return [];
    return (data ?? []) as PrestigeDefinition[];
  }, [id]);

  // Membresia del jugador para saber que boton mostrar (solo con sesion de jugador)
  const { data: membership, reload: reloadMembership } = useApi<Membership | null>(async () => {
    if (!playerId) return null;
    const { data: m, error: mErr } = await publicDb.from('alliance_memberships')
      .select('id, alliance_id, status')
      .eq('player_id', playerId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    return (m as Membership) || null;
  }, [playerId], { skip: !playerId });

  async function requestJoin() {
    if (!playerId) return;
    setJoining(true);
    setJoinMsg(null);
    try {
      const { error: e } = await publicDb.from('alliance_memberships').insert({
        player_id: playerId,
        alliance_id: id,
        status: 'pending',
      });
      if (e) { setJoinMsg({ tone: 'err', text: e.message }); return; }
      setJoinMsg({ tone: 'ok', text: '¡Solicitud enviada! El líder la revisará pronto.' });
      reloadMembership();
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <Loader />;
  if (error || !data) return <p style={{ color: colors.danger }}>{error ?? 'Alianza no encontrada'}</p>;

  const { alliance, announcements, rules, members, matches } = data;
  const p = alliance.profile ?? {};
  const banner = p.banner_url;
  const logo = p.logo_url;
  const accent = /^#[0-9a-f]{6}$/i.test(p.accent_color ?? '') ? p.accent_color! : colors.accent;
  const links = (Array.isArray(p.community_links) ? p.community_links : []).filter((l) => l.url?.startsWith('https://'));

  // Widget de union (solo sesiones de jugador)
  const mine = membership?.alliance_id === alliance.id ? membership : null;
  const joinWidget = !playerId ? null : mine?.status === 'approved' ? (
    <span style={{
      background: 'rgba(129,199,132,0.15)', border: '1px solid #81c784', color: '#81c784',
      padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700,
    }}>✓ Eres miembro de esta alianza</span>
  ) : mine?.status === 'pending' ? (
    <span style={{
      background: 'rgba(255,213,79,0.12)', border: '1px solid #ffd54f', color: '#ffd54f',
      padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600,
    }}>⏳ Solicitud pendiente de aprobación</span>
  ) : membership && membership.status === 'pending' ? (
    <span style={{ color: colors.muted, fontSize: 13 }}>
      Ya tienes una solicitud pendiente en otra alianza. Cancela la anterior para pedir entrar aquí.
    </span>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      <button
        onClick={requestJoin}
        disabled={joining}
        style={{
          ...styles.btnPrimary, border: 'none', cursor: 'pointer',
          opacity: joining ? 0.6 : 1, fontSize: 15, padding: '12px 22px', fontWeight: 700,
        }}
      >
        {joining ? 'Enviando…' : '🚩 Solicitar entrada'}
      </button>
      {joinMsg && (
        <span style={{ color: joinMsg.tone === 'ok' ? colors.success : colors.danger, fontSize: 13 }}>
          {joinMsg.text}
        </span>
      )}
    </div>
  );

  return (
    <div>
      <div style={{
        borderRadius: 16, overflow: 'hidden', border: `1px solid ${colors.border}`, marginBottom: 20,
        background: banner ? `center/cover url(${banner})` : colors.cardAlt,
        minHeight: 180, display: 'flex', alignItems: 'flex-end',
      }}>
        <div style={{
          width: '100%', padding: 20,
          background: 'linear-gradient(transparent, rgba(4,6,20,0.92))',
          display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {logo && <img src={logo} alt={alliance.name} style={{ width: 64, height: 64, borderRadius: 12, border: `2px solid ${accent}` }} />}
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: 0, color: '#fff' }}>{alliance.name}</h1>
            <p style={{ margin: '2px 0 0', color: colors.muted }}>[{alliance.tag}] · {members.length} miembros</p>
            {prestiges && prestiges.length > 0 && (
              <div style={{ marginTop: 8 }}><PrestigeBadgeList prestiges={prestiges} /></div>
            )}
            {p.welcome_text && <p style={{ margin: '6px 0 0', color: colors.text, fontSize: 14 }}>{p.welcome_text}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                background: COMMUNITY_COLORS[l.type] ?? colors.muted, color: '#fff',
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none',
              }}>{l.label || l.type}</a>
            ))}
          </div>
          {joinWidget}
        </div>
      </div>

      {alliance.description && (
        <p style={{ color: colors.muted, marginTop: -8 }}>{alliance.description}</p>
      )}

      <Section title="Tablón de anuncios">
        {announcements.length === 0 && <p style={{ color: colors.muted }}>Sin anuncios vigentes.</p>}
        {announcements.map((an: any) => (
          <div key={an.id} style={{ ...stylesCard, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              {an.is_pinned && <Badge label="fijado" tone="internal_standard" />}
              {!an.alliance_id && <Badge label="AllianceHub" tone="global" />}
              <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>{an.title}</h3>
            </div>
            {an.image_url && <img src={an.image_url} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 8 }} />}
            {an.body && <p style={{ color: colors.text, margin: 0, fontSize: 14, whiteSpace: 'pre-wrap' }}>{an.body}</p>}
          </div>
        ))}
      </Section>

      {rules.length > 0 && (
        <Section title="Reglamento de la alianza">
          {rules.map((r: any) => (
            <details key={r.id} style={{ ...stylesCard, marginBottom: 8 }}>
              <summary style={{ color: accent, fontWeight: 700, cursor: 'pointer' }}>{r.title}</summary>
              <p style={{ color: colors.text, fontSize: 14, whiteSpace: 'pre-wrap' }}>{r.content}</p>
            </details>
          ))}
        </Section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <Section title={`Partidas (${matches.length})`}>
          {matches.map((m: any) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 14 }}>
              <span style={{ color: colors.text }}>{m.name}</span>
              <MatchTypeBadge typeId={m.match_type} />
            </div>
          ))}
        </Section>
        <Section title={`Miembros (${members.length})`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(members as any[]).map((m) => (
              <span key={m.player_id} style={{
                background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 20,
                padding: '6px 12px', fontSize: 13, color: colors.text,
              }}>{m.players?.current_username ?? `#${m.player_id}`}</span>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

const stylesCard: React.CSSProperties = {
  background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14,
};
