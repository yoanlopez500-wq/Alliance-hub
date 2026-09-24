import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase';
import { resolveViewer, canManageAlliance, managedAllianceId } from '../lib/auth';
import { sendPushToPlayers } from '../lib/push';

/**
 * Mercado de transferencias: invitaciones de alianza a jugadores.
 * Flujo: lider/oficial invita -> jugador ve notificacion destacada ->
 * acepta (crea membership approved) o rechaza.
 * La tabla es server-mediated (sin politicas publicas): TODO pasa por aqui.
 */
export default async function invitationsRoutes(app: FastifyInstance) {
  // Lider/oficial invita a un jugador sin alianza
  app.post('/api/invitations', async (req, reply) => {
    const viewer = await resolveViewer(req);
    if (!viewer) return reply.code(401).send({ error: 'no autenticado' });

    const allianceId = await managedAllianceId(viewer);
    if (!allianceId || !(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de una alianza' });
    }

    const { playerId, message } = req.body as { playerId?: number; message?: string };
    if (!playerId) return reply.code(400).send({ error: 'playerId es obligatorio' });

    const { data: player } = await supabase
      .from('players')
      .select('id, current_alliance_id')
      .eq('id', playerId)
      .single();
    if (!player) return reply.code(404).send({ error: 'jugador no encontrado' });
    if (player.current_alliance_id) {
      return reply.code(409).send({ error: 'el jugador ya pertenece a una alianza' });
    }

    const invitedBy = viewer.kind === 'admin' ? viewer.userId : null;
    const { data, error } = await supabase
      .from('alliance_invitations')
      .insert({ alliance_id: allianceId, player_id: playerId, invited_by: invitedBy, message: message ?? null })
      .select()
      .single();
    if (error) {
      // unique de 1 pendiente por (alianza, jugador)
      if (error.code === '23505') return reply.code(409).send({ error: 'ya hay una invitacion pendiente de tu alianza a este jugador' });
      return reply.code(500).send({ error: error.message });
    }
    // Push al jugador invitado (evento nuevo: requiere deploy de push-notify,
    // autorizacion pendiente del usuario; hasta entonces se omite sin error)
    const { data: invAlliance } = await supabase.from('alliances').select('name').eq('id', allianceId).single();
    await sendPushToPlayers({
      event: 'alliance_invitation',
      playerIds: [playerId],
      title: `⛨ ${invAlliance?.name ?? 'Una alianza'} te invita`,
      body: message ?? 'Toca para ver su perfil y aceptar o rechazar.',
      url: '/alianzas',
      dedupeKey: `inv-${data.id}`,
    });
    return data;
  });

  // Jugador: mis invitaciones pendientes (con perfil publico de la alianza)
  app.get('/api/invitations/mine', async (req, reply) => {
    const viewer = await resolveViewer(req);
    if (!viewer || viewer.kind !== 'player') {
      return reply.code(401).send({ error: 'requiere sesion de jugador' });
    }
    const { data, error } = await supabase
      .from('alliance_invitations')
      .select('id, alliance_id, message, created_at, expires_at, alliances:alliance_id(id, name, tag, description, profile)')
      .eq('player_id', viewer.playerId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // Jugador: aceptar o rechazar
  app.post('/api/invitations/:id/respond', async (req, reply) => {
    const viewer = await resolveViewer(req);
    if (!viewer || viewer.kind !== 'player') {
      return reply.code(401).send({ error: 'requiere sesion de jugador' });
    }
    const { id } = req.params as { id: string };
    const { action } = req.body as { action?: 'accept' | 'decline' };
    if (action !== 'accept' && action !== 'decline') {
      return reply.code(400).send({ error: 'action debe ser accept o decline' });
    }

    const { data: inv } = await supabase
      .from('alliance_invitations')
      .select('*')
      .eq('id', id)
      .eq('player_id', viewer.playerId)
      .eq('status', 'pending')
      .maybeSingle();
    if (!inv) return reply.code(404).send({ error: 'invitacion no encontrada o ya respondida' });

    const now = new Date().toISOString();
    await supabase
      .from('alliance_invitations')
      .update({ status: action === 'accept' ? 'accepted' : 'declined', responded_at: now })
      .eq('id', id);

    if (action === 'accept') {
      // Alta directa: la invitacion YA vino del lider/oficial, no requiere
      // aprobacion extra. Si el jugador tenia solicitudes pendientes a
      // otras alianzas, se cancelan para mantener consistencia.
      const { error: memErr } = await supabase
        .from('alliance_memberships')
        .insert({ player_id: viewer.playerId, alliance_id: inv.alliance_id, status: 'approved' });
      if (memErr) return reply.code(500).send({ error: memErr.message });
      await supabase
        .from('alliance_memberships')
        .delete()
        .eq('player_id', viewer.playerId)
        .neq('alliance_id', inv.alliance_id);
      await supabase
        .from('alliance_invitations')
        .update({ status: 'cancelled', responded_at: now })
        .eq('player_id', viewer.playerId)
        .eq('status', 'pending');
      // current_alliance_id se actualiza via RPC/trigger del v1 si existe;
      // fallback directo (columna del perfil publico del jugador):
      await supabase.from('players').update({ current_alliance_id: inv.alliance_id }).eq('id', viewer.playerId);
    }

    return { ok: true, status: action === 'accept' ? 'accepted' : 'declined' };
  });

  // Lider/oficial: invitaciones que ha enviado su alianza
  app.get('/api/alliances/:allianceId/invitations', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const { data, error } = await supabase
      .from('alliance_invitations')
      .select('id, player_id, status, created_at, responded_at, players:player_id(current_username)')
      .eq('alliance_id', allianceId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });
}
