import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import Loader from '../../components/Loader';
import { colors, styles } from '../../theme';
import { formatDate, badgeStyle } from '../../lib/format';

type Profile = {
  id: string; player_id: number; channel_name: string; channel_url: string;
  description: string | null; avatar_url: string | null; status: string;
  admin_notes: string | null; created_at: string;
};
type Video = { id: string; profile_id: string; video_id: string; title: string | null; position: number };

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Panel de moderacion del directorio de creadores (/admin/creadores). */
function Creators() {
  const [pending, setPending] = useState<Profile[] | null>(null);
  const [approved, setApproved] = useState<Profile[]>([]);
  const [videos, setVideos] = useState<Map<string, Video[]>>(new Map());
  const [usernames, setUsernames] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setPending(null);
    const [{ data: p }, { data: a }] = await Promise.all([
      publicDb.from('creator_profiles').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      publicDb.from('creator_profiles').select('*').eq('status', 'approved').order('created_at', { ascending: false }),
    ]);
    const pend = (p as Profile[]) ?? [];
    const appr = (a as Profile[]) ?? [];
    setPending(pend);
    setApproved(appr);

    const all = [...pend, ...appr];
    const ids = [...new Set(all.map((x) => x.player_id))];
    if (ids.length) {
      const { data: players } = await publicDb.from('players').select('id, current_username').in('id', ids);
      setUsernames(new Map(((players as { id: number; current_username: string }[] | null) ?? []).map((pl) => [pl.id, pl.current_username])));
    }
    if (all.length) {
      const { data: vids } = await publicDb.from('creator_videos').select('*').in('profile_id', all.map((x) => x.id)).order('position');
      const map = new Map<string, Video[]>();
      ((vids as Video[]) ?? []).forEach((v) => {
        const arr = map.get(v.profile_id) ?? [];
        arr.push(v);
        map.set(v.profile_id, arr);
      });
      setVideos(map);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(p: Profile) {
    setBusy(p.id); setError(''); setNotice('');
    try {
      const avatar = (avatars.get(p.id) ?? '').trim() || null;
      const { error: e } = await publicDb.rpc('approve_creator_request', { p_request_id: p.id, p_avatar_url: avatar });
      if (e) throw e;
      setNotice(`✓ "${p.channel_name}" aprobado. Aparece ya en /creadores.`);
      await load();
    } catch (e: any) {
      setError('✖ ' + (e.message || 'Error al aprobar'));
    } finally {
      setBusy(null);
    }
  }

  async function reject(p: Profile) {
    setBusy(p.id); setError('');
    try {
      const { error: e } = await publicDb.rpc('reject_creator_request', { p_request_id: p.id, p_reason: reason.trim() || null });
      if (e) throw e;
      setRejecting(null); setReason('');
      await load();
    } catch (e: any) {
      setError('✖ ' + (e.message || 'Error al rechazar'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: Profile) {
    if (!window.confirm(`¿Retirar del directorio a "${p.channel_name}"? Se borra el perfil y sus vídeos.`)) return;
    setBusy(p.id);
    const { error: e } = await publicDb.from('creator_profiles').delete().eq('id', p.id);
    if (e) setError(e.message); else await load();
    setBusy(null);
  }

  function ProfileCard({ p, actions }: { p: Profile; actions: React.ReactNode }) {
    return (
      <div style={{ ...styles.card, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ margin: '0 0 4px', color: colors.text }}>
              {p.channel_name}{' '}
              <a href={p.channel_url} target="_blank" rel="noreferrer" style={{ color: colors.accent, fontSize: 13 }}>↗ canal</a>
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: colors.muted }}>
              Solicitado por {usernames.get(p.player_id) ?? `Jugador ${p.player_id}`} · {formatDate(p.created_at)}
              {p.admin_notes ? ` · Motivo: ${p.admin_notes}` : ''}
            </p>
            {p.description && <p style={{ margin: '0 0 10px', color: colors.muted, fontSize: 13 }}>{p.description}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(videos.get(p.id) ?? []).map((v) => (
                <a key={v.id} href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noreferrer" title={v.title ?? 'Vídeo'}>
                  <img src={thumb(v.video_id)} alt="" loading="lazy" style={{ width: 96, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                </a>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px', color: colors.text }}>▶️ Creadores</h1>
      <p style={{ color: colors.muted, margin: '0 0 20px' }}>
        Moderación del directorio público de creadores.
      </p>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {notice && <p style={{ color: colors.success }}>{notice}</p>}

      <h2 style={{ fontSize: 16, color: colors.text }}>⏳ Solicitudes pendientes</h2>
      {!pending ? <Loader /> : pending.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13 }}>🎉 No hay solicitudes pendientes.</p>
      ) : pending.map((p) => (
        <ProfileCard key={p.id} p={p} actions={
          <>
            <input placeholder="Logo URL (opcional)" value={avatars.get(p.id) ?? ''}
              onChange={(e) => setAvatars(new Map(avatars).set(p.id, e.target.value))}
              style={{ ...styles.input, width: 170, marginBottom: 0 }} />
            <Button onClick={() => approve(p)} disabled={busy === p.id}>{busy === p.id ? '…' : '✓ Aprobar'}</Button>
            {rejecting === p.id ? (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)}
                  style={{ ...styles.input, width: 150, marginBottom: 0 }} />
                <Button variant="danger" onClick={() => reject(p)} disabled={busy === p.id}>Rechazar</Button>
                <Button variant="ghost" onClick={() => setRejecting(null)}>X</Button>
              </span>
            ) : (
              <Button variant="ghost" onClick={() => { setRejecting(p.id); setReason(''); }}>✖ Rechazar</Button>
            )}
          </>
        } />
      ))}

      <h2 style={{ fontSize: 16, color: colors.text, marginTop: 28 }}>✓ En el directorio ({approved.length})</h2>
      {approved.map((p) => (
        <ProfileCard key={p.id} p={p} actions={
          <>
            <span style={badgeStyle('rgba(76,175,80,0.15)', colors.success)}>APROBADO</span>
            <Button variant="danger" onClick={() => remove(p)} disabled={busy === p.id}>Retirar</Button>
          </>
        } />
      ))}
    </div>
  );
}

export default function AdminCreatorsPage() {
  return (
    <AdminGate staffOnly>
      <Creators />
    </AdminGate>
  );
}
