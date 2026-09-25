import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase';
import { resolveViewer, canManageAlliance, isPlatformStaff, type Viewer } from '../lib/auth';

/**
 * Tipos de partida administrables.
 * Alcances: global | internal_standard | exclusive.
 * - Lectura: globales + estandar para todos; exclusivas solo para su
 *   alianza (o staff de plataforma).
 * - Escritura: SUPERADMIN unicamente (decision del usuario: panel en superadmin).
 * Nota: el trigger trg_validate_match_type_scope hace el segundo candado
 * en la base, nadie puede colar un matches con tipo exclusivo ajeno.
 */
export default async function matchTypesRoutes(app: FastifyInstance) {
  app.get('/api/match-types', async (req, reply) => {
    const viewer = await resolveViewer(req);
    const { data, error } = await supabase
      .from('match_types')
      .select('id, name, description, color, icon, scope, alliance_id, order_index')
      .eq('is_active', true)
      .order('order_index');
    if (error) return reply.code(500).send({ error: error.message });

    const visible = (data ?? []).filter((t: any) => {
      if (t.scope !== 'exclusive') return true;
      if (isPlatformStaff(viewer)) return true;
      return viewer?.kind === 'admin' && viewer.allianceId === t.alliance_id;
    });
    return visible;
  });

  app.post('/api/match-types', async (req, reply) => {
    const viewer = await requireSuperadmin(req, reply);
    if (!viewer) return;
    const b = req.body as any;
    if (!b?.id || !b?.name || !b?.scope) {
      return reply.code(400).send({ error: 'id, name y scope son obligatorios' });
    }
    if (b.scope === 'exclusive' && !b.alliance_id) {
      return reply.code(400).send({ error: 'una exclusiva requiere alliance_id' });
    }
    const { data, error } = await supabase
      .from('match_types')
      .insert({
        id: String(b.id), name: b.name, description: b.description ?? null,
        color: b.color ?? '#9fa8da', icon: b.icon ?? null, scope: b.scope,
        alliance_id: b.alliance_id ?? null, order_index: b.order_index ?? 99,
        created_by: viewer.kind === 'admin' ? viewer.userId : null,
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  app.put('/api/match-types/:id', async (req, reply) => {
    const viewer = await requireSuperadmin(req, reply);
    if (!viewer) return;
    const { id } = req.params as { id: string };
    const b = req.body as any;
    const { data, error } = await supabase
      .from('match_types')
      .update({
        name: b.name, description: b.description, color: b.color, icon: b.icon,
        scope: b.scope, alliance_id: b.alliance_id, order_index: b.order_index,
        is_active: b.is_active,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });
}

async function requireSuperadmin(req: any, reply: any): Promise<Viewer | null> {
  const viewer = await resolveViewer(req);
  if (!viewer || viewer.kind !== 'admin' || viewer.role !== 'superadmin') {
    reply.code(viewer ? 403 : 401).send({ error: 'requiere superadmin' });
    return null;
  }
  return viewer;
}
