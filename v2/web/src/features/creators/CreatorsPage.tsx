import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb, getSessionToken } from '../../lib/api';
import { usePlayerSession } from '../../lib/playerSession';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';

type Profile = {
  id: string; channel_name: string; channel_url: string; description: string | null;
  avatar_url: string | null; player_id: number; created_at: string;
};
type Video = { id: string; profile_id: string; video_id: string; title: string | null; position: number };
type MyRequest = { id: string; channel_name: string; status: string; created_at: string };

const thumb = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
const watch = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

const AVATAR_COLORS = ['#9fa8da', '#81c784', '#ffb74d', '#4fc3f7', '#ce93d8', '#ef9a9a'];

function CreatorAvatar({ p, size = 56 }: { p: Profile; size?: number }) {
  if (p.avatar_url) {
    return <img src={p.avatar_url} alt={p.channel_name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  }
  const color = AVATAR_COLORS[Math.abs([...p.channel_name].reduce((a, c) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 800, color: '#0d1330',
    }}>
      {p.channel_name.trim()[0]?.toUpperCase() ?? '▶'}
    </div>
  );
}

/** Directorio publico de creadores de contenido (solo perfiles aprobados). */
export default function CreatorsPage() {
  const { session, loading: sessionLoading } = usePlayerSession();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrls, setVideoUrls] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: profs } = await publicDb.from('creator_profiles')
        .select('id, channel_name, channel_url, description, avatar_url, player_id, created_at')
        .order('created_at', { ascending: false });
      const list = (profs as Profile[]) ?? [];
      setProfiles(list);
      if (list.length) {
        const { data: vids } = await publicDb.from('creator_videos')
          .select('id, profile_id, video_id, title, position')
          .in('profile_id', list.map((p) => p.id))
          .order('position', { ascending: true });
        setVideos((vids as Video[]) ?? []);
      }
    })().catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      try {
        const { data } = await publicDb.rpc('player_my_creator_requests', { p_token: getSessionToken() || '' });
        setMyRequests((data as MyRequest[]) ?? []);
      } catch { /* noop */ }
    })();
  }, [session, notice]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setNotice('');
    if (channelName.trim().length < 2) { setError('✖ Pon el nombre de tu canal.'); return; }
    if (!channelUrl.includes('youtube.com')) { setError('✖ Por ahora solo canales de YouTube.'); return; }
    setSubmitting(true);
    try {
      const urls = videoUrls.split('\n').map((s) => s.trim()).filter(Boolean);
      const { error: rpcErr } = await publicDb.rpc('player_create_creator_request', {
        p_token: getSessionToken() || '',
        p_channel_name: channelName.trim(),
        p_channel_url: channelUrl.trim(),
        p_description: description.trim() || null,
        p_video_urls: urls,
      });
      if (rpcErr) throw rpcErr;
      setNotice('✓ Solicitud enviada. El staff la revisará y te avisará por Discord cuando estés en el directorio.');
      setShowForm(false);
      setChannelName(''); setChannelUrl(''); setDescription(''); setVideoUrls('');
    } catch (err: any) {
      setError('✖ ' + (err.message || 'No se pudo enviar'));
    } finally {
      setSubmitting(false);
    }
  }

  const videosByProfile = new Map<string, Video[]>();
  videos.forEach((v) => {
    const arr = videosByProfile.get(v.profile_id) ?? [];
    arr.push(v);
    videosByProfile.set(v.profile_id, arr);
  });
  const recent = [...videos].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')).slice(0, 8);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <Reveal>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, margin: '0 0 4px', color: colors.text }}>▶️ Creadores</h1>
            <p style={{ color: colors.muted, margin: 0 }}>
              Canales de YouTube de la comunidad: guías, estrategia y partidas de Supremacy 1914.
            </p>
          </div>
          {session && !showForm && (
            <Button onClick={() => setShowForm(true)}>+ Soy creador</Button>
          )}
        </div>
      </Reveal>

      {!sessionLoading && !session && (
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>
          ¿Tienes canal? <Link to="/login" style={{ color: colors.accent }}>Inicia sesión como jugador</Link> y regístrate como creador.
        </p>
      )}

      {/* Formulario de solicitud */}
      {session && showForm && (
        <div style={{ ...styles.card, marginTop: 20, padding: 24 }}>
          <h2 style={{ fontSize: 18, color: colors.text, margin: '0 0 8px' }}>Registra tu canal</h2>
          <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 16px' }}>
            Tu perfil queda pendiente de aprobación por el staff. Máximo 6 vídeos destacados (uno por línea).
          </p>
          <form onSubmit={submit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: colors.muted }}>
                Nombre del canal *
                <input value={channelName} onChange={(e) => setChannelName(e.target.value)} required
                  style={{ ...styles.input, width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, color: colors.muted }}>
                URL del canal (YouTube) *
                <input value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} required
                  placeholder="https://www.youtube.com/@tucanal" style={{ ...styles.input, width: '100%', marginTop: 4 }} />
              </label>
            </div>
            <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 12 }}>
              Descripción
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} rows={2}
                placeholder="¿Qué haces? Guías, gameplay, torneos…" style={{ ...styles.input, width: '100%', marginTop: 4, resize: 'vertical' }} />
            </label>
            <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 12 }}>
              Vídeos destacados (URL de YouTube, uno por línea)
              <textarea value={videoUrls} onChange={(e) => setVideoUrls(e.target.value)} rows={4}
                placeholder={'https://www.youtube.com/watch?v=...\nhttps://youtu.be/...'} style={{ ...styles.input, width: '100%', marginTop: 4, resize: 'vertical' }} />
            </label>
            {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar solicitud'}</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        </div>
      )}

      {notice && <p style={{ color: colors.success, marginTop: 16 }}>{notice}</p>}
      {myRequests.length > 0 && !showForm && (
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>
          {myRequests[0].status === 'pending'
            ? `⏳ Tu solicitud "${myRequests[0].channel_name}" está pendiente de validación.`
            : myRequests[0].status === 'approved'
              ? `✓ Tu canal "${myRequests[0].channel_name}" está aprobado.`
              : `Tu solicitud "${myRequests[0].channel_name}" fue rechazada.`}
        </p>
      )}

      {profiles === null ? <Loader /> : profiles.length === 0 ? (
        <p style={{ color: colors.muted, textAlign: 'center', padding: '40px 0' }}>
          Aún no hay creadores registrados. ¡Sé el primero!
        </p>
      ) : (
        <>
          {/* Vídeos recientes: para que la página nunca se vea vacía */}
          {recent.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 20, color: colors.text }}>🆕 Vídeos de la comunidad</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                {recent.map((v) => (
                  <a key={v.id} href={watch(v.video_id)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <div className="ah-glow-hover" style={{ borderRadius: 10, overflow: 'hidden', background: colors.cardAlt, border: `1px solid ${colors.border}` }}>
                      <img src={thumb(v.video_id)} alt={v.title ?? 'Vídeo'} loading="lazy"
                        style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
                      <p style={{ fontSize: 12, color: colors.muted, margin: 0, padding: '8px 10px' }}>
                        {v.title ? (v.title.length > 60 ? v.title.slice(0, 60) + '…' : v.title) : 'Ver vídeo'}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {profiles.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 8) * 40}>
                <div style={{ ...styles.card, padding: 20, height: '100%' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
                    <CreatorAvatar p={p} />
                    <div>
                      <a href={p.channel_url} target="_blank" rel="noreferrer"
                        style={{ color: colors.text, fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
                        {p.channel_name} ↗
                      </a>
                      <p style={{ color: colors.muted, fontSize: 12, margin: '2px 0 0' }}>Canal de YouTube</p>
                    </div>
                  </div>
                  {p.description && <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px' }}>{p.description}</p>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(videosByProfile.get(p.id) ?? []).slice(0, 4).map((v) => (
                      <a key={v.id} href={watch(v.video_id)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        <img src={thumb(v.video_id)} alt={v.title ?? 'Vídeo'} loading="lazy" title={v.title ?? 'Ver vídeo'}
                          style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                      </a>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
