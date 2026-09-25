import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { compressImage } from '../../lib/image';
import { usePlayerSession, getStoredPlayerName } from '../../lib/playerSession';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import { Input, Select, TextArea } from '../../components/Field';
import Section from '../../components/Section';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';

const MAX_FILES = 3;
const BUCKET = 'evidence';

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

interface RuleOpt { id: number; title: string }

/** ReportPage — puerto de report.js: reporte de jugador con evidencia. */
export default function ReportPage() {
  const { session, loading } = usePlayerSession();
  const [params] = useSearchParams();
  const matchId = params.get('match_id');

  const [rules, setRules] = useState<RuleOpt[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const playerId = session?.playerId ?? null;
  const displayName = getStoredPlayerName() ?? (playerId ? `Jugador ${playerId}` : '');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await publicDb.from('rule_sections').select('id, title').eq('is_active', true).order('order_index');
        setRules((data as RuleOpt[]) ?? []);
      } catch (e) { console.error('[Report] reglas:', e); }
    })();
  }, []);

  useEffect(() => {
    setPreviews(files.map((f) => URL.createObjectURL(f)));
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) return;
    const arr = Array.from(incoming);
    if (files.length + arr.length > MAX_FILES) { setError(`Maximo ${MAX_FILES} archivos`); return; }
    setError(null);
    setFiles((prev) => [...prev, ...arr].slice(0, MAX_FILES));
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadEvidence(): Promise<string[]> {
    const targetId = `report_${Date.now()}`;
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isImage = f.type.startsWith('image/');
      const payload = isImage ? b64ToBlob(await compressImage(f, 1200, 0.7), 'image/webp') : f;
      const filePath = `reports/${targetId}/${i}_${isImage ? 'evidence.webp' : f.name}`;
      const { error: upErr } = await publicDb.storage.from(BUCKET).upload(filePath, payload, { upsert: true });
      if (upErr) throw new Error('Error subiendo evidencia: ' + upErr.message);
      const { data: pub } = publicDb.storage.from(BUCKET).getPublicUrl(filePath);
      urls.push(pub.publicUrl);
    }
    return urls;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!playerId) return;
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      const fd = new FormData(e.currentTarget);
      const reportedId = parseInt(String(fd.get('player_id')), 10);
      const ruleId = String(fd.get('rule_id') || '');
      const desc = String(fd.get('description') || '').trim();
      if (!reportedId || !ruleId || !desc) throw new Error('Completa todos los campos obligatorios');

      let reportedName: string | null = null;
      try {
        const { data: rp } = await publicDb.from('players').select('current_username').eq('id', reportedId).maybeSingle();
        reportedName = (rp as any)?.current_username ?? null;
      } catch { /* nombre opcional */ }

      const evidenceUrls = files.length > 0 ? await uploadEvidence() : [];

      const payload: Record<string, unknown> = {
        reported_player_id: reportedId,
        reported_player_name: reportedName,
        player_id: playerId,
        player_name: displayName,
        match_id: matchId,
        rule_section_id: ruleId,
        report_type: 'player',
        description: desc,
        status: 'pending',
      };
      if (evidenceUrls.length > 0) payload.evidence_urls = evidenceUrls;

      const { error: insErr } = await publicDb.from('player_reports').insert(payload);
      if (insErr) throw new Error(insErr.message);

      setSuccess('✓ Reporte enviado correctamente. Un admin lo revisara pronto.');
      (e.target as HTMLFormElement).reset();
      setFiles([]);
    } catch (err: any) {
      setError('✖ ' + (err?.message ?? 'Error desconocido'));
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Loader />;
  if (!playerId) {
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', padding: 16, textAlign: 'center' }}>
        <p style={{ color: colors.muted, marginBottom: 16 }}>Debes iniciar sesion como jugador para enviar un reporte.</p>
        <Link to="/login" style={{ color: colors.accent }}>Ir al login</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <Reveal>
        <Section title="🚨 Reportar Jugador">
          <p style={{ color: colors.muted, fontSize: 13, marginTop: 0 }}>
            Reporta una infraccion del reglamento. El equipo de moderacion lo revisara.
            {matchId && <> <span style={{ color: colors.accent }}>Partida: #{matchId}</span></>}
          </p>
          <form onSubmit={onSubmit}>
            <label style={{ fontSize: 12, color: colors.muted }}>Tu ID de Supremacy</label>
            <Input name="supremacy_id" value={playerId} readOnly style={{ ...styles.input, opacity: 0.7 }} />
            <label style={{ fontSize: 12, color: colors.muted }}>Tu nombre</label>
            <Input name="reporter_name" value={displayName} readOnly style={{ ...styles.input, opacity: 0.7 }} />
            <label style={{ fontSize: 12, color: colors.muted }}>ID del jugador reportado *</label>
            <Input name="player_id" type="number" required placeholder="Ej: 12345678" style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Seccion del reglamento *</label>
            <Select name="rule_id" required defaultValue="" style={styles.input}>
              <option value="">Seleccionar seccion...</option>
              {rules.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>
            <label style={{ fontSize: 12, color: colors.muted }}>Descripcion *</label>
            <TextArea name="description" required rows={5} placeholder="Describe la infraccion con el mayor detalle posible..." style={styles.input} />

            <label style={{ fontSize: 12, color: colors.muted }}>Evidencia (max {MAX_FILES} archivos, imagenes o video)</label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              style={{
                border: `2px dashed ${dragOver ? colors.accent : colors.border}`, borderRadius: 10,
                padding: 24, textAlign: 'center', cursor: 'pointer', marginBottom: 8,
                background: dragOver ? 'rgba(255,143,0,0.05)' : 'transparent',
              }}
            >
              <p style={{ color: colors.muted, margin: 0, fontSize: 13 }}>Arrastra archivos aqui o haz clic para seleccionar</p>
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {files.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {files.map((f, i) => (
                  <div key={i} style={{ position: 'relative', width: 80 }}>
                    {f.type.startsWith('video/')
                      ? <video src={previews[i]} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6 }} />
                      : <img src={previews[i]} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6 }} />}
                    <button type="button" onClick={() => removeFile(i)} style={{
                      position: 'absolute', top: -6, right: -6, background: colors.danger, color: '#fff',
                      border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10,
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
            {success && <p style={{ color: colors.success, fontSize: 13 }}>{success}</p>}
            <Button type="submit" disabled={sending} style={{ marginTop: 8 }}>
              {sending ? 'Enviando...' : '🚨 Enviar Reporte'}
            </Button>
          </form>
        </Section>
      </Reveal>
    </div>
  );
}
