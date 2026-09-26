import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicDb, serverApi, fetchMe } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { compressImage } from '../../lib/image';
import SectionTabs, { useTabParam } from '../../components/SectionTabs';
import DataTable from '../../components/DataTable';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import { Input, Select, TextArea } from '../../components/Field';
import { styles, colors } from '../../theme';

const MAX_FILES = 3;

type Strike = {
  id: string; player_id: number; match_id: string | null; strike_type_id: string | null;
  rule_section_id: string | null; reason: string; notes: string | null; status: string;
  applied_at: string; evidence_urls: string[] | null;
  players?: { current_username: string } | null;
  strike_types?: { name: string; severity: string | null } | null;
};

type StrikeType = {
  id: string; code: string | null; name: string; description: string | null;
  severity: string | null; legend: string | null;
  is_ban: boolean | null; nullifies_kills: boolean | null; alliance_id: string | null;
};

type Report = {
  id: string; player_id: number; player_name: string | null;
  reported_player_id: number; reported_player_name: string | null;
  report_type: string | null; description: string; evidence_urls: string[] | null;
  status: string; admin_response: string | null; strike_applied: boolean | null;
  created_at: string; resolved_at: string | null;
};

type Sanction = {
  id: string; player_id: number; kills_before: number | null; kills_after: number | null;
  penalty_pct: number | null; formula_used: string | null; created_at: string;
  players?: { current_username: string } | null;
};

type PlayerOpt = { id: number; current_username: string };
type NameOpt = { id: string; name?: string; title?: string };

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function parsePenaltyPct(legend: string | null | undefined): number {
  if (!legend) return 0;
  try { return parseFloat(JSON.parse(legend).penalty_pct) || 0; }
  catch { const m = legend.match(/(\d+)%/); return m ? parseInt(m[1]) : 0; }
}

const card: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const label: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };

const STATUS_META: Record<string, { label: string; tone: 'danger' | 'warning' | 'success' | 'neutral' | 'active' }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  resolved: { label: 'Resuelto', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'neutral' },
  active: { label: 'Activo', tone: 'danger' },
  removed: { label: 'Retirado', tone: 'neutral' },
};

/**
 * SancionesPage — motor de conducta INTERNO de la alianza.
 * Misma maquinaria que el motor de plataforma (strikes tipados + reglamento +
 * reportes + historial) pero de jurisdiccion exclusiva de la alianza:
 * nunca toca bajas globales, baneos de plataforma ni el ranking general.
 */
export default function SancionesPage({ allianceId }: { allianceId: string }) {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useTabParam(['strikes', 'reports', 'history']);

  // Aplicar strikes / cerrar reportes = liderazgo (lider o co-lider).
  // Un oficial simple tiene esta pagina en solo lectura (así lo definieron los roles).
  const [canApply, setCanApply] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (cancelled) return;
      setCanApply(me.kind === 'admin' || me.officerRole === 'co_leader');
    }).catch(() => { /* solo lectura por defecto */ });
    return () => { cancelled = true; };
  }, []);

  /* ---------------- catalogos ---------------- */
  const { data: types, reload: reloadTypes } = useApi<StrikeType[]>(
    () => serverApi.get(`/alliances/${allianceId}/strike-types`), [allianceId]);

  const { data: rules } = useApi<NameOpt[]>(async () => {
    const { data } = await publicDb.from('rule_sections').select('id, title')
      .eq('alliance_id', allianceId).eq('is_active', true).order('order_index');
    return (data as NameOpt[]) ?? [];
  }, [allianceId]);

  const { data: matches } = useApi<NameOpt[]>(async () => {
    const [{ data: m1 }, { data: m2 }, { data: m3 }] = await Promise.all([
      publicDb.from('matches').select('id, name').eq('alliance_id', allianceId),
      publicDb.from('matches').select('id, name').eq('alliance_a_id', allianceId),
      publicDb.from('matches').select('id, name').eq('alliance_b_id', allianceId),
    ]);
    const map = new Map<string, NameOpt>();
    [...((m1 as NameOpt[]) ?? []), ...((m2 as NameOpt[]) ?? []), ...((m3 as NameOpt[]) ?? [])]
      .forEach((m) => map.set(m.id, m));
    return [...map.values()].slice(0, 100);
  }, [allianceId]);

  /* ---------------- strikes ---------------- */
  const { data: strikes, loading: strikesLoading, error: strikesError, reload: reloadStrikes } = useApi<Strike[]>(
    () => serverApi.get(`/alliances/${allianceId}/strikes`), [allianceId]);
  const { data: sanctions, loading: sanctionsLoading, reload: reloadSanctions } = useApi<Sanction[]>(
    () => serverApi.get(`/alliances/${allianceId}/sanctions`), [allianceId]);

  const [query, setQuery] = useState('');

  // Modal strike
  const [modalOpen, setModalOpen] = useState(false);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [ruleId, setRuleId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [suggestions, setSuggestions] = useState<PlayerOpt[]>([]);
  const [sugOpen, setSugOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [reportLinkId, setReportLinkId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Vista detalle
  const [viewStrike, setViewStrike] = useState<Strike | null>(null);

  const prefillPlayer = searchParams.get('prefill_player');

  const usableTypes = (types ?? []).filter((t) => !t.is_ban && !t.nullifies_kills);

  const ruleHint = (() => {
    const t = (types ?? []).find((x) => x.id === typeId);
    if (!t) return null;
    const pct = parsePenaltyPct(t.legend);
    return pct > 0 ? `Penaliza el ${pct}% de las bajas internas` : 'Registro disciplinario interno (sin efectos de plataforma)';
  })();

  function openStrikeModal(prefill?: { playerId: number; playerName: string; reportId?: string }) {
    setPlayerId(prefill?.playerId ?? (prefillPlayer ? Number(prefillPlayer) : null));
    setPlayerName(prefill?.playerName ?? (prefillPlayer ? `Jugador ${prefillPlayer}` : ''));
    setReportLinkId(prefill?.reportId ?? null);
    setTypeId(''); setMatchId(''); setRuleId(''); setReason(''); setNotes(''); setFiles([]);
    setFormError(''); setModalOpen(true);
  }

  function onPlayerInput(q: string) {
    setPlayerName(q);
    setPlayerId(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSuggestions([]); setSugOpen(false); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const isNumber = /^\d+$/.test(q.trim());
        let qBuilder = publicDb.from('players').select('id, current_username').limit(10);
        qBuilder = isNumber
          ? qBuilder.or('id.eq.' + parseInt(q.trim()) + ',current_username.ilike.%' + q.trim() + '%')
          : qBuilder.ilike('current_username', '%' + q.trim() + '%');
        const { data } = await qBuilder;
        setSuggestions((data as PlayerOpt[]) || []);
        setSugOpen(true);
      } catch { setSugOpen(false); }
    }, 300);
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const arr = Array.from(incoming);
    if (files.length + arr.length > MAX_FILES) { setFormError('Máximo ' + MAX_FILES + ' archivos'); return; }
    setFormError('');
    setFiles((prev) => [...prev, ...arr].slice(0, MAX_FILES));
  }

  async function saveStrike() {
    if (!playerId || !reason.trim()) { setFormError('Jugador y motivo son obligatorios'); return; }
    setSaving(true); setFormError('');
    try {
      let evidenceUrls: string[] = [];
      if (files.length > 0) {
        const targetId = 'strike_' + Date.now();
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const isImage = f.type.startsWith('image/');
          const payload = isImage ? b64ToBlob(await compressImage(f, 1200, 0.7), 'image/webp') : f;
          const filePath = `strikes/${targetId}/${i}_${isImage ? 'evidence.webp' : f.name}`;
          const { error: upErr } = await publicDb.storage.from('evidence').upload(filePath, payload, { upsert: true });
          if (upErr) throw new Error('Error subiendo evidencia: ' + upErr.message);
          const { data: pub } = publicDb.storage.from('evidence').getPublicUrl(filePath);
          evidenceUrls.push(pub.publicUrl);
        }
      }
      const saved = await serverApi.post(`/alliances/${allianceId}/strikes`, {
        playerId, strikeTypeId: typeId || undefined, reason: reason.trim(),
        notes: notes.trim() || undefined, matchId: matchId || undefined,
        ruleSectionId: ruleId || undefined, evidenceUrls: evidenceUrls.length ? evidenceUrls : undefined,
      });
      if (reportLinkId) {
        try {
          const tName = (types ?? []).find((x) => x.id === typeId)?.name;
          await serverApi.put(`/alliances/${allianceId}/reports/${reportLinkId}`, {
            status: 'resolved', adminResponse: '[AUTO] Strike interno aplicado' + (tName ? ': ' + tName : ''),
            strikeId: saved?.id,
          });
        } catch { /* el strike ya quedo; el reporte se cierra manual */ }
      }
      setModalOpen(false);
      reloadStrikes(); reloadSanctions();
      if (reportLinkId) reloadReports();
    } catch (e: any) {
      setFormError(e.message || 'Error aplicando strike');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- reportes ---------------- */
  const { data: reports, loading: reportsLoading, error: reportsError, reload: reloadReports } = useApi<Report[]>(
    () => serverApi.get(`/alliances/${allianceId}/reports`), [allianceId]);

  const [newReportPlayer, setNewReportPlayer] = useState('');
  const [newReportDesc, setNewReportDesc] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  async function createReport(e: React.FormEvent) {
    e.preventDefault();
    setReportBusy(true); setReportFeedback(null);
    try {
      await serverApi.post(`/alliances/${allianceId}/reports`, {
        reportedPlayerId: Number(newReportPlayer), description: newReportDesc.trim(),
      });
      setReportFeedback('✓ Reporte interno registrado.');
      setNewReportPlayer(''); setNewReportDesc('');
      reloadReports();
    } catch (e2: any) {
      setReportFeedback('✖ ' + (e2.message || 'Error'));
    } finally { setReportBusy(false); }
  }

  async function resolveReport(r: Report, status: 'resolved' | 'rejected') {
    const response = window.prompt(`Respuesta para ${r.reported_player_name ?? r.reported_player_id} (opcional):`) || '';
    try {
      await serverApi.put(`/alliances/${allianceId}/reports/${r.id}`, { status, adminResponse: response });
      reloadReports();
    } catch (e: any) {
      setReportFeedback('✖ ' + (e.message || 'Error'));
    }
  }

  const pendingReports = (reports ?? []).filter((r) => r.status === 'pending');

  /* ---------------- derived ---------------- */
  const typeName = useCallback((id: string | null) => (types ?? []).find((t) => t.id === id)?.name ?? null, [types]);
  const ruleTitle = useCallback((id: string | null) => (rules ?? []).find((r) => r.id === id)?.title ?? null, [rules]);
  const matchName = useCallback((id: string | null) => (matches ?? []).find((m) => m.id === id)?.name ?? null, [matches]);

  useEffect(() => {
    if (!prefillPlayer) return;
    (async () => {
      let name = 'Jugador ' + prefillPlayer;
      try {
        const { data } = await publicDb.from('players').select('current_username').eq('id', Number(prefillPlayer)).maybeSingle();
        if (data) name = (data as PlayerOpt).current_username;
      } catch { /* noop */ }
      openStrikeModal({ playerId: Number(prefillPlayer), playerName: name });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredStrikes = (strikes ?? []).filter((s) => {
    if (!query) return true;
    return (s.players?.current_username || String(s.player_id)).toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div>
      <h1 style={{ color: colors.text }}>⚖️ Conducta interna de la alianza</h1>
      <p style={{ color: colors.muted, marginTop: -8 }}>
        Motor disciplinario privado: strikes tipados, ligados a tu reglamento y tus partidas, con bandeja de reportes entre miembros.
        Nada de esto afecta el ranking global ni banea cuentas de plataforma — eso sigue siendo del staff.
      </p>

      {!canApply && (
        <p style={{ background: 'rgba(79,195,247,0.1)', border: '1px solid rgba(79,195,247,0.3)', borderRadius: 8, padding: '8px 12px', color: colors.info, fontSize: 13 }}>
          👁 Modo solo lectura: los oficiales ven la conducta interna; aplicar strikes y cerrar reportes es del líder o co-líder.
        </p>
      )}

      <SectionTabs
        tabs={[
          { id: 'strikes', label: `⚡ Strikes (${(strikes ?? []).length})` },
          { id: 'reports', label: `📨 Reportes${pendingReports.length ? ` (${pendingReports.length})` : ''}` },
          { id: 'history', label: '📜 Historial' },
        ]}
        active={tab} onChange={setTab}
      />

      {/* ================= STRIKES ================= */}
      {tab === 'strikes' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, margin: '16px 0' }}>
            <Input placeholder="Buscar por jugador…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320, marginBottom: 0 }} />
            {canApply && <Button onClick={() => openStrikeModal()}>+ Aplicar strike</Button>}
          </div>
          {strikesError && <p style={{ color: colors.danger }}>{String(strikesError)}</p>}
          {filteredStrikes.length === 0 && !strikesLoading ? (
            <p style={{ color: colors.muted }}>Sin strikes internos todavía.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredStrikes.map((s) => {
                const st = STATUS_META[s.status] ?? STATUS_META.active;
                return (
                  <div key={s.id} style={{ ...card, cursor: 'pointer' }} onClick={() => setViewStrike(s)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong>{s.players?.current_username ?? 'Jugador ' + s.player_id}</strong>
                          <Badge label={st.label} tone={st.tone} />
                          {s.evidence_urls && s.evidence_urls.length > 0 && <Badge label={'📷 ' + s.evidence_urls.length} tone="warning" />}
                        </div>
                        <p style={{ fontSize: 14, margin: '6px 0 4px' }}>{s.reason}</p>
                        <p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>
                          {new Date(s.applied_at).toLocaleString('es')}
                          {typeName(s.strike_type_id) ? ` | ${typeName(s.strike_type_id)}` : ' | Sin tipo'}
                          {ruleTitle(s.rule_section_id) ? ` | 📜 ${ruleTitle(s.rule_section_id)}` : ''}
                          {matchName(s.match_id) ? ` | 🎮 ${matchName(s.match_id)}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal aplicar strike */}
          {modalOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
              <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                <h3 style={{ marginTop: 0 }}>⚡ Aplicar strike interno{reportLinkId ? ' (desde reporte)' : ''}</h3>
                {formError && <p style={{ color: colors.danger, fontSize: 13 }}>{formError}</p>}

                <label style={label}>Jugador miembro *</label>
                <div style={{ position: 'relative' }}>
                  <Input value={playerName} onChange={(e) => onPlayerInput(e.target.value)} placeholder="Buscar por nombre o ID…" style={{ width: '100%' }} />
                  {sugOpen && suggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 8, zIndex: 10, maxHeight: 220, overflowY: 'auto' }}>
                      {suggestions.map((p) => (
                        <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14 }}
                          onMouseDown={() => { setPlayerId(p.id); setPlayerName(p.current_username); setSugOpen(false); }}>
                          <strong>{p.current_username}</strong>{' '}
                          <span style={{ fontSize: 11, color: colors.muted }}>ID: {p.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {playerId && <p style={{ fontSize: 12, color: colors.success, margin: '4px 0 0' }}>Seleccionado: {playerName} (ID: {playerId})</p>}

                <label style={{ ...label, marginTop: 12 }}>Tipo de falta</label>
                <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Sin tipo (registro simple)</option>
                  {usableTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.alliance_id ? ' (interno)' : ' (liga)'}
                    </option>
                  ))}
                </Select>
                {ruleHint && <p style={{ fontSize: 12, color: colors.accent, margin: '6px 0 0' }}>{ruleHint}</p>}

                <label style={{ ...label, marginTop: 12 }}>Artículo del reglamento interno</label>
                <Select value={ruleId} onChange={(e) => setRuleId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Sin vincular…</option>
                  {(rules ?? []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </Select>

                <label style={{ ...label, marginTop: 12 }}>Partida interna</label>
                <Select value={matchId} onChange={(e) => setMatchId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Sin vincular…</option>
                  {(matches ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>

                <label style={{ ...label, marginTop: 12 }}>Motivo *</label>
                <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Describe la infracción" style={{ width: '100%' }} />

                <label style={{ ...label, marginTop: 12 }}>Notas (opcional)</label>
                <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: '100%' }} />

                <label style={{ ...label, marginTop: 12 }}>Evidencia (máx. {MAX_FILES})</label>
                <div onClick={() => fileRef.current?.click()}
                  style={{ border: `2px dashed ${colors.border}`, borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer', color: colors.muted, fontSize: 13 }}>
                  Haz clic para adjuntar imágenes o vídeos
                </div>
                <input ref={fileRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                {files.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {files.map((f, idx) => (
                      <div key={idx} style={{ position: 'relative' }}>
                        {f.type.startsWith('video/')
                          ? <video src={URL.createObjectURL(f)} style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />
                          : <img src={URL.createObjectURL(f)} alt="" style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />}
                        <button type="button" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                          style={{ position: 'absolute', top: -6, right: -6, background: colors.danger, color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <Button onClick={saveStrike} disabled={saving}>{saving ? 'Aplicando…' : 'Aplicar strike'}</Button>
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
                </div>
              </div>
            </div>
          )}

          {/* Modal detalle */}
          {viewStrike && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 16 }} onClick={() => setViewStrike(null)}>
              <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>{viewStrike.players?.current_username ?? 'Jugador ' + viewStrike.player_id}</h3>
                <p style={{ fontSize: 14 }}><strong>Motivo:</strong> {viewStrike.reason}</p>
                {viewStrike.notes && <p style={{ fontSize: 13, color: colors.muted }}><strong>Notas:</strong> {viewStrike.notes}</p>}
                <p style={{ fontSize: 13, color: colors.muted }}>
                  Tipo: {typeName(viewStrike.strike_type_id) ?? '—'}<br />
                  Reglamento: {ruleTitle(viewStrike.rule_section_id) ?? '—'}<br />
                  Partida: {matchName(viewStrike.match_id) ?? '—'}<br />
                  Fecha: {new Date(viewStrike.applied_at).toLocaleString('es')}
                </p>
                {viewStrike.evidence_urls && viewStrike.evidence_urls.length > 0 && (
                  <>
                    <h4 style={{ fontSize: 14, color: colors.accent, margin: '12px 0 8px' }}>📷 Evidencia:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                      {viewStrike.evidence_urls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer">
                          {/\.(webm|mp4|mov)(\?|$)/i.test(u)
                            ? <video src={u} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8 }} />
                            : <img src={u} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8 }} />}
                        </a>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ marginTop: 16 }}>
                  <Button variant="ghost" onClick={() => setViewStrike(null)}>Cerrar</Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================= REPORTES ================= */}
      {tab === 'reports' && (
        <>
          {canApply && (
            <form onSubmit={createReport} style={{ ...styles.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '16px 0' }}>
              <Input placeholder="ID del jugador miembro" value={newReportPlayer} onChange={(e) => setNewReportPlayer(e.target.value)}
                style={{ flex: '1 1 160px', marginBottom: 0 }} required />
              <Input placeholder="Descripción del incidente…" value={newReportDesc} onChange={(e) => setNewReportDesc(e.target.value)}
                style={{ flex: '3 1 260px', marginBottom: 0 }} required />
              <Button type="submit" disabled={reportBusy}>{reportBusy ? 'Enviando…' : 'Registrar reporte'}</Button>
            </form>
          )}
          {reportFeedback && <p style={{ color: colors.info }}>{reportFeedback}</p>}
          {reportsError && <p style={{ color: colors.danger }}>{String(reportsError)}</p>}

          {(reports ?? []).length === 0 && !reportsLoading ? (
            <p style={{ color: colors.muted }}>Sin reportes internos. Cuando un miembro reporte a otro desde la app, aparecerá aquí.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(reports ?? []).map((r) => {
                const st = STATUS_META[r.status] ?? STATUS_META.pending;
                return (
                  <div key={r.id} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{r.reported_player_name ?? 'Jugador ' + r.reported_player_id}</strong>
                      <Badge label={st.label} tone={st.tone} />
                      {r.strike_applied && <Badge label="⚡ STRIKE APLICADO" tone="purple" />}
                      {r.evidence_urls && r.evidence_urls.length > 0 && <Badge label={'📷 ' + r.evidence_urls.length} tone="warning" />}
                      <span style={{ fontSize: 12, color: colors.muted, marginLeft: 'auto' }}>
                        {new Date(r.created_at).toLocaleString('es')}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: colors.muted, margin: '6px 0' }}>
                      Reportado por {r.player_name ?? 'Jugador ' + r.player_id}
                    </p>
                    <p style={{ fontSize: 14, margin: '4px 0' }}>{r.description}</p>
                    {r.admin_response && <p style={{ fontSize: 13, color: colors.success }}>✓ {r.admin_response}</p>}
                    {r.status === 'pending' && canApply && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <Button style={{ fontSize: 12 }} onClick={() => openStrikeModal({ playerId: r.reported_player_id, playerName: r.reported_player_name ?? '', reportId: r.id })}>
                          ⚡ Aplicar strike
                        </Button>
                        <Button style={{ fontSize: 12 }} onClick={() => resolveReport(r, 'resolved')}>✓ Resolver</Button>
                        <Button variant="danger" style={{ fontSize: 12 }} onClick={() => resolveReport(r, 'rejected')}>✗ Rechazar</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ================= HISTORIAL ================= */}
      {tab === 'history' && (
        <div style={{ marginTop: 16 }}>
          <p style={{ color: colors.muted, fontSize: 13 }}>
            Snapshots de sanciones internas: efecto de cada strike sobre las bajas del miembro en partidas de esta alianza.
          </p>
          <DataTable<Sanction>
            rows={sanctions}
            loading={sanctionsLoading}
            empty="Sin sanciones internas registradas"
            columns={[
              { key: 'player', header: 'Jugador', render: (s) => s.players?.current_username ?? 'Jugador ' + s.player_id },
              { key: 'kills_before', header: 'Bajas (antes)', render: (s) => String(s.kills_before ?? 0) },
              { key: 'kills_after', header: 'Bajas (después)', render: (s) => String(s.kills_after ?? 0) },
              { key: 'penalty_pct', header: 'Penalización', render: (s) => `${s.penalty_pct ?? 0}%` },
              { key: 'created_at', header: 'Fecha', render: (s) => new Date(s.created_at).toLocaleDateString('es') },
            ]}
          />
        </div>
      )}
    </div>
  );
}
