/**
 * Badge unificado: tipos de partida, estados, roles.
 * En el v1 esto era un diccionario hardcodeado en base.js por cada tipo;
 * aqui el color viene de match_types (DB) o del mapa de fallback.
 */
export const PALETTE: Record<string, string> = {
  global: 'rgba(33,150,243,0.15);color:#4fc3f7',
  internal_standard: 'rgba(255,143,0,0.15);color:#ff8f00',
  exclusive: 'rgba(156,39,176,0.15);color:#ce93d8',
  active: 'rgba(76,175,80,0.15);color:#81c784',
  pending: 'rgba(255,193,7,0.15);color:#ffd54f',
  danger: 'rgba(239,83,80,0.15);color:#ef5350',
  neutral: 'rgba(255,255,255,0.06);color:#9fa8da',
};

export default function Badge({ label, tone = 'neutral' }: { label: string; tone?: string }) {
  const style = PALETTE[tone] ?? PALETTE.neutral;
  const [bg, color] = style.split(';');
  return (
    <span style={{
      background: bg, color, padding: '2px 8px', borderRadius: 6,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}
