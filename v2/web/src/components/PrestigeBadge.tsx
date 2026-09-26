import { colors } from '../theme';
import {
  formulaToText,
  prestigeColor,
  PRESTIGE_RARITY,
  type PrestigeDefinition,
} from '../lib/prestige';

/** Insignia de prestigio con color de rareza y tooltip de como ganarla. */
export default function PrestigeBadge({
  prestige,
  size = 'md',
  principal = false,
}: {
  prestige: PrestigeDefinition;
  size?: 'sm' | 'md';
  principal?: boolean;
}) {
  const color = prestigeColor(prestige);
  const rarity = PRESTIGE_RARITY[prestige.rarity]?.label ?? prestige.rarity;
  const pad = size === 'sm' ? '4px 8px' : '6px 10px';
  const fontSize = size === 'sm' ? 11 : 12;
  const iconSize = size === 'sm' ? 13 : 15;
  return (
    <span
      title={`${prestige.name} (${rarity}) — ${formulaToText(prestige.formula)}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: pad,
        borderRadius: 999,
        fontSize,
        fontWeight: 700,
        color,
        background: `${color}18`,
        border: `1px solid ${color}${principal ? '' : '66'}`,
        boxShadow: principal ? `0 0 0 1px ${color}, 0 0 14px ${color}44` : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: iconSize }}>{prestige.icon}</span>
      <span>{prestige.name}</span>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted }}>
        {prestige.scope === 'platform' ? '⚜' : '🛡'}
      </span>
    </span>
  );
}

export function PrestigeBadgeList({
  prestiges,
  empty = 'Sin prestigios desbloqueados',
}: {
  prestiges: PrestigeDefinition[] | null | undefined;
  empty?: string;
}) {
  if (!prestiges || prestiges.length === 0) {
    return <span style={{ color: colors.muted, fontSize: 13 }}>{empty}</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {prestiges.map((p, idx) => <PrestigeBadge key={p.id} prestige={p} principal={idx === 0} />)}
    </div>
  );
}
