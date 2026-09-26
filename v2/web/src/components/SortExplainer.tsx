import { colors, styles } from '../theme';
import { SORT_MODES, sortModeById, type SortMode } from '../lib/ranking';

export type ExplainerMode = {
  id: string;
  label: string;
  explain: string;
  example?: string;
};

/**
 * SortExplainer — panel de transparencia para cualquier vista ordenada.
 * Muestra la explicacion del modo activo y, desplegable, como se calcula cada metrica.
 */
export default function SortExplainer({
  activeId,
  modes = SORT_MODES as unknown as ExplainerMode[],
  priors,
  note,
}: {
  activeId: SortMode | string;
  modes?: ExplainerMode[];
  priors?: { priorK: number; priorD: number; C: number } | null;
  note?: string;
}) {
  const active = modes.find((m) => m.id === activeId) ?? sortModeById(activeId) ?? null;
  const bayes = sortModeById('score');

  return (
    <div style={{ ...styles.card, marginBottom: 12, fontSize: 13, color: colors.muted, lineHeight: 1.6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>ⓘ</span>
        <div style={{ flex: 1, minWidth: 240 }}>
          {active ? (
            <>
              <strong style={{ color: colors.accent }}>{active.label}:</strong>{' '}
              {active.explain}
              {active.example && <div style={{ marginTop: 6 }}>{active.example}</div>}
            </>
          ) : (
            <>Modo de orden no reconocido.</>
          )}
          {activeId === 'score' && priors && (
            <div style={{ marginTop: 6, color: colors.info }}>
              Priors actuales: priorK={priors.priorK.toFixed(2)}, priorD={priors.priorD.toFixed(2)}, C={priors.C}.
            </div>
          )}
          {activeId === 'score' && !priors && bayes && (
            <div style={{ marginTop: 6 }}>{bayes.example}</div>
          )}
          {note && <div style={{ marginTop: 6, color: colors.warning }}>{note}</div>}
        </div>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', color: colors.text, fontWeight: 700 }}>
          Como se calcula cada metrica
        </summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {(modes.length ? modes : (SORT_MODES as unknown as ExplainerMode[])).map((m) => (
            <div key={m.id} style={{ background: colors.bg, borderRadius: 8, padding: 10 }}>
              <strong style={{ color: m.id === activeId ? colors.accent : colors.text }}>{m.label}</strong>
              <div>{m.explain}</div>
              {m.example && <div style={{ marginTop: 4, color: colors.text }}>{m.example}</div>}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
