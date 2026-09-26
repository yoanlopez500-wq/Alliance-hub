export type PrestigeScope = 'platform' | 'alliance';
export type PrestigeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type PrestigeCondition = {
  metric: string;
  op: '>=' | '<=' | '>' | '<' | '=' | '==' | '!=' | '<>';
  value: number;
};

export type PrestigeFormula = {
  all?: PrestigeCondition[];
  any?: PrestigeCondition[];
} & Partial<PrestigeCondition>;

export type PrestigeDefinition = {
  id: string;
  scope: PrestigeScope;
  alliance_id: string | null;
  name: string;
  description: string;
  icon: string;
  rarity: PrestigeRarity;
  color: string;
  formula: PrestigeFormula;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
};

export const PRESTIGE_RARITY: Record<PrestigeRarity, { label: string; color: string; order: number }> = {
  common: { label: 'Comun', color: '#9fa8da', order: 1 },
  uncommon: { label: 'Poco comun', color: '#81c784', order: 2 },
  rare: { label: 'Rara', color: '#4fc3f7', order: 3 },
  epic: { label: 'Epica', color: '#ce93d8', order: 4 },
  legendary: { label: 'Legendaria', color: '#ffd54f', order: 5 },
};

export const PLAYER_PRESTIGE_METRICS = [
  { id: 'games', label: 'Partidas validas' },
  { id: 'kills', label: 'Bajas' },
  { id: 'deaths', label: 'Muertes' },
  { id: 'kd', label: 'K/D' },
  { id: 'avg_kills', label: 'Bajas por partida' },
  { id: 'power', label: 'AH Power Score' },
  { id: 'bayes_kd', label: 'K/D bayesiano' },
  { id: 'podium_1', label: 'Primeros lugares' },
  { id: 'podium_2', label: 'Segundos lugares' },
  { id: 'podium_3', label: 'Terceros lugares' },
  { id: 'podiums', label: 'Podios totales' },
  { id: 'strikes_active', label: 'Strikes activos' },
] as const;

export const ALLIANCE_PRESTIGE_METRICS = [
  { id: 'official_wins', label: 'Victorias oficiales' },
  { id: 'games_played', label: 'Volumen de partidas' },
  { id: 'top10_avg_bayes_kd', label: 'K/D bayesiano medio top 10' },
  { id: 'active_strikes', label: 'Strikes activos' },
  { id: 'member_podiums', label: 'Podios de miembros' },
] as const;

export const PRESTIGE_OPS: { id: PrestigeCondition['op']; label: string }[] = [
  { id: '>=', label: '>=' },
  { id: '<=', label: '<=' },
  { id: '>', label: '>' },
  { id: '<', label: '<' },
  { id: '=', label: '=' },
  { id: '!=', label: '!=' },
];

export function prestigeColor(p: Pick<PrestigeDefinition, 'rarity' | 'color'>) {
  return PRESTIGE_RARITY[p.rarity]?.color ?? p.color ?? '#9fa8da';
}

export function prestigeRarityOrder(p: Pick<PrestigeDefinition, 'rarity'>) {
  return PRESTIGE_RARITY[p.rarity]?.order ?? 0;
}

export function formulaConditions(formula: PrestigeFormula | null | undefined): PrestigeCondition[] {
  if (!formula) return [];
  if (Array.isArray(formula.all)) return formula.all;
  if (Array.isArray(formula.any)) return formula.any;
  if (formula.metric) return [{ metric: String(formula.metric), op: formula.op ?? '>=', value: Number(formula.value ?? 0) }];
  return [];
}

export function formulaToText(formula: PrestigeFormula | null | undefined): string {
  if (!formula) return 'Sin formula';
  const render = (c: PrestigeCondition) => `${c.metric} ${c.op} ${c.value}`;
  if (Array.isArray(formula.all)) return `Cumplir TODAS: ${formula.all.map(render).join(' | ')}`;
  if (Array.isArray(formula.any)) return `Cumplir AL MENOS UNA: ${formula.any.map(render).join(' | ')}`;
  if (formula.metric) return render({ metric: String(formula.metric), op: formula.op ?? '>=', value: Number(formula.value ?? 0) });
  return 'Formula vacia';
}

export function metricLabel(metric: string, scope: PrestigeScope): string {
  const list = scope === 'platform' ? PLAYER_PRESTIGE_METRICS : ALLIANCE_PRESTIGE_METRICS;
  return list.find((m) => m.id === metric)?.label ?? metric;
}

export function buildFormula(combine: 'all' | 'any', rows: PrestigeCondition[]): PrestigeFormula {
  return { [combine]: rows.map((r) => ({ metric: r.metric, op: r.op, value: Number(r.value) })) };
}
