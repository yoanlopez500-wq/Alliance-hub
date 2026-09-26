import { publicDb } from './api';

/** Tipo de fila de player_notes (notas internas, append-only). */
export interface PlayerNote {
  id: string;
  player_id: number;
  alliance_id: string | null;
  body: string;
  author_name: string;
  author_role: string;
  created_at: string;
}

/** Notas de un jugador visibles para el usuario actual (RLS filtra el alcance). */
export async function fetchPlayerNotes(playerId: number): Promise<PlayerNote[]> {
  const { data, error } = await publicDb
    .from('player_notes')
    .select('id, player_id, alliance_id, body, author_name, author_role, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlayerNote[];
}

/**
 * Crea una nota. allianceId = null -> nota de staff (solo admins activos,
 * la valida RLS); allianceId = uuid -> nota privada de esa alianza (solo
 * si el autor es lider/oficial y el jugador es miembro aprobado). RLS
 * rechaza cualquier otro caso: aqui solo propagamos el error.
 */
export async function createPlayerNote(opts: {
  playerId: number;
  allianceId: string | null;
  body: string;
  authorName: string;
  authorRole: string;
}): Promise<void> {
  const { error } = await publicDb.from('player_notes').insert({
    player_id: opts.playerId,
    alliance_id: opts.allianceId,
    body: opts.body.trim(),
    author_name: opts.authorName,
    author_role: opts.authorRole,
  });
  if (error) throw error;
}

/** Rótulo corto del ámbito para la cabecera de la nota. */
export function noteScopeLabel(allianceId: string | null): string {
  return allianceId ? '🔒 Nota de alianza' : '🛡️ Nota de staff';
}
