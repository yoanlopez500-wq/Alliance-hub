import { useSearchParams } from 'react-router-dom';
import { colors } from '../theme';

export interface SecTab { id: string; label: string }

/**
 * SectionTabs — barra de pestanas que vive sincronizada con ?tab= de la URL.
 * Permite que rutas viejas redirijan directo a una pestana concreta
 * (ej. /admin/strikes -> /admin/conducta?tab=strikes).
 */
export function useTabParam(valid: string[]): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const active = valid.includes(raw) ? raw : valid[0];
  const setTab = (id: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', id);
      return next;
    }, { replace: true });
  };
  return [active, setTab];
}

export default function SectionTabs({ tabs, active, onChange }: {
  tabs: SecTab[]; active: string; onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${colors.border}`, marginBottom: 16, overflowX: 'auto' }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
          fontWeight: 700, fontSize: 14, minWidth: 90,
          color: active === t.id ? colors.accent : colors.muted,
          borderBottom: active === t.id ? `2px solid ${colors.accent}` : '2px solid transparent',
        }}>{t.label}</button>
      ))}
    </div>
  );
}
