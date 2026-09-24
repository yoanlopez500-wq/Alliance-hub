import { useRef, useState } from 'react';
import { serverApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import Loader from '../../components/Loader';
import { compressImage, IMAGE_KINDS } from '../../lib/image';

type SpaceData = {
  alliance: { id: string; name: string; description: string | null; profile: any };
  announcements: { id: string; title: string; body: string | null; image_url: string | null; is_pinned: boolean; expires_at: string }[];
  rules: { id: string; title: string; content: string; is_active: boolean }[];
};

const LINK_TYPES = ['whatsapp', 'discord', 'telegram', 'web'];
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #1a237e',
  background: '#0d1330', color: '#e8eaf6', marginBottom: 10, boxSizing: 'border-box',
};

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
  const [profile, setProfile] = useState({ description: '', welcome_text: '', accent_color: '#ff8f00', links: [] as any[] });
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
      accent_color: p.accent_color ?? '#ff8f00',
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
  if (error || !data) return <p style={{ color: '#ef5350' }}>{error ?? 'Error cargando el espacio'}</p>;

  return (
    <div>
      <h1 style={{ color: '#fff' }}>Mi Espacio — {data.alliance.name}</h1>
      <a href={`/alianzas/${allianceId}`} style={{ color: '#4fc3f7', fontSize: 14 }}>Ver página pública ↗</a>
      {msg && <p style={{ color: '#4fc3f7' }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {(['apariencia', 'tablon', 'reglamento'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, textTransform: 'capitalize',
            background: tab === t ? 'linear-gradient(90deg,#ff6f00,#ff8f00)' : '#1a237e',
            color: tab === t ? '#fff' : '#9fa8da',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'apariencia' && (
        <div style={{ background: '#11183a', border: '1px solid #1a237e', borderRadius: 12, padding: 16 }}>
          <label style={{ color: '#9fa8da', fontSize: 13 }}>Descripción</label>
          <textarea rows={2} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} style={inputStyle} />
          <label style={{ color: '#9fa8da', fontSize: 13 }}>Texto de bienvenida</label>
          <textarea rows={2} value={profile.welcome_text} onChange={(e) => setProfile({ ...profile, welcome_text: e.target.value })} style={inputStyle} />
          <label style={{ color: '#9fa8da', fontSize: 13 }}>Color de acento</label>
          <input type="color" value={profile.accent_color} onChange={(e) => setProfile({ ...profile, accent_color: e.target.value })} style={{ ...inputStyle, height: 42, padding: 4 }} />
          <label style={{ color: '#9fa8da', fontSize: 13 }}>Logo (se comprime a 512px WebP)</label>
          <input ref={logoRef} type="file" accept="image/*" style={{ color: '#9fa8da', marginBottom: 10 }} />
          <label style={{ color: '#9fa8da', fontSize: 13 }}>Banner (1600px WebP)</label>
          <input ref={bannerRef} type="file" accept="image/*" style={{ color: '#9fa8da', marginBottom: 10 }} />

          <label style={{ color: '#9fa8da', fontSize: 13 }}>Enlaces de comunidad (máx. 4, https)</label>
          {profile.links.map((l: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={l.type} onChange={(e) => { const links = [...profile.links]; links[i] = { ...l, type: e.target.value }; setProfile({ ...profile, links }); }} style={{ ...inputStyle, width: 120, marginBottom: 0 }}>
                {LINK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input placeholder="https://…" value={l.url} onChange={(e) => { const links = [...profile.links]; links[i] = { ...l, url: e.target.value }; setProfile({ ...profile, links }); }} style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
              <button onClick={() => setProfile({ ...profile, links: profile.links.filter((_: any, j: number) => j !== i) })} style={{ background: '#1a237e', color: '#ef5350', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          {profile.links.length < 4 && (
            <button onClick={() => setProfile({ ...profile, links: [...profile.links, { type: 'discord', label: '', url: '' }] })} style={{ ...inputStyle, background: '#1a237e', color: '#9fa8da', cursor: 'pointer' }}>
              + Añadir enlace
            </button>
          )}

          <button onClick={saveProfile} disabled={busy} style={{ ...inputStyle, background: 'linear-gradient(90deg,#ff6f00,#ff8f00)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            Guardar perfil
          </button>
        </div>
      )}

      {tab === 'tablon' && (
        <div>
          <div style={{ background: '#11183a', border: '1px solid #1a237e', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <input placeholder="Título del anuncio" value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} style={inputStyle} />
            <textarea placeholder="Cuerpo (opcional)" rows={3} value={ann.body} onChange={(e) => setAnn({ ...ann, body: e.target.value })} style={inputStyle} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <input type="file" accept="image/*" onChange={(e) => setAnn({ ...ann, image: e.target.files?.[0] ?? null })} style={{ color: '#9fa8da' }} />
              <select value={ann.days} onChange={(e) => setAnn({ ...ann, days: Number(e.target.value) })} style={{ ...inputStyle, width: 150, marginBottom: 0 }}>
                {[1, 3, 7, 30].map((d) => <option key={d} value={d}>{d} días visible</option>)}
              </select>
              <label style={{ color: '#9fa8da', fontSize: 13 }}>
                <input type="checkbox" checked={ann.pinned} onChange={(e) => setAnn({ ...ann, pinned: e.target.checked })} /> Fijado
              </label>
              <button onClick={publishAnnouncement} disabled={busy || !ann.title} style={{ ...inputStyle, width: 'auto', marginBottom: 0, background: 'linear-gradient(90deg,#ff6f00,#ff8f00)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                Publicar
              </button>
            </div>
          </div>
          {data.announcements.map((a) => (
            <div key={a.id} style={{ background: '#11183a', border: '1px solid #1a237e', borderRadius: 12, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: '#fff' }}>{a.title}</strong>
                <span style={{ color: '#9fa8da', fontSize: 12, marginLeft: 8 }}>
                  expira {new Date(a.expires_at).toLocaleDateString('es')}
                  {new Date(a.expires_at) < new Date() ? ' · EXPIRADO' : ''}
                  {a.is_pinned ? ' · fijado' : ''}
                </span>
              </div>
              <button onClick={async () => { await serverApi.delete(`/alliances/${allianceId}/announcements/${a.id}`); reload(); }} style={{ background: 'none', border: 'none', color: '#ef5350', cursor: 'pointer' }}>Borrar</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'reglamento' && (
        <div>
          <div style={{ background: '#11183a', border: '1px solid #1a237e', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <input placeholder="Título de la sección" value={rule.title} onChange={(e) => setRule({ ...rule, title: e.target.value })} style={inputStyle} />
            <textarea placeholder="Contenido" rows={4} value={rule.content} onChange={(e) => setRule({ ...rule, content: e.target.value })} style={inputStyle} />
            <button onClick={async () => {
              await serverApi.post(`/alliances/${allianceId}/rules`, rule);
              setRule({ title: '', content: '' });
              reload();
            }} disabled={!rule.title || !rule.content} style={{ ...inputStyle, background: 'linear-gradient(90deg,#ff6f00,#ff8f00)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Añadir sección
            </button>
          </div>
          {data.rules.map((r) => (
            <div key={r.id} style={{ background: '#11183a', border: '1px solid #1a237e', borderRadius: 12, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: '#ff8f00' }}>{r.title}</strong>
              <button onClick={async () => { await serverApi.delete(`/alliances/${allianceId}/rules/${r.id}`); reload(); }} style={{ background: 'none', border: 'none', color: '#ef5350', cursor: 'pointer' }}>Borrar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
