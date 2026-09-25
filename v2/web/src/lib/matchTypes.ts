import { useEffect, useState } from 'react';
import { createElement } from 'react';
import { publicDb } from './api';
import Badge from '../components/Badge';

/**
 * Tipos de partida administrables (tabla `match_types`, migracion 20261001).
 * Reemplaza los diccionarios hardcodeados del v1: badge, etiquetas y
 * visibilidad de selects salen de la base de datos.
 *
 * scope:
 *  - 'global'            -> cualquiera puede crear/ver
 *  - 'internal_standard' -> interna estandar (de alianza, medida por AH)
 *  - 'exclusive'         -> interna exclusiva de UNA alianza (alliance_id)
 */
export type MatchType = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  scope: 'global' | 'internal_standard' | 'exclusive';
  alliance_id: string | null;
  order_index: number;
  is_active: boolean;
};

const SCOPE_TONE: Record<MatchType['scope'], string> = {
  global: 'global',
  internal_standard: 'internal_standard',
  exclusive: 'exclusive',
};

let cache: MatchType[] | null = null;
let inflight: Promise<MatchType[]> | null = null;

export function fetchMatchTypes(force = false): Promise<MatchType[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const { data, error } = await publicDb
      .from('match_types')
      .select('id, name, description, color, scope, alliance_id, order_index, is_active')
      .order('order_index');
    if (error) throw new Error(error.message);
    cache = (data ?? []) as MatchType[];
    return cache;
  })();
  return inflight;
}

export function invalidateMatchTypes() {
  cache = null;
}

export function useMatchTypes(): { types: MatchType[]; loading: boolean; error: string | null } {
  const [types, setTypes] = useState<MatchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMatchTypes()
      .then((t) => { if (alive) setTypes(t); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return { types, loading, error };
}

export function typeById(types: MatchType[], id: string | null | undefined): MatchType | undefined {
  if (!id) return undefined;
  return types.find((t) => t.id === id);
}

/** IDs de tipos internos ya resueltos (con cache). Para usar dentro de queries async. */
export async function internalTypeIdsCached(): Promise<string[]> {
  return internalTypeIds(await fetchMatchTypes());
}

/**
 * Filtro PostgREST listo para `.not(col, 'in', valor)`:
 * supabase-js NO envuelve entre parentesis los arrays en `.not(...,'in',ids)`
 * (genera `not.in.a,b` => 400). Este helper devuelve el valor crudo
 * `("a","b")` que PostgREST si entiende.
 */
export function notInValue(ids: string[]): string {
  return `(${ids.map((id) => `"${id}"`).join(',')})`;
}

/**
 * IDs de tipos "internos" (internal_standard + exclusive + legacy 'internal'):
 * las queries de ranking global deben excluirlos TODOS, no solo 'internal'.
 */
export function internalTypeIds(types: MatchType[]): string[] {
  const ids = types
    .filter((t) => t.scope !== 'global')
    .map((t) => t.id);
  if (!ids.includes('internal')) ids.push('internal');
  return ids;
}

/**
 * Tipos que un creador de partida puede elegir:
 * globales + standard para todos; exclusivas solo para su alianza dueña.
 */
export function selectableTypes(types: MatchType[], viewerAllianceId: string | null): MatchType[] {
  return types.filter((t) =>
    t.is_active &&
    (t.scope !== 'exclusive' || (viewerAllianceId && t.alliance_id === viewerAllianceId))
  );
}

/** Badge visual de un tipo de partida (lookup, nunca hardcode). */
export function MatchTypeBadge({ typeId }: { typeId: string | null | undefined }) {
  const { types, loading } = useMatchTypes();
  if (!typeId) return null;
  if (loading && types.length === 0) {
    return createElement('span', { style: { fontSize: 10, color: '#9fa8da' } }, typeId);
  }
  const t = typeById(types, typeId);
  const label = t?.name ?? typeId;
  const tone = (t ? SCOPE_TONE[t.scope] : null) ?? 'neutral';
  return createElement(Badge, { label, tone });
}
