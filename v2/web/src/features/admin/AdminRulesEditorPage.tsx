import { useCallback, useEffect, useMemo, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import { formatDate, formatDateTime } from '../../lib/format';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Input, Select, TextArea } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import { useAdmin } from '../../lib/admin';

interface RuleSection {
  id: string;
  title: string;
  content: string;
  visibility: string | null;
  section_number: string | null;
  parent_id: string | null;
  order_index: number;
  is_active: boolean;
}

interface RuleHistory {
  id: string;
  section_id: string;
  title: string;
  content: string;
  changed_by: string | null;
  changed_at: string;
}

interface MatchOpt { id: string; name: string | null; match_type: string | null }
interface AdminName { id: string; display_name: string | null; role: string | null }

interface Precedent {
  id: string;
  title: string;
  description: string;
  rule_section_id: string | null;
  severity: string | null;
  player_id: number | null;
  match_id: string | null;
  strike_type: string | null;
  resolution: string | null;
  created_by: string | null;
  created_at: string;
  players?: { current_username: string } | null;
  matches?: { name: string } | null;
}

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', marginBottom: 12 };

function getSectionLevel(num: string | null | undefined): number {
  if (!num) return 1;
  const parts = String(num).split('.');
  return parts.filter((p) => p.trim() !== '').length;
}

function sortSectionsHierarchical(sections: RuleSection[]): RuleSection[] {
  return sections.slice().sort((a, b) => {
    const an = String(a.section_number || a.order_index + 1);
    const bn = String(b.section_number || b.order_index + 1);
    const aParts = an.split('.').map((p) => parseInt(p) || 0);
    const bParts = bn.split('.').map((p) => parseInt(p) || 0);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const diff = (aParts[i] || 0) - (bParts[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
}

function validateSectionNumber(value: string): boolean {
  return /^\d+(\.\d+)*$/.test(value.trim());
}

const VIS_META: Record<string, { label: string; color: string }> = {
  public: { label: 'PÚBLICA', color: colors.success },
  officials_only: { label: 'OFICIALES', color: colors.accent },
  training: { label: 'CAPACITACIÓN', color: colors.info },
};

const SEV_META: Record<string, { label: string; color: string }> = {
  high: { label: 'ALTO', color: colors.danger },
  medium: { label: 'MEDIO', color: colors.accent },
  low: { label: 'LEVE', color: colors.success },
};

/** AdminRulesEditorPage — puerto de admin-rules-editor.js (secciones + historial + precedentes). */
function RulesEditor() {
  const { admin } = useAdmin();
  const isSuperAdmin = admin?.role === 'superadmin';

  const [tab, setTab] = useState<'sections' | 'precedents'>('sections');
  const [sections, setSections] = useState<RuleSection[] | null>(null);
  const [precedents, setPrecedents] = useState<Precedent[] | null>(null);
  const [matches, setMatches] = useState<MatchOpt[]>([]);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  // Section modal
  const [secModal, setSecModal] = useState(false);
  const [secId, setSecId] = useState('');
  const [secTitle, setSecTitle] = useState('');
  const [secContent, setSecContent] = useState('');
  const [secVisibility, setSecVisibility] = useState('public');
  const [secNumber, setSecNumber] = useState('');
  const [secParent, setSecParent] = useState('');
  const [saving, setSaving] = useState(false);

  // History modal
  const [historyModal, setHistoryModal] = useState<{ section: RuleSection; history: RuleHistory[]; diffIndex: number | null } | null>(null);

  // Precedent modal
  const [precModal, setPrecModal] = useState(false);
  const [precId, setPrecId] = useState('');
  const [precTitle, setPrecTitle] = useState('');
  const [precDesc, setPrecDesc] = useState('');
  const [precSection, setPrecSection] = useState('');
  const [precSeverity, setPrecSeverity] = useState('medium');
  const [precPlayerId, setPrecPlayerId] = useState('');
  const [precPlayerName, setPrecPlayerName] = useState('');
  const [precMatch, setPrecMatch] = useState('');
  const [precStrikeType, setPrecStrikeType] = useState('');
  const [precResolution, setPrecResolution] = useState('');
  const [precQuery, setPrecQuery] = useState('');
  const [deletePrecId, setDeletePrecId] = useState<string | null>(null);

  const loadAdminNames = useCallback(async (ids: string[]) => {
    const toFetch = ids.filter((id) => id && !adminNames[id]);
    if (toFetch.length === 0) return;
    try {
      const { data } = await publicDb.from('admin_users').select('id, display_name, role').in('id', [...new Set(toFetch)]);
      const map: Record<string, string> = { ...adminNames };
      ((data as AdminName[]) || []).forEach((a) => { map[a.id] = a.display_name || a.role || 'Admin'; });
      setAdminNames(map);
    } catch { /* nombres opcionales */ }
  }, [adminNames]);

  const loadSections = useCallback(async () => {
    setError('');
    try {
      const { data, error: sErr } = await publicDb.from('rule_sections').select('*').order('order_index');
      if (sErr) throw sErr;
      setSections((data as RuleSection[]) || []);
    } catch (e: any) {
      setError(e.message || 'Error cargando secciones');
      setSections([]);
    }
  }, []);

  const loadMatches = useCallback(async () => {
    try {
      const { data } = await publicDb.from('matches').select('id, name, match_type').order('created_at', { ascending: false });
      setMatches((data as MatchOpt[]) || []);
    } catch { /* opcional */ }
  }, []);

  const loadPrecedents = useCallback(async () => {
    try {
      let data: Precedent[] | null = null;
      const full = await publicDb.from('rule_precedents')
        .select('*, players(current_username), matches(name)')
        .order('created_at', { ascending: false });
      if (full.error) {
        const basic = await publicDb.from('rule_precedents').select('*').order('created_at', { ascending: false });
        if (basic.error) throw basic.error;
        data = (basic.data as Precedent[]) || [];
      } else {
        data = (full.data as Precedent[]) || [];
      }
      setPrecedents(data);
      loadAdminNames(data.map((p) => p.created_by).filter((x): x is string => !!x));
    } catch (e: any) {
      setError(e.message || 'Error cargando precedentes');
      setPrecedents([]);
    }
  }, [loadAdminNames]);

  useEffect(() => {
    loadSections();
    loadMatches();
    loadPrecedents();
  }, [loadSections, loadMatches, loadPrecedents]);

  const sortedSections = useMemo(() => sortSectionsHierarchical(sections || []), [sections]);

  function findSectionByNumber(num: string): RuleSection | undefined {
    return (sections || []).find((s) => String(s.section_number) === num);
  }

  function openSectionModal(s?: RuleSection) {
    setSecId(s?.id || '');
    setSecTitle(s?.title || '');
    setSecContent(s?.content || '');
    setSecVisibility(s?.visibility || 'public');
    setSecNumber(s?.section_number || String((s?.order_index ?? -1) + 1));
    setSecParent(s?.parent_id || '');
    if (!s) {
      // Siguiente número de sección top-level
      const top = (sections || []).filter((x) => String(x.section_number || '').indexOf('.') === -1);
      let maxTop = 0;
      top.forEach((x) => {
        const n = parseInt(String(x.section_number || x.order_index || 0));
        if (!isNaN(n) && n > maxTop) maxTop = n;
      });
      setSecNumber(String(maxTop + 1));
    }
    setSecModal(true);
  }

  async function saveSection() {
    const title = secTitle.trim();
    const content = secContent.trim();
    if (!title || !content) { setError('Título y contenido son obligatorios'); return; }
    if (!secNumber) { setError('Número de sección es obligatorio'); return; }
    if (!validateSectionNumber(secNumber)) { setError('Formato inválido. Use: 1, 1.1, 2.3.4'); return; }

    setSaving(true);
    try {
      let parentId = secParent || null;
      if (!parentId && secNumber.indexOf('.') !== -1) {
        const parentParts = secNumber.split('.');
        parentParts.pop();
        const parentNumber = parentParts.join('.');
        const parent = findSectionByNumber(parentNumber);
        if (parent) {
          parentId = parent.id;
        } else {
          setError('Sección padre "' + parentNumber + '" no encontrada. Créala primero o selecciona un padre manualmente.');
          return;
        }
      }
      const order = parseInt(secNumber.split('.')[0]) || 0;

      if (secId) {
        const old = (sections || []).find((s) => s.id === secId);
        if (old) {
          // Guardar historial antes de actualizar
          try {
            const { data: sessData } = await publicDb.auth.getSession();
            await publicDb.from('rule_section_history').insert({
              section_id: secId,
              title: old.title,
              content: old.content,
              changed_by: sessData.session?.user.id || null,
            });
          } catch (hErr) { console.error('[RulesEditor] saveHistoryBeforeUpdate:', hErr); }
        }
        const { error: uErr } = await publicDb.from('rule_sections').update({
          title, content, visibility: secVisibility, section_number: secNumber, parent_id: parentId, order_index: order,
        }).eq('id', secId);
        if (uErr) throw uErr;
      } else {
        const { error: iErr } = await publicDb.from('rule_sections').insert({
          title, content, visibility: secVisibility, section_number: secNumber, parent_id: parentId, order_index: order, is_active: true,
        });
        if (iErr) throw iErr;
      }
      setSecModal(false);
      await loadSections();
    } catch (e: any) {
      setError(e.message || 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function toggleSection(s: RuleSection) {
    const { error } = await publicDb.from('rule_sections').update({ is_active: !(s.is_active !== false) }).eq('id', s.id);
    if (error) { setError(error.message); return; }
    await loadSections();
  }

  async function openHistory(s: RuleSection) {
    try {
      const { data, error: hErr } = await publicDb.from('rule_section_history')
        .select('*').eq('section_id', s.id).order('changed_at', { ascending: false });
      if (hErr) throw hErr;
      const history = (data as RuleHistory[]) || [];
      loadAdminNames(history.map((h) => h.changed_by).filter((x): x is string => !!x));
      setHistoryModal({ section: s, history, diffIndex: null });
    } catch (e: any) {
      setError(e.message || 'Error cargando historial');
    }
  }

  function restoreVersion(h: RuleHistory) {
    setSecTitle(h.title || '');
    setSecContent(h.content || '');
    setHistoryModal(null);
  }

  async function resolvePlayerName() {
    const pid = precPlayerId.trim();
    if (!pid) { setPrecPlayerName(''); return; }
    try {
      const { data } = await publicDb.from('players').select('current_username').eq('id', pid).maybeSingle();
      setPrecPlayerName(data ? '✅ ' + (data as { current_username: string }).current_username : 'Jugador no encontrado');
    } catch {
      setPrecPlayerName('Error buscando jugador');
    }
  }

  function openPrecedentModal(p?: Precedent) {
    setPrecId(p?.id || '');
    setPrecTitle(p?.title || '');
    setPrecDesc(p?.description || '');
    setPrecSection(p?.rule_section_id || '');
    setPrecSeverity(p?.severity || 'medium');
    setPrecPlayerId(p?.player_id ? String(p.player_id) : '');
    setPrecPlayerName('');
    setPrecMatch(p?.match_id || '');
    setPrecStrikeType(p?.strike_type || '');
    setPrecResolution(p?.resolution || '');
    setPrecModal(true);
    if (p?.player_id) setTimeout(resolvePlayerName, 0);
  }

  async function savePrecedent() {
    if (!precTitle.trim() || !precDesc.trim() || !precSection || !precSeverity) {
      setError('Título, descripción, sección y severidad son obligatorios');
      return;
    }
    if (precId && !isSuperAdmin) {
      setError('Solo el superadmin puede editar precedentes');
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        title: precTitle.trim(),
        description: precDesc.trim(),
        rule_section_id: precSection,
        severity: precSeverity,
        player_id: precPlayerId.trim() ? parseInt(precPlayerId.trim()) : null,
        match_id: precMatch || null,
        strike_type: precStrikeType.trim() || null,
        resolution: precResolution.trim() || null,
      };
      if (precId) {
        const { error: uErr } = await publicDb.from('rule_precedents').update(payload).eq('id', precId);
        if (uErr) throw uErr;
      } else {
        payload.created_by = admin?.id || null;
        const { error: iErr } = await publicDb.from('rule_precedents').insert(payload);
        if (iErr) throw iErr;
      }
      setPrecModal(false);
      await loadPrecedents();
    } catch (e: any) {
      setError(e.message || 'Error guardando precedente');
    }
  }

  async function confirmDeletePrecedent() {
    if (!deletePrecId) return;
    const { error } = await publicDb.from('rule_precedents').delete().eq('id', deletePrecId);
    if (error) { setError(error.message); return; }
    setDeletePrecId(null);
    await loadPrecedents();
  }

  const filteredPrecedents = useMemo(() => {
    const q = precQuery.toLowerCase().trim();
    if (!q) return precedents || [];
    return (precedents || []).filter((p) =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.strike_type || '').toLowerCase().includes(q) ||
      (p.resolution || '').toLowerCase().includes(q),
    );
  }, [precedents, precQuery]);

  const sectionMap = useMemo(() => Object.fromEntries((sections || []).map((s) => [s.id, s])), [sections]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Editor de Reglas</h1>
          <p style={{ color: colors.muted, margin: 0 }}>Secciones del reglamento, historial de versiones y precedentes</p>
        </div>
        <Button onClick={() => (tab === 'sections' ? openSectionModal() : openPrecedentModal())}>
          {tab === 'sections' ? '+ Nueva Sección' : '+ Nuevo Precedente'}
        </Button>
      </div>

      {error && <div style={{ color: colors.danger, margin: '12px 0' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 24, margin: '20px 0', borderBottom: `1px solid ${colors.border}` }}>
        <button onClick={() => setTab('sections')} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'sections' ? colors.accent : 'transparent'}`, color: tab === 'sections' ? colors.accent : colors.muted, padding: '0 0 10px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>📜 Secciones</button>
        <button onClick={() => setTab('precedents')} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'precedents' ? colors.accent : 'transparent'}`, color: tab === 'precedents' ? colors.accent : colors.muted, padding: '0 0 10px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>⚖️ Precedentes</button>
      </div>

      {tab === 'sections' ? (
        sections === null ? <Loader /> : sortedSections.length === 0 ? (
          <EmptyState message="No hay secciones. Crea la primera." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, color: colors.muted, margin: '0 0 8px' }}>Para reordenar secciones, ajusta su número de sección.</p>
            {sortedSections.map((s) => {
              const level = getSectionLevel(s.section_number);
              const indentPx = (level - 1) * 20;
              const num = s.section_number || String(s.order_index + 1);
              const vis = VIS_META[s.visibility || 'public'] || VIS_META.public;
              const levelColor = level === 1 ? '#3b82f6' : level === 2 ? '#10b981' : level === 3 ? '#f59e0b' : colors.muted;
              const inactive = s.is_active === false;
              return (
                <div key={s.id} style={{ ...cardStyle, marginLeft: indentPx, borderLeft: `3px solid ${levelColor}`, opacity: inactive ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: 15 }}>{num}. {s.title}</h3>
                        <Badge label={vis.label} tone={s.visibility === 'officials_only' ? 'warning' : s.visibility === 'training' ? 'global' : 'active'} />
                        {inactive && <Badge label="INACTIVA" tone="danger" />}
                      </div>
                      <p style={{ fontSize: 13, color: colors.muted, margin: '6px 0 0' }}>
                        {(s.content || '').substring(0, 140)}{(s.content || '').length > 140 ? '…' : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <Button variant="ghost" style={{ fontSize: 12 }} onClick={() => openSectionModal(s)}>Editar</Button>
                      <Button variant="ghost" style={{ fontSize: 12 }} onClick={() => toggleSection(s)}>{inactive ? 'Activar' : 'Desactivar'}</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <>
          <Input placeholder="Filtrar precedentes…" value={precQuery} onChange={(e) => setPrecQuery(e.target.value)} style={{ width: '100%', maxWidth: 360, marginBottom: 16 }} />
          {precedents === null ? <Loader /> : filteredPrecedents.length === 0 ? (
            <EmptyState message="No hay precedentes registrados." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredPrecedents.map((p) => {
                const sev = SEV_META[p.severity || 'medium'] || SEV_META.medium;
                const sectionName = p.rule_section_id && sectionMap[p.rule_section_id] ? sectionMap[p.rule_section_id].title : null;
                const playerName = p.player_id ? (p.players?.current_username || 'ID:' + p.player_id) : '';
                const matchName = p.match_id ? (p.matches?.name || 'ID: ' + p.match_id) : '';
                const creatorName = p.created_by ? (adminNames[p.created_by] || 'Admin') : 'Sistema';
                return (
                  <div key={p.id} style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                          <h4 style={{ margin: 0, fontSize: 14, color: colors.accent }}>⚖️ {p.title}</h4>
                          <span style={{ background: sev.color + '20', color: sev.color, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{sev.label}</span>
                          {sectionName && <Badge label={sectionName} tone="global" />}
                        </div>
                        <p style={{ fontSize: 13, margin: '0 0 8px' }}>{p.description}</p>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: colors.muted }}>
                          {playerName && <span>👤 {playerName}</span>}
                          {matchName && <span>🎮 {matchName}</span>}
                          {p.strike_type && <span style={{ color: colors.accent }}>⚡ {p.strike_type}</span>}
                        </div>
                        {p.resolution && <p style={{ fontSize: 12, color: colors.success, margin: '8px 0 0' }}><strong>Resolución:</strong> {p.resolution}</p>}
                        <p style={{ fontSize: 12, color: colors.muted, margin: '8px 0 0' }}>Por {creatorName} · {formatDate(p.created_at)}</p>
                      </div>
                      {isSuperAdmin && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <Button variant="ghost" style={{ fontSize: 12 }} onClick={() => openPrecedentModal(p)}>Editar</Button>
                          <Button variant="danger" style={{ fontSize: 12 }} onClick={() => setDeletePrecId(p.id)}>Eliminar</Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal sección */}
      {secModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{secId ? 'Editar Sección' : 'Nueva Sección'}</h3>
            <label style={labelStyle}>Título *</label>
            <Input value={secTitle} onChange={(e) => setSecTitle(e.target.value)} style={inputStyle} />
            <label style={labelStyle}>Contenido *</label>
            <TextArea value={secContent} onChange={(e) => setSecContent(e.target.value)} rows={6} style={inputStyle} />
            <label style={labelStyle}>Visibilidad</label>
            <Select value={secVisibility} onChange={(e) => setSecVisibility(e.target.value)} style={inputStyle}>
              <option value="public">Pública</option>
              <option value="officials_only">Solo oficiales</option>
              <option value="training">Capacitación</option>
            </Select>
            <label style={labelStyle}>Número de sección * (ej: 1, 1.1, 2.3.4)</label>
            <Input value={secNumber} onChange={(e) => setSecNumber(e.target.value)} style={inputStyle} />
            <label style={labelStyle}>Sección padre</label>
            <Select value={secParent} onChange={(e) => setSecParent(e.target.value)} style={inputStyle}>
              <option value="">-- Sin padre (sección principal) --</option>
              {sortedSections.filter((s) => s.id !== secId).map((s) => (
                <option key={s.id} value={s.id}>{s.section_number || s.order_index + 1}. {s.title}</option>
              ))}
            </Select>
            {secId && (
              <div style={{ marginBottom: 12 }}>
                <Button variant="ghost" style={{ fontSize: 12 }} onClick={() => {
                  const s = (sections || []).find((x) => x.id === secId);
                  if (s) { setSecModal(false); openHistory(s); }
                }}>Ver historial</Button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={saveSection} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
              <Button variant="ghost" onClick={() => setSecModal(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal historial */}
      {historyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Historial: {historyModal.section.title}</h3>
            {historyModal.history.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.muted }}>No hay versiones anteriores.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historyModal.history.map((h, i) => (
                  <div key={h.id} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13 }}>
                      <strong>{h.title}</strong>
                      <p style={{ fontSize: 12, color: colors.muted, margin: '4px 0 0' }}>
                        {formatDateTime(h.changed_at)} · {h.changed_by ? (adminNames[h.changed_by] || 'Admin') : 'Admin'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" style={{ fontSize: 12 }} onClick={() => setHistoryModal({ ...historyModal, diffIndex: historyModal.diffIndex === i ? null : i })}>Ver diff</Button>
                      <Button style={{ fontSize: 12 }} onClick={() => restoreVersion(h)}>Restaurar</Button>
                    </div>
                  </div>
                ))}
                {historyModal.diffIndex !== null && historyModal.history[historyModal.diffIndex] && (() => {
                  const h = historyModal.history[historyModal.diffIndex];
                  const currentText = historyModal.section.title + '\n' + historyModal.section.content;
                  const oldText = (h.title || '') + '\n' + (h.content || '');
                  const same = oldText === currentText;
                  const removedLines = oldText.split('\n').filter((l) => !currentText.split('\n').includes(l));
                  const addedLines = currentText.split('\n').filter((l) => !oldText.split('\n').includes(l));
                  return (
                    <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Diff vs versión actual</p>
                      {same ? <p style={{ fontSize: 13, color: colors.muted }}>Sin cambios.</p> : (
                        <>
                          {removedLines.length > 0 && (
                            <>
                              <p style={{ fontSize: 11, fontWeight: 700, color: colors.danger, margin: '0 0 4px' }}>Eliminado:</p>
                              {removedLines.map((l, li) => (
                                <div key={li} style={{ fontSize: 13, padding: '2px 8px', marginBottom: 2, borderRadius: 4, background: 'rgba(198,40,40,0.1)', color: '#c62828', textDecoration: 'line-through' }}>- {l}</div>
                              ))}
                            </>
                          )}
                          {addedLines.length > 0 && (
                            <>
                              <p style={{ fontSize: 11, fontWeight: 700, color: colors.success, margin: '8px 0 4px' }}>Añadido:</p>
                              {addedLines.map((l, li) => (
                                <div key={li} style={{ fontSize: 13, padding: '2px 8px', marginBottom: 2, borderRadius: 4, background: 'rgba(76,175,80,0.1)', color: '#2e7d32' }}>+ {l}</div>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setHistoryModal(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal precedente */}
      {precModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{precId ? 'Editar Precedente' : 'Nuevo Precedente'}</h3>
            <label style={labelStyle}>Título *</label>
            <Input value={precTitle} onChange={(e) => setPrecTitle(e.target.value)} style={inputStyle} />
            <label style={labelStyle}>Descripción *</label>
            <TextArea value={precDesc} onChange={(e) => setPrecDesc(e.target.value)} rows={3} style={inputStyle} />
            <label style={labelStyle}>Sección de regla *</label>
            <Select value={precSection} onChange={(e) => setPrecSection(e.target.value)} style={inputStyle}>
              <option value="">Seleccionar…</option>
              {sortedSections.map((s) => <option key={s.id} value={s.id}>{s.section_number || s.order_index + 1}. {s.title}</option>)}
            </Select>
            <label style={labelStyle}>Severidad *</label>
            <Select value={precSeverity} onChange={(e) => setPrecSeverity(e.target.value)} style={inputStyle}>
              <option value="low">Leve</option>
              <option value="medium">Medio</option>
              <option value="high">Alto</option>
            </Select>
            <label style={labelStyle}>ID del jugador (opcional)</label>
            <Input
              value={precPlayerId}
              onChange={(e) => setPrecPlayerId(e.target.value)}
              onBlur={resolvePlayerName}
              style={inputStyle}
            />
            {precPlayerName && (
              <p style={{ fontSize: 12, color: precPlayerName.startsWith('✅') ? colors.success : colors.danger, margin: '-6px 0 10px' }}>{precPlayerName}</p>
            )}
            <label style={labelStyle}>Partida (opcional)</label>
            <Select value={precMatch} onChange={(e) => setPrecMatch(e.target.value)} style={inputStyle}>
              <option value="">Ninguna</option>
              {matches.map((m) => <option key={m.id} value={m.id}>{m.name || 'Partida sin nombre'} [{m.match_type || '-'}]</option>)}
            </Select>
            <label style={labelStyle}>Tipo de strike (opcional)</label>
            <Input value={precStrikeType} onChange={(e) => setPrecStrikeType(e.target.value)} style={inputStyle} />
            <label style={labelStyle}>Resolución (opcional)</label>
            <TextArea value={precResolution} onChange={(e) => setPrecResolution(e.target.value)} rows={2} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={savePrecedent}>Guardar</Button>
              <Button variant="ghost" onClick={() => setPrecModal(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar borrado de precedente */}
      {deletePrecId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Eliminar precedente</h3>
            <p style={{ fontSize: 14 }}>¿Seguro que quieres eliminar este precedente? Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="danger" onClick={confirmDeletePrecedent}>Eliminar</Button>
              <Button variant="ghost" onClick={() => setDeletePrecId(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminRulesEditorPage() {
  return (
    <AdminGate staffOnly>
      <RulesEditor />
    </AdminGate>
  );
}
