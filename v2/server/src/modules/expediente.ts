import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase';
import { resolveViewer, canManageAlliance } from '../lib/auth';

/**
 * GET /api/players/:id/expediente
 * Expediente publico de un jugador (mercado de transferencias + perfiles).
 *
 * Reglas de visibilidad (decision del usuario):
 *  - TODOS ven: info publica, partidas, estadisticas, strikes GLOBALES.
 *  - Lider/oficial de alianza X viendo el expediente: ademas ve los strikes
 *    y sanciones de X sobre ese jugador (contexto de transferencia).
 *  - Nadie mas ve sanciones de alianzas ajenas (aislamiento absoluto).
 */
export default async function expedienteRoutes(app: FastifyInstance) {
  app.get('/api/players/:id/expediente', async (req, reply) => {
    const playerId = Number((req.params as { id: string }).id);
    if (!Number.isFinite(playerId)) return reply.code(400).send({ error: 'id invalido' });

    const viewer = await resolveViewer(req);

    const { data: player, error } = await supabase
      .from('players')
      .select('id, current_username, current_alliance_id, created_at')
      .eq('id', playerId)
      .single();
    if (error || !player) return reply.code(404).send({ error: 'jugador no encontrado' });

    // A que alianza pertenece el viewer (para el contexto de transferencia)
    let viewerAlliance: string | null = null;
    if (viewer && viewer.kind === 'admin' && viewer.allianceId) viewerAlliance = viewer.allianceId;
    else if (viewer && viewer.kind === 'player') {
      const { data: mem } = await supabase
        .from('alliance_memberships')
        .select('alliance_id')
        .eq('player_id', viewer.playerId)
        .eq('status', 'approved')
        .limit(1)
        .maybeSingle();
      viewerAlliance = (mem?.alliance_id as string | null) ?? null;
    }
    const staffCtx = viewerAlliance ? await canManageAlliance(viewer, viewerAlliance) : false;

    const [matches, strikesRes, allianceInfo] = await Promise.all([
      supabase
        .from('match_registrations')
        .select('match_id, kills, deaths, matches!inner(id, name, match_type, status)')
        .eq('player_id', playerId),
      // Strikes: globales siempre; de la alianza del viewer solo si es su staff
      supabase
        .from('player_strikes')
        .select('id, reason, severity, strike_type, alliance_id, created_at')
        .eq('player_id', playerId)
        .or(staffCtx && viewerAlliance
          ? `alliance_id.is.null,alliance_id.eq.${viewerAlliance}`
          : 'alliance_id.is.null')
        .order('created_at', { ascending: false }),
      player.current_alliance_id
        ? supabase.from('alliances').select('id, name, tag, profile').eq('id', player.current_alliance_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const registrations = matches.data ?? [];
    const kills = registrations.reduce((s: number, r: any) => s + (r.kills ?? 0), 0);
    const deaths = registrations.reduce((s: number, r: any) => s + (r.deaths ?? 0), 0);

    return {
      player,
      alliance: allianceInfo.data ?? null,
      estadisticas: {
        partidas: registrations.length,
        kills,
        deaths,
        kd: deaths > 0 ? kills / deaths : kills,
      },
      partidas: registrations.map((r: any) => r.matches),
      strikes: strikesRes.data ?? [],
      // La UI decide mostrar el boton Invitar: solo si no tiene alianza
      puede_ser_invitado: !player.current_alliance_id,
    };
  });
}
