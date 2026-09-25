import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { compressImage } from '../../lib/image';
import { formatDate } from '../../lib/format';
import { colors } from '../../theme';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Input, Select, TextArea } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { useAdmin } from '../../lib/admin';

const MAX_FILES = 3;
const BUCKET = 'evidence';

interface StrikeType {
  id: string; name: string; severity: number; legend: string | null;
  code?: string; nullifies_kills?: boolean; is_ban?: boolean; ban_duration_hours?: number | null;
}

interface Strike {
  id: string;
  player_id: number;
  match_id: string | null;
  strike_type_id: string;
  reason: string;
  notes: string | null;
  status: string;
  applied_at: string;
  evidence_urls: string[] | null;
  players?: { id: number; current_username: string } | null;
  strike_types?: StrikeType | null;
  matches?: { id: string; name: string } | null;
}

interface PlayerOpt { id: number; current_username: string }
interface MatchOpt { id: string; name: string }
interface RuleOpt { id: string; title: string }

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function parseStrikeFormula(legend: string | null) {
  const base = { penalty_pct: 0, nullifies_kills: false, is_ban: false, ban_duration_hours: null as number | null };
  if (!legend) return base;
  try {
    const p = JSON.parse(legend);
    return {
      penalty_pct: parseFloat(p.penalty_pct) || 0,
      nullifies_kills: !!p.nullifies_kills,
      is_ban: !!p.is_ban,
      ban_duration_hours: p.ban_duration_hours || null,
    };
  } catch {
    const m = legend.match(/(\d+)%/);
    return { ...base, penalty_pct: m ? parseInt(m[1]) : 0, nullifies_kills: /nullif/i.test(legend), is_ban: /ban/i.test(legend) };
  }
}

const SEV: Record<number, { label: string; color: string }> = {
  1: { label: 'LEVE', color: colors.success },
  2: { label: 'MEDIO', color: colors.accent },
  3: { label: 'GRAVE', color: colors.danger },
};

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };

/** AdminStrikesPage — puerto de admin-strikes.js. */
function Strikes() {
  const { admin } = useAdmin();
  const [params] = useSearchParams();
  const [strikes, setStrikes] = useState<Strike[] | null>(null);
  const [types, setTypes] = useState<StrikeType[]>([]);
  const [typesMap, setTypesMap] = useState<Record<string, StrikeType>>({});
  const [matches, setMatches] = useState<MatchOpt[]>([]);
  const [rules, setRules] = useState<RuleOpt[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  // Modal state
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
  const [dragOver, setDragOver] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // View modal
  const [viewStrike, setViewStrike] = useState<Strike | null>(null);

  const prefillReport = params.get('prefill_report');

  async function loadDropdowns() {
    const { data: tData } = await publicDb.from('strike_types').select('*').eq('is_active', true).order('severity');
    setTypes((tData as StrikeType[]) || []);
    const { data: mData } = await publicDb.from('matches').select('id, name').order('created_at', { ascending: false }).limit(50);
    setMatches((mData as MatchOpt[]) || []);
    const { data: rData } = await publicDb.from('rule_sections').select('id, title').eq('is_active', true).order('order_index');
    setRules((rData as RuleOpt[]) || []);
  }

  const loadStrikes = useCallback(async () => {
    setError('');
    try {
      const { data: tData } = await publicDb.from('strike_types').select('*').order('severity');
      const tMap: Record<string, StrikeType> = {};
      ((tData as StrikeType[]) || []).forEach((t) => { tMap[t.id] = t; });
      setTypesMap(tMap);

      const { data, error: sErr } = await publicDb.from('player_strikes')
        .select('*, evidence_urls, players(id, current_username)')
        .order('applied_at', { ascending: false })
        .limit(100);
      if (sErr) throw sErr;

      let list = ((data as Strike[]) || []).filter((s) => s.status !== 'removed');
      const matchIds = [...new Set(list.map((s) => s.match_id).filter(Boolean))] as string[];
      const mMap: Record<string, { id: string; name: string }> = {};
      if (matchIds.length > 0) {
        try {
          const { data: mData } = await publicDb.from('matches').select('id, name').in('id', matchIds);
          ((mData as MatchOpt[]) || []).forEach((m) => { mMap[m.id] = m; });
        } catch { /* nombres de partida opcionales */ }
      }
      list = list.map((s) => ({ ...s, strike_types: tMap[s.strike_type_id] || null, matches: s.match_id ? mMap[s.match_id] || null : null }));
      setStrikes(list);
    } catch (e: any) {
      setError(e.message || 'Error cargando strikes');
      setStrikes([]);
    }
  }, []);

  useEffect(() => { loadStrikes(); }, [loadStrikes]);

  // Prefill
  useEffect(() => {
    const prefillPlayer = params.get('prefill_player');
    const prefillMatch = params.get('prefill_match');
    if (!prefillPlayer && !prefillMatch && !prefillReport) return;
    (async () => {
      await loadDropdowns();
      if (prefillPlayer) {
        setPlayerId(parseInt(prefillPlayer));
        try {
          const { data: p } = await publicDb.from('players').select('current_username').eq('id', parseInt(prefillPlayer)).maybeSingle();
          if (p) setPlayerName((p as PlayerOpt).current_username);
        } catch { /* opcional */ }
      }
      if (prefillMatch) setMatchId(prefillMatch);
      setModalOpen(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPlayerInput(q: string) {
    setPlayerName(q);
    if (!playerId && /^\d+$/.test(q.trim())) setPlayerId(parseInt(q.trim()));
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

  function selectPlayer(p: PlayerOpt) {
    setPlayerId(p.id);
    setPlayerName(p.current_username);
    setSugOpen(false);
  }

  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) return;
    const arr = Array.from(incoming);
    if (files.length + arr.length > MAX_FILES) { setError('Máximo ' + MAX_FILES + ' archivos'); return; }
    setError('');
    setFiles((prev) => [...prev, ...arr].slice(0, MAX_FILES));
  }

  const ruleHint = (() => {
    const t = typesMap[typeId];
    if (!t) return null;
    const f = parseStrikeFormula(t.legend);
    const parts: string[] = [];
    if (f.nullifies_kills) parts.push('Anula todas las bajas del jugador');
    else if (f.penalty_pct > 0) parts.push('Penaliza el ' + f.penalty_pct + '% de las bajas');
    if (f.is_ban) parts.push(f.ban_duration_hours ? 'Ban temporal de ' + f.ban_duration_hours + ' horas' : 'Ban permanente');
    return parts.length ? parts.join(' | ') : null;
  })();

  async function saveStrike() {
    if (!playerId || !typeId || !reason.trim()) { setError('Jugador, tipo y razón son obligatorios'); return; }
    setSaving(true);
    setError('');
    try {
      const { data: sessData } = await publicDb.auth.getSession();
      const session = sessData.session;
      if (!session) throw new Error('Sesión admin no encontrada');

      // Subir evidencia
      let evidenceUrls: string[] = [];
      if (files.length > 0) {
        const targetId = 'strike_' + Date.now();
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const isImage = f.type.startsWith('image/');
          const payload = isImage ? b64ToBlob(await compressImage(f, 1200, 0.7), 'image/webp') : f;
          const filePath = `strikes/${targetId}/${i}_${isImage ? 'evidence.webp' : f.name}`;
          const { error: upErr } = await publicDb.storage.from(BUCKET).upload(filePath, payload, { upsert: true });
          if (upErr) throw new Error('Error subiendo evidencia: ' + upErr.message);
          const { data: pub } = publicDb.storage.from(BUCKET).getPublicUrl(filePath);
          evidenceUrls.push(pub.publicUrl);
        }
      }

      const typeInfo = typesMap[typeId] || ({} as StrikeType);
      const now = new Date();
      let expiresAt: string | null = null;
      if (typeInfo.is_ban && typeInfo.ban_duration_hours) {
        expiresAt = new Date(now.getTime() + (typeInfo.ban_duration_hours as number) * 60 * 60 * 1000).toISOString();
      }

      const insertPayload: Record<string, unknown> = {
        player_id: playerId,
        match_id: matchId || null,
        strike_type_id: typeId,
        reason: reason.trim(),
        notes: notes.trim() || null,
        rule_section_id: ruleId || null,
        report_id: prefillReport || null,
        applied_by: session.user.id,
        status: 'active',
        expires_at: expiresAt,
      };
      if (evidenceUrls.length > 0) insertPayload.evidence_urls = evidenceUrls;

      const { data: newStrike, error: insErr } = await publicDb.from('player_strikes').insert(insertPayload).select('id').single();
      if (insErr) throw insErr;

      // Efecto ban
      if (typeInfo.is_ban) {
        try {
          await publicDb.from('players').update({ status: 'banned', banned_until: expiresAt, suspension_reason: reason.trim() }).eq('id', playerId);
        } catch (banErr) { console.error('[Strikes] No se pudo aplicar ban:', banErr); }
      }

      // Snapshot de sanción
      try {
        const { data: results } = await publicDb.from('match_results')
          .select('kills, match_id, matches!inner(match_type)')
          .eq('player_id', playerId)
          .neq('matches.match_type', 'internal');
        const rList = (results as { kills: number; match_id: string }[]) || [];
        const mIds = [...new Set(rList.map((r) => r.match_id).filter(Boolean))];
        const validMatches: Record<string, boolean> = {};
        if (mIds.length > 0) {
          const { data: regs } = await publicDb.from('match_registrations').select('match_id').eq('player_id', playerId).in('match_id', mIds);
          ((regs as { match_id: string }[]) || []).forEach((r) => { validMatches[r.match_id] = true; });
        }
        const killsBefore = rList.reduce((t, r) => t + (validMatches[r.match_id] ? r.kills || 0 : 0), 0);
        const formula = parseStrikeFormula(typeInfo.legend);
        const penaltyPct = formula.penalty_pct || 0;
        const killsAfter = typeInfo.nullifies_kills ? 0 : Math.round(killsBefore * (1 - penaltyPct / 100));
        const { data: playerBefore } = await publicDb.from('players').select('status').eq('id', playerId).maybeSingle();
        await publicDb.from('player_sanctions').insert({
          player_id: playerId,
          strike_id: newStrike ? (newStrike as { id: string }).id : null,
          strike_type_id: typeId,
          kills_before: killsBefore,
          kills_after: killsAfter,
          status_before: playerBefore ? (playerBefore as { status: string }).status : null,
          status_after: typeInfo.is_ban ? 'banned' : playerBefore ? (playerBefore as { status: string }).status : null,
          penalty_pct: penaltyPct,
          formula_used: typeInfo.legend || null,
        });
      } catch (sancErr) { console.error('[Strikes] No se pudo guardar sanción:', sancErr); }

      // Resolver reporte origen
      if (prefillReport) {
        try {
          await publicDb.from('player_reports').update({
            status: 'resolved',
            strike_applied: true,
            strike_id: newStrike ? (newStrike as { id: string }).id : null,
            resolved_at: now.toISOString(),
            resolved_by: session.user.id,
            admin_response: '[AUTO] Strike aplicado: ' + (typeInfo.name || ''),
          }).eq('id', prefillReport);
        } catch (repErr) { console.log('[Strikes] No se pudo actualizar reporte:', repErr); }
      } else {
        try {
          const sevLabel = typeInfo.severity === 1 ? 'leve' : typeInfo.severity === 2 ? 'medio' : 'grave';
          await publicDb.from('player_reports').insert({
            reported_player_id: playerId,
            match_id: matchId || null,
            report_type: 'strike_' + sevLabel,
            description: '[AUTO] Strike ' + sevLabel + ': ' + (typeInfo.name || '') + ' - ' + reason.trim(),
            status: 'resolved',
            resolved_by: session.user.id,
            resolved_at: now.toISOString(),
            admin_response: 'Strike aplicado automáticamente',
          });
        } catch (repErr) { console.log('[Strikes] No se pudo crear reporte automático:', repErr); }
      }

      closeModal();
      await loadStrikes();
    } catch (e: any) {
      setError(e.message || 'Error aplicando strike');
    } finally {
      setSaving(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setFiles([]);
    setPlayerId(null);
    setPlayerName('');
    setTypeId('');
    setMatchId('');
    setRuleId('');
    setReason('');
    setNotes('');
  }

  async function removeStrike(id: string) {
    if (!window.confirm('¿Revocar este strike?')) return;
    const removalReason = window.prompt('Razón de la revocación (opcional):') || '';
    try {
      const { data: strikeData, error: fetchErr } = await publicDb.from('player_strikes')
        .select('player_id, strike_type_id').eq('id', id).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!strikeData) { setError('No se encontró el strike para revocar'); return; }
      const sPlayerId = (strikeData as { player_id: number }).player_id;
      const sTypeId = (strikeData as { strike_type_id: string }).strike_type_id;
      const typeInfo = typesMap[sTypeId] || {};
      const wasBan = !!(typeInfo as StrikeType).is_ban;

      const { data, error } = await publicDb.from('player_strikes').update({
        status: 'removed',
        removed_at: new Date().toISOString(),
        removed_by: admin?.id || null,
        removal_reason: removalReason,
      }).eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) { setError('No se encontró el strike para revocar'); return; }

      if (wasBan && sPlayerId) {
        try {
          const { data: activeStrikes } = await publicDb.from('player_strikes')
            .select('strike_type_id').eq('player_id', sPlayerId).eq('status', 'active');
          const hasOtherBan = ((activeStrikes as { strike_type_id: string }[]) || []).some((s) => {
            const t = typesMap[s.strike_type_id];
            return t && t.is_ban;
          });
          if (!hasOtherBan) {
            await publicDb.from('players').update({ status: 'active', banned_until: null, suspension_reason: null }).eq('id', sPlayerId);
          }
        } catch (banErr) { console.error('[Strikes] Error reactivando jugador:', banErr); }
      }
      await loadStrikes();
    } catch (e: any) {
      setError(e.message || 'Error revocando strike');
    }
  }

  const filtered = (strikes || []).filter((s) => {
    if (!query) return true;
    const name = s.players?.current_username || '';
    return name.toLowerCase().includes(query.toLowerCase());
  });

  const counts = { leve: 0, medio: 0, grave: 0, nullifier: 0 };
  (strikes || []).forEach((s) => {
    const t = s.strike_types;
    if (t) {
      if (t.severity === 1) counts.leve++;
      else if (t.severity === 2) counts.medio++;
      else if (t.severity === 3 && t.nullifies_kills) counts.nullifier++;
      else if (t.severity === 3) counts.grave++;
    }
  });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Strikes</h1>
          <p style={{ color: colors.muted, margin: 0 }}>Gestión de strikes y baneos</p>
        </div>
        <Button onClick={() => { loadDropdowns(); setModalOpen(true); }}>+ Aplicar Strike</Button>
      </div>

      {error && <div style={{ color: colors.danger, margin: '12px 0' }}>{error}</div>}

      {strikes === null ? (
        <Loader />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '20px 0' }}>
            {([
              ['Leves', counts.leve, colors.success],
              ['Medios', counts.medio, colors.accent],
              ['Graves', counts.grave, colors.danger],
              ['Nullifiers', counts.nullifier, colors.purple],
            ] as [string, number, string][]).map(([label, value, color]) => (
              <div key={label} style={{ ...cardStyle, borderLeft: `3px solid ${color}` }}>
                <div style={{ fontSize: 12, color: colors.muted }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>

          <Input placeholder="Buscar por jugador…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%', maxWidth: 360, marginBottom: 16 }} />

          {filtered.length === 0 ? (
            <EmptyState message="No hay strikes registrados" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((s) => {
                const t = s.strike_types;
                const sev = t ? SEV[t.severity] || SEV[1] : null;
                return (
                  <div key={s.id} style={{ ...cardStyle, cursor: 'pointer' }} onClick={() => setViewStrike(s)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{s.players?.current_username || 'Jugador ' + s.player_id}</strong>
                          {sev && <span style={{ background: sev.color + '20', color: sev.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{sev.label}</span>}
                          {t?.nullifies_kills && <Badge label="KILL NULLIFIER" tone="purple" />}
                          {s.evidence_urls && s.evidence_urls.length > 0 && <Badge label={'📷 ' + s.evidence_urls.length} tone="warning" />}
                          {s.status === 'removed' && <Badge label="REMOVIDO" tone="neutral" />}
                        </div>
                        <p style={{ fontSize: 14, margin: '6px 0 4px' }}>{s.reason}</p>
                        <p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>
                          Partida: {s.matches?.name || (s.match_id ? 'Partida ' + s.match_id : '-')} | {formatDate(s.applied_at)}
                          {t ? ' | ' + (t.code || '') + ': ' + t.name : ''}
                        </p>
                      </div>
                      {s.status !== 'removed' && (
                        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-block' }}>
                          <Button variant="danger" style={{ fontSize: 12 }} onClick={() => removeStrike(s.id)}>Revocar</Button>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal aplicar strike */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Aplicar Strike</h3>

            <label style={labelStyle}>Jugador *</label>
            <div style={{ position: 'relative' }}>
              <Input value={playerName} onChange={(e) => { setPlayerId(null); onPlayerInput(e.target.value); }} onFocus={() => suggestions.length && setSugOpen(true)} placeholder="Buscar por nombre o ID…" style={{ width: '100%' }} />
              {sugOpen && suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 8, zIndex: 10, maxHeight: 220, overflowY: 'auto' }}>
                  {suggestions.map((p) => (
                    <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14 }} onMouseDown={() => selectPlayer(p)}>
                      <strong>{p.current_username}</strong> <span style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>ID: {p.id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {playerId && <p style={{ fontSize: 12, color: colors.success, margin: '4px 0 0' }}>Seleccionado: {playerName} (ID: {playerId})</p>}

            <label style={{ ...labelStyle, marginTop: 12 }}>Tipo de strike *</label>
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} style={{ width: '100%' }}>
              <option value="">Seleccionar…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            {ruleHint && <p style={{ fontSize: 12, color: colors.accent, margin: '6px 0 0' }}>{ruleHint}</p>}

            <label style={{ ...labelStyle, marginTop: 12 }}>Partida</label>
            <Select value={matchId} onChange={(e) => setMatchId(e.target.value)} style={{ width: '100%' }}>
              <option value="">Seleccionar partida…</option>
              {matches.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>

            <label style={{ ...labelStyle, marginTop: 12 }}>Sección de reglas</label>
            <Select value={ruleId} onChange={(e) => setRuleId(e.target.value)} style={{ width: '100%' }}>
              <option value="">Seleccionar sección…</option>
              {rules.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>

            <label style={{ ...labelStyle, marginTop: 12 }}>Razón *</label>
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Describe la infracción" style={{ width: '100%' }} />

            <label style={{ ...labelStyle, marginTop: 12 }}>Notas (opcional)</label>
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: '100%' }} />

            <label style={{ ...labelStyle, marginTop: 12 }}>Evidencia (máx. {MAX_FILES})</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? colors.accent : colors.border}`, borderRadius: 10, padding: 20, textAlign: 'center', cursor: 'pointer', color: colors.muted, fontSize: 13 }}
            >
              Arrastra archivos aquí o haz clic para seleccionar
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            {files.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {files.map((f, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    {f.type.startsWith('video/')
                      ? <video src={URL.createObjectURL(f)} style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />
                      : <img src={URL.createObjectURL(f)} alt="" style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />}
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))} style={{ position: 'absolute', top: -6, right: -6, background: colors.danger, color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <Button onClick={saveStrike} disabled={saving}>{saving ? 'Aplicando…' : 'Aplicar Strike'}</Button>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal vista detalle */}
      {viewStrike && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 16 }} onClick={() => setViewStrike(null)}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Strike — {viewStrike.players?.current_username || 'Jugador ' + viewStrike.player_id}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              {viewStrike.strike_types && (() => { const sev = SEV[viewStrike.strike_types!.severity] || SEV[1]; return <span style={{ background: sev.color + '20', color: sev.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{sev.label}</span>; })()}
              {viewStrike.strike_types?.nullifies_kills && <Badge label="KILL NULLIFIER" tone="purple" />}
              <span style={{ fontSize: 12, color: colors.muted }}>{formatDate(viewStrike.applied_at)}</span>
            </div>
            <p style={{ fontSize: 14 }}><strong>Razón:</strong> {viewStrike.reason}</p>
            <p style={{ fontSize: 14 }}><strong>Partida:</strong> {viewStrike.matches?.name || (viewStrike.match_id ? 'Partida ' + viewStrike.match_id : '-')}</p>
            {viewStrike.notes && <p style={{ fontSize: 13, color: colors.muted }}><strong>Notas:</strong> {viewStrike.notes}</p>}
            {viewStrike.evidence_urls && viewStrike.evidence_urls.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: colors.accent, margin: '12px 0 8px' }}>📷 Evidencia adjunta:</h4>
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
    </div>
  );
}

export default function AdminStrikesPage() {
  return (
    <AdminGate staffOnly>
      <Strikes />
    </AdminGate>
  );
}
