import { useRef, useState } from 'react';
import { serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import Loader from '../../components/Loader';
import Button from '../../components/Button';
import { Input, TextArea, Select } from '../../components/Field';
import { compressImage, IMAGE_KINDS } from '../../lib/image';
import { styles, colors } from '../../theme';

type SpaceData = {
  alliance: { id: string; name: string; description: string | null; profile: any };
  announcements: { id: string; title: string; body: string | null; image_url: string | null; is_pinned: boolean; expires_at: string }[];
  rules: { id: string; title: string; content: string; is_active: boolean }[];
};

const LINK_TYPES = ['whatsapp', 'discord', 'telegram', 'web'];

/**
 * Mi Espacio (v2): panel del lider/oficial. Apariencia + Tablon + Reglamento.
 * Imagenes comprimidas en el navegador antes de subir (mismo criterio que v1).
 */
export default function MiEspacioPage({ allianceId }: { allianceId: string }) {
  const { data, loading, error, reload } = useApi<SpaceData>(
    () => serverApi.get(`/alliances/${allianceId}/space`),
    [allianceId]
  );
  const [tab, setTab] = useState<'apariencia' | 'tablon' | 'reglamento'>('apariencia');
  const [msg, setMsg] = useState<string | null>(null);
  const [profile, setProfile] = useState({ description: '', welcome_text: '', accent_color: colors.accent, links: [] as any[] });
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [ann, setAnn] = useState({ title: '', body: '', days: 30, pinned: false, image: null as File | null });
  const [rule, setRule] = useState({ title: '', content: '' });
  const [busy, setBusy] = useState(false);

  // Precargar formulario cuando llega el espacio (una sola vez por carga)
  if (data && profile.description === '' && profile.links.length === 0 && !profile.welcome_text && data.alliance.description) {
    const p = data.alliance.profile ?? {};
    setProfile({
      description: data.alliance.description ?? '',
      welcome_text: p.welcome_text ?? '',
      accent_color: p.accent_color ?? colors.accent,
      links: Array.isArray(p.community_links) ? p.community_links : [],
    });
  }

  async function upload(file: File, kind: keyof typeof IMAGE_KINDS): Promise<string> {
    const b64 = await compressImage(file, IMAGE_KINDS[kind]);
    const r = await serverApi.post(`/alliances/${allianceId}/images`, { dataBase64: b64, kind });
    return r.url as string;
  }

  async function saveProfile() {
    setBusy(true); setMsg(null);
    try {
      const logo = logoRef.current?.files?.[0];
      const banner = bannerRef.current?.files?.[0];
      const body: any = { ...profile, community_links: profile.links.slice(0, 4) };
      if (logo) body.logo_url = await upload(logo, 'logo');
      if (banner) body.banner_url = await upload(banner, 'banner');
      await serverApi.put(`/alliances/${allianceId}/profile`, body);
      setMsg('Perfil guardado.');
      reload();
    } catch (e: any) { setMsg(`Error: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function publishAnnouncement() {
    setBusy(true); setMsg(null);
    try {
      let image_url = null;
      if (ann.image) image_url = await upload(ann.image, 'announcement');
      await serverApi.post(`/alliances/${allianceId}/announcements`, {
        title: ann.title, body: ann.body || null, image_url,
        is_pinned: ann.pinned, days: ann.days,
      });
      setAnn({ title: '', body: '', days: 30, pinned: false, image: null });
      setMsg('Anuncio publicado.');
      reload();
    } catch (e: any) { setMsg(`Error: ${e.message}`); }
    finally { setBusy(false); }
  }

  if (loading) return <Loader />;
  if (error || !data) return <p style={{ color: colors.danger }}>{error ?? 'Error cargando el espacio'}</p>;

  const labelStyle: React.CSSProperties = { color: colors.muted, fontSize: 13 };

  return (
    <div>
      <h1 style={{ color: colors.text }}>Mi Espacio — {data.alliance.name}</h1>
      <a href={`/alianzas/${allianceId}`} style={{ color: colors.info, fontSize: 14 }}>Ver página pública ↗</a>
      {msg && <p style={{ color: colors.info }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {(['apariencia', 'tablon', 'reglamento'] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'primary' : 'ghost'}
            onClick={() => setTab(t)}
            style={{ textTransform: 'capitalize' }}
          >{t}</Button>
        ))}
      </div>

      {tab === 'apariencia' && (
        <div style={styles.card}>
          <label style={labelStyle}>Descripción</label>
          <TextArea rows={2} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
          <label style={labelStyle}>Texto de bienvenida</label>
          <TextArea rows={2} value={profile.welcome_text} onChange={(e) => setProfile({ ...profile, welcome_text: e.target.value })} />
          <label style={labelStyle}>Color de acento</label>
          <Input type="color" value={profile.accent_color} onChange={(e) => setProfile({ ...profile, accent_color: e.target.value })} style={{ height: 42, padding: 4 }} />
          <label style={labelStyle}>Logo (se comprime a 512px WebP)</label>
          <input ref={logoRef} type="file" accept="image/*" style={{ color: colors.muted, marginBottom: 10 }} />
          <label style={labelStyle}>Banner (1600px WebP)</label>
          <input ref={bannerRef} type="file" accept="image/*" style={{ color: colors.muted, marginBottom: 10 }} />

          <label style={labelStyle}>Enlaces de comunidad (máx. 4, https)</label>
          {profile.links.map((l: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <Select value={l.type} onChange={(e) => { const links = [...profile.links]; links[i] = { ...l, type: e.target.value }; setProfile({ ...profile, links }); }} style={{ width: 120, marginBottom: 0 }}>
                {LINK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Input placeholder="https://…" value={l.url} onChange={(e) => { const links = [...profile.links]; links[i] = { ...l, url: e.target.value }; setProfile({ ...profile, links }); }} style={{ flex: 1, marginBottom: 0 }} />
              <Button variant="danger" onClick={() => setProfile({ ...profile, links: profile.links.filter((_: any, j: number) => j !== i) })}>✕</Button>
            </div>
          ))}
          {profile.links.length < 4 && (
            <Button variant="ghost" onClick={() => setProfile({ ...profile, links: [...profile.links, { type: 'discord', label: '', url: '' }] })} style={{ width: '100%' }}>
              + Añadir enlace
            </Button>
          )}

          <Button onClick={saveProfile} disabled={busy} style={{ width: '100%', marginTop: 10 }}>
            Guardar perfil
          </Button>
        </div>
      )}

      {tab === 'tablon' && (
        <div>
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <Input placeholder="Título del anuncio" value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} />
            <TextArea placeholder="Cuerpo (opcional)" rows={3} value={ann.body} onChange={(e) => setAnn({ ...ann, body: e.target.value })} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <input type="file" accept="image/*" onChange={(e) => setAnn({ ...ann, image: e.target.files?.[0] ?? null })} style={{ color: colors.muted }} />
              <Select value={ann.days} onChange={(e) => setAnn({ ...ann, days: Number(e.target.value) })} style={{ width: 150, marginBottom: 0 }}>
                {[1, 3, 7, 30].map((d) => <option key={d} value={d}>{d} días visible</option>)}
              </Select>
              <label style={{ color: colors.muted, fontSize: 13 }}>
                <input type="checkbox" checked={ann.pinned} onChange={(e) => setAnn({ ...ann, pinned: e.target.checked })} /> Fijado
              </label>
              <Button onClick={publishAnnouncement} disabled={busy || !ann.title}>Publicar</Button>
            </div>
          </div>
          {data.announcements.map((a) => (
            <div key={a.id} style={{ ...styles.card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: colors.text }}>{a.title}</strong>
                <span style={{ color: colors.muted, fontSize: 12, marginLeft: 8 }}>
                  expira {new Date(a.expires_at).toLocaleDateString('es')}
                  {new Date(a.expires_at) < new Date() ? ' · EXPIRADO' : ''}
                  {a.is_pinned ? ' · fijado' : ''}
                </span>
              </div>
              <Button variant="danger" onClick={async () => { await serverApi.delete(`/alliances/${allianceId}/announcements/${a.id}`); reload(); }}>Borrar</Button>
            </div>
          ))}
        </div>
      )}

      {tab === 'reglamento' && (
        <div>
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <Input placeholder="Título de la sección" value={rule.title} onChange={(e) => setRule({ ...rule, title: e.target.value })} />
            <TextArea placeholder="Contenido" rows={4} value={rule.content} onChange={(e) => setRule({ ...rule, content: e.target.value })} />
            <Button onClick={async () => {
              await serverApi.post(`/alliances/${allianceId}/rules`, rule);
              setRule({ title: '', content: '' });
              reload();
            }} disabled={!rule.title || !rule.content} style={{ width: '100%' }}>
              Añadir sección
            </Button>
          </div>
          {data.rules.map((r) => (
            <div key={r.id} style={{ ...styles.card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: colors.accent }}>{r.title}</strong>
              <Button variant="danger" onClick={async () => { await serverApi.delete(`/alliances/${allianceId}/rules/${r.id}`); reload(); }}>Borrar</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
