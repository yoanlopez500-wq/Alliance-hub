import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase';
import { resolveViewer, managedAllianceId, type Viewer } from '../lib/auth';

/**
 * Auth del v2: reutiliza el sistema sellado del v1 (RPCs), sin duplicar logica.
 * - POST /api/auth/player: emite token de jugador (player_login del v1).
 * - GET /api/me: quien soy + que alianza administro (para SancionesPage
 *   y cualquier vista de staff sin depender de variables de entorno).
 */
export default async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/player', async (req, reply) => {
    const { playerId, displayName } = req.body as { playerId?: number; displayName?: string };
    if (!playerId || !displayName) {
      return reply.code(400).send({ error: 'playerId y displayName son obligatorios' });
    }
    const { data: token, error } = await supabase.rpc('player_login', {
      p_player_id: playerId,
      p_display_name: displayName,
    });
    if (error || !token) return reply.code(401).send({ error: 'login rechazado' });
    return { token, playerId };
  });

  app.get('/api/me', async (req, reply) => {
    const viewer = await resolveViewer(req);
    if (!viewer) return reply.code(401).send({ error: 'no autenticado' });

    const base: Record<string, unknown> = { kind: viewer.kind };
    if (viewer.kind === 'admin') {
      base.role = viewer.role;
      base.allianceId = viewer.allianceId;
    } else {
      base.playerId = viewer.playerId;
    }
    // La alianza que este viewer administra (lider o oficial activo).
    // null si es jugador sin cargo o staff de plataforma sin alianza.
    if (viewer.kind === 'admin' && viewer.role !== 'alliance_leader') {
      base.managedAllianceId = null;
    } else {
      base.managedAllianceId = await managedAllianceId(viewer);
    }
    return base;
  });
}

export type { Viewer };
