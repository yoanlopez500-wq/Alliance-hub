import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase';
import { resolveViewer, canManageAlliance, isApprovedMember, isPlatformStaff } from '../lib/auth';

/**
 * Sanciones/strikes POR ALIANZA (aisladas, decision del usuario).
 * Escritura 100% por este server: RLS ya restringe la lectura, y aqui
 * validamos que quien escribe es lider u oficial de ESA alianza.
 *
 * Los tipos de falta usables son: globales (alliance_id NULL) o de la
 * propia alianza — nunca los de otra.
 */
export default async function sanctionsRoutes(app: FastifyInstance) {
  // Listar strikes de la alianza (su staff o plataforma)
  app.get('/api/alliances/:allianceId/strikes', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const { data, error } = await supabase
      .from('player_strikes')
      .select('*, players:player_id(current_username)')
      .eq('alliance_id', allianceId)
      .order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // Tipos de falta disponibles para la alianza (globales + propios)
  app.get('/api/alliances/:allianceId/strike-types', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const { data, error } = await supabase
      .from('strike_types')
      .select('id, name, description, severity_default, alliance_id')
      .or(`alliance_id.is.null,alliance_id.eq.${allianceId}`)
      .order('name');
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // Crear tipo de falta propio de la alianza
  app.post('/api/alliances/:allianceId/strike-types', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const { name, description, severity } = req.body as { name?: string; description?: string; severity?: string };
    if (!name) return reply.code(400).send({ error: 'name es obligatorio' });
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const { data, error } = await supabase
      .from('strike_types')
      .insert({ name, description: description ?? null, severity_default: severity ?? null, alliance_id: allianceId })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // Poner un strike (de alianza) a un miembro
  app.post('/api/alliances/:allianceId/strikes', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const { playerId, strikeTypeId, reason, severity } = req.body as {
      playerId?: number; strikeTypeId?: number; reason?: string; severity?: string;
    };
    if (!playerId || !reason) return reply.code(400).send({ error: 'playerId y reason son obligatorios' });

    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    // El objetivo debe ser miembro aprobado de la alianza
    if (!(await isApprovedMember(playerId, allianceId))) {
      return reply.code(409).send({ error: 'el jugador no es miembro aprobado de la alianza' });
    }
    // El tipo de falta debe ser global o de esta alianza
    if (strikeTypeId) {
      const { data: st } = await supabase
        .from('strike_types')
        .select('alliance_id')
        .eq('id', strikeTypeId)
        .maybeSingle();
      if (!st) return reply.code(404).send({ error: 'tipo de falta inexistente' });
      if (st.alliance_id && st.alliance_id !== allianceId) {
        return reply.code(403).send({ error: 'no puedes usar tipos de falta de otra alianza' });
      }
    }

    const createdBy = viewer!.kind === 'admin' ? viewer!.userId : null;
    const { data, error } = await supabase
      .from('player_strikes')
      .insert({
        player_id: playerId,
        strike_type_id: strikeTypeId ?? null,
        reason,
        severity: severity ?? 'warning',
        alliance_id: allianceId,
        created_by: createdBy,
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    // TODO(fase push): notificar al jugador via edge function push-notify
    return data;
  });

  // Borrar un strike propio (plataforma siempre puede; lider solo los de su alianza)
  app.delete('/api/alliances/:allianceId/strikes/:strikeId', async (req, reply) => {
    const { allianceId, strikeId } = req.params as { allianceId: string; strikeId: string };
    const viewer = await resolveViewer(req);
    if (!viewer) return reply.code(401).send({ error: 'no autenticado' });
    if (!isPlatformStaff(viewer) && !(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'sin permiso' });
    }
    const { error } = await supabase
      .from('player_strikes')
      .delete()
      .eq('id', strikeId)
      .eq('alliance_id', allianceId); // candado: nunca borra globales desde aqui
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });
}
