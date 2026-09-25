/**
 * Badge unificado: tipos de partida, estados, roles.
 * Los colores derivan de theme.colors (unica fuente de verdad).
 */
import { colors } from '../theme';

export const PALETTE: Record<string, { bg: string; color: string }> = {
  global:          { bg: 'rgba(33,150,243,0.15)',  color: colors.info },
  internal_standard:{ bg: 'rgba(255,143,0,0.15)',  color: colors.accent },
  exclusive:       { bg: 'rgba(156,39,176,0.15)', color: colors.purple },
  active:          { bg: 'rgba(76,175,80,0.15)',  color: colors.success },
  pending:         { bg: 'rgba(255,193,7,0.15)',  color: colors.warning },
  danger:          { bg: 'rgba(239,83,80,0.15)',  color: colors.danger },
  purple:          { bg: 'rgba(206,147,216,0.15)', color: colors.purple },
  neutral:         { bg: 'rgba(255,255,255,0.06)', color: colors.muted },
};

export default function Badge({ label, tone = 'neutral' }: { label: string; tone?: string }) {
  const p = PALETTE[tone] ?? PALETTE.neutral;
  return (
    <span style={{
      background: p.bg, color: p.color, padding: '2px 8px', borderRadius: 6,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}
