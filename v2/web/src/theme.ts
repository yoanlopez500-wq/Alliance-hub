/**
 * theme.ts — UNICA fuente de verdad visual del v2.
 * Paleta AllianceHub (fondo #0a0e27, acento #ff8f00, indices) y los
 * estilos base reutilizables. Ninguna pagina deberia redefinir estos
 * valores inline: importar de aqui.
 */
export const colors = {
  bg: '#0a0e27',
  card: '#0d1330',
  cardAlt: '#11183a',
  border: '#1a237e',
  text: '#e8eaf6',
  muted: '#9fa8da',
  accent: '#ff8f00',
  accentGradient: 'linear-gradient(90deg,#ff6f00,#ff8f00)',
  info: '#4fc3f7',
  success: '#81c784',
  danger: '#ef5350',
  warning: '#ffd54f',
  purple: '#ce93d8',
} as const;

export const styles = {
  card: {
    background: colors.cardAlt, border: `1px solid ${colors.border}`,
    borderRadius: 12, padding: 16,
  } as React.CSSProperties,

  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${colors.border}`, background: colors.card,
    color: colors.text, marginBottom: 10, boxSizing: 'border-box',
  } as React.CSSProperties,

  btnPrimary: {
    background: colors.accentGradient, color: '#fff', fontWeight: 700,
    border: 'none', padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
  } as React.CSSProperties,

  btnGhost: {
    background: colors.border, color: colors.text, fontWeight: 600,
    border: 'none', padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
  } as React.CSSProperties,

  rowBetween: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  } as React.CSSProperties,
} as const;
