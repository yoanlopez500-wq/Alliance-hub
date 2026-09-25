import { useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { useVisibilityRole, canSeeRuleSection } from '../../lib/playerSession';
import { compareSectionNumber } from '../../lib/format';
import { colors, styles } from '../../theme';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';

interface RuleSection {
  id: number;
  title: string;
  content: string | null;
  section_number: string | null;
  order_index: number;
  parent_id: number | null;
  severity: string | null;
  visibility: string | null;
  is_active: boolean;
}

interface Precedent {
  id: number;
  title: string;
  description: string | null;
  sanction: string | null;
  severity: string | null;
  rule_section_id: number | null;
  created_at: string;
}

const SEV: Record<string, { label: string; color: string }> = {
  high: { label: 'GRAVE', color: colors.danger },
  medium: { label: 'MEDIO', color: colors.warning },
  low: { label: 'LEVE', color: colors.info },
  minor: { label: 'LEVE', color: colors.info },
};

function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  const s = SEV[severity || 'low'] || SEV.low;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${s.color}22`, color: s.color, flexShrink: 0 }}>{s.label}</span>;
}

/** RulesPage — puerto de rules.js: reglamento jerarquico + precedentes. */
export default function RulesPage() {
  const role = useVisibilityRole();
  const [sections, setSections] = useState<RuleSection[] | null>(null);
  const [precedents, setPrecedents] = useState<Precedent[] | null>(null);
  const [showPrecedents, setShowPrecedents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await publicDb.from('rule_sections').select('*').is('alliance_id', null).order('order_index');
        if (err) { setError('Error cargando reglamento: ' + err.message); setSections([]); return; }
        const visible = ((data as RuleSection[]) || [])
          .filter((s2) => canSeeRuleSection(role, s2.visibility))
          .sort(compareSectionNumber);
        setSections(visible);
      } catch (e: any) { setError('Error cargando reglamento: ' + (e?.message ?? e)); setSections([]); }
    })();
  }, [role]);

  useEffect(() => {
    if (!showPrecedents || precedents !== null) return;
    (async () => {
      try {
        const { data } = await publicDb.from('rule_precedents').select('*').order('created_at', { ascending: false });
        setPrecedents((data as Precedent[]) ?? []);
      } catch (e) { console.error('[Precedents]', e); setPrecedents([]); }
    })();
  }, [showPrecedents, precedents]);

  function renderSection(s: RuleSection, level: number): React.ReactNode {
    const children = sections!.filter((c) => c.parent_id === s.id).sort(compareSectionNumber);
    const num = s.section_number || String(s.order_index + 1);
    return (
      <div key={s.id}>
        <div id={`section-${s.id}`} style={{
          ...styles.card,
          marginLeft: level > 0 ? Math.min(level * 24, 72) : 0,
          marginBottom: 10,
          borderLeft: level > 0 ? `3px solid ${colors.border}` : undefined,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 14, color: colors.accent }}>{num}. {s.title}</h3>
              {s.content && <p style={{ margin: 0, fontSize: 13, color: colors.text, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{s.content}</p>}
            </div>
            <SeverityBadge severity={s.severity} />
          </div>
        </div>
        {children.map((c) => renderSection(c, level + 1))}
      </div>
    );
  }

  const byId: Record<number, RuleSection> = {};
  (sections || []).forEach((s) => { byId[s.id] = s; });
  const roots = (sections || []).filter((s) => !s.parent_id || !byId[s.parent_id]).sort(compareSectionNumber);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <Reveal>
        <h1 style={{ color: colors.text }}>📜 Reglamento</h1>
        <p style={{ color: colors.muted, fontSize: 13 }}>Reglas oficiales de Alliance Hub. El incumplimiento puede derivar en strikes, penalizaciones o expulsion.</p>
        {error && <p style={{ color: colors.danger }}>{error}</p>}
        {!sections ? <Loader /> : sections.length === 0 ? (
          <p style={{ color: colors.muted, textAlign: 'center', padding: '24px 0' }}>No hay reglas configuradas.</p>
        ) : (
          <div>{roots.map((s) => renderSection(s, 0))}</div>
        )}
      </Reveal>

      <Reveal>
        <button onClick={() => setShowPrecedents((v) => !v)} style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          ...styles.card, cursor: 'pointer', marginTop: 20, border: `1px solid ${colors.border}`,
        }}>
          <strong style={{ color: colors.accent, fontSize: 14 }}>⚖️ Ver precedentes y jurisprudencia</strong>
          <span style={{ color: colors.muted, fontSize: 12 }}>{showPrecedents ? '▲' : '▼'}</span>
        </button>
        {showPrecedents && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
            {precedents === null ? <Loader /> : precedents.length === 0 ? (
              <p style={{ color: colors.muted, gridColumn: '1 / -1', textAlign: 'center' }}>No hay precedentes registrados aun.</p>
            ) : precedents.map((p) => {
              const sec = p.rule_section_id ? byId[p.rule_section_id] : null;
              return (
                <div key={p.id} id={`precedent-${p.id}`} style={styles.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <h4 style={{ margin: 0, fontSize: 14, color: colors.accent }}>{p.title}</h4>
                    <SeverityBadge severity={p.severity} />
                  </div>
                  {p.description && <p style={{ margin: '0 0 8px', fontSize: 12, color: colors.text, lineHeight: 1.5 }}>{p.description}</p>}
                  {p.sanction && (
                    <p style={{ margin: '0 0 8px', fontSize: 11, display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: `${SEV[p.severity || 'low']?.color ?? colors.info}22`, color: SEV[p.severity || 'low']?.color ?? colors.info }}>
                      Sancion: {p.sanction}
                    </p>
                  )}
                  <div>
                    {sec ? (
                      <a href={`#section-${sec.id}`} style={{ fontSize: 11, color: colors.accent, textDecoration: 'underline' }}>
                        {sec.section_number || ''} {sec.title}
                      </a>
                    ) : <span style={{ fontSize: 11, color: colors.muted }}>Sin seccion asignada</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Reveal>
    </div>
  );
}
