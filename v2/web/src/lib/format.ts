/** format.ts — utilidades de formato compartidas (puerto de base.js). */

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export type MatchStatus = 'open' | 'in_progress' | 'finished' | string;

export const STATUS_LABELS: Record<string, string> = {
  open: 'ABIERTA',
  in_progress: 'EN CURSO',
  finished: 'FINALIZADA',
  draft: 'BORRADOR',
};

export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: 'rgba(76,175,80,0.15)', color: '#81c784' },
  in_progress: { bg: 'rgba(33,150,243,0.15)', color: '#4fc3f7' },
  finished: { bg: 'rgba(156,39,176,0.15)', color: '#ce93d8' },
};

export function badgeStyle(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 };
}

export const TYPE_LABELS: Record<string, string> = {
  duel: 'DUELO',
  internal: 'INTERNA',
};

export function compareSectionNumber(a: { section_number?: string | null; order_index?: number }, b: { section_number?: string | null; order_index?: number }): number {
  const partsA = String(a.section_number ?? a.order_index ?? '0').split('.').map(Number);
  const partsB = String(b.section_number ?? b.order_index ?? '0').split('.').map(Number);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const valA = partsA[i] || 0;
    const valB = partsB[i] || 0;
    if (valA !== valB) return valA - valB;
  }
  return 0;
}
