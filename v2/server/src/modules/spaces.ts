import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase';
import { resolveViewer, canManageAlliance } from '../lib/auth';

/**
 * Mi Espacio (v2): gestion del perfil publico de la alianza.
 * Todo requiere ser lider u oficial de la alianza. Las imagenes se suben
 * al bucket public-assets (mismo del v1) via service_role: el cliente las
 * comprime (canvas) y manda base64.
 */
export default async function spacesRoutes(app: FastifyInstance) {
  // Estado actual del espacio (para precargar el panel)
  app.get('/api/alliances/:allianceId/space', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const { data } = await supabase
      .from('alliances')
      .select('id, name, tag, description, profile')
      .eq('id', allianceId)
      .single();
    const { data: announcements } = await supabase
      .from('alliance_announcements')
      .select('id, title, body, image_url, is_pinned, expires_at, created_at')
      .eq('alliance_id', allianceId)
      .order('created_at', { ascending: false });
    const { data: rules } = await supabase
      .from('rule_sections')
      .select('id, title, content, order_index, is_active')
      .eq('alliance_id', allianceId)
      .order('order_index');
    return { alliance: data, announcements: announcements ?? [], rules: rules ?? [] };
  });

  // Guardar perfil (descripcion, bienvenida, color, enlaces, logo/banner ya subidos)
  app.put('/api/alliances/:allianceId/profile', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const b = req.body as {
      description?: string; welcome_text?: string | null;
      accent_color?: string; community_links?: unknown[];
      logo_url?: string | null; banner_url?: string | null;
    };
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const links = Array.isArray(b.community_links) ? b.community_links.slice(0, 4) : [];
    for (const l of links as any[]) {
      if (l.url && !String(l.url).startsWith('https://')) {
        return reply.code(400).send({ error: 'los enlaces deben ser https' });
      }
    }
    const { data: current } = await supabase
      .from('alliances').select('profile').eq('id', allianceId).single();
    const profile = {
      ...(current?.profile ?? {}),
      welcome_text: b.welcome_text ?? null,
      accent_color: /^#[0-9a-f]{6}$/i.test(b.accent_color ?? '') ? b.accent_color : '#ff8f00',
      community_links: links,
      logo_url: b.logo_url ?? (current?.profile as any)?.logo_url ?? null,
      banner_url: b.banner_url ?? (current?.profile as any)?.banner_url ?? null,
    };
    const { error } = await supabase
      .from('alliances')
      .update({ description: b.description ?? null, profile })
      .eq('id', allianceId);
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true, profile };
  });

  // Subir imagen (logo / banner / anuncio): base64 -> public-assets/<carpeta>
  app.post('/api/alliances/:allianceId/images', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const { dataBase64, kind } = req.body as { dataBase64?: string; kind?: 'logo' | 'banner' | 'announcement' };
    if (!dataBase64 || !kind) return reply.code(400).send({ error: 'dataBase64 y kind son obligatorios' });
    const folder = kind === 'announcement' ? 'announcements' : 'alliance-profiles';
    const path = `${folder}/${allianceId}/${Date.now()}.webp`;
    const { error } = await supabase.storage
      .from('public-assets')
      .upload(path, Buffer.from(dataBase64, 'base64'), {
        contentType: 'image/webp', upsert: true,
      });
    if (error) return reply.code(500).send({ error: error.message });
    const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
    return { url: data.publicUrl };
  });

  // Publicar anuncio (con push a miembros, via push-notify cuando se autorice el deploy)
  app.post('/api/alliances/:allianceId/announcements', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const { title, body, image_url, is_pinned, days } = req.body as {
      title?: string; body?: string; image_url?: string | null;
      is_pinned?: boolean; days?: number;
    };
    if (!title) return reply.code(400).send({ error: 'title es obligatorio' });
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const expires = new Date(Date.now() + (days ?? 30) * 86400000).toISOString();
    const { data, error } = await supabase
      .from('alliance_announcements')
      .insert({
        alliance_id: allianceId, title, body: body ?? null,
        image_url: image_url ?? null, is_pinned: !!is_pinned, expires_at: expires,
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    // El push a miembros YA lo dispara el trigger trg_alliance_announcement_push
    // (migration v1 20260917) al insertar: no duplicar aqui; su dedupe por
    // push_notification_log protege de envios dobles de cualquier otra via.
    return data;
  });

  app.delete('/api/alliances/:allianceId/announcements/:annId', async (req, reply) => {
    const { allianceId, annId } = req.params as { allianceId: string; annId: string };
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const { error } = await supabase
      .from('alliance_announcements')
      .delete()
      .eq('id', annId)
      .eq('alliance_id', allianceId);
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });

  // Reglamento propio de la alianza
  app.post('/api/alliances/:allianceId/rules', async (req, reply) => {
    const { allianceId } = req.params as { allianceId: string };
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title || !content) return reply.code(400).send({ error: 'title y content son obligatorios' });
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const { count } = await supabase
      .from('rule_sections')
      .select('id', { count: 'exact', head: true })
      .eq('alliance_id', allianceId);
    const { data, error } = await supabase
      .from('rule_sections')
      .insert({
        title, content, alliance_id: allianceId,
        order_index: (count ?? 0) + 1,
        section_number: String((count ?? 0) + 1),
        visibility: 'public', is_active: true,
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  app.delete('/api/alliances/:allianceId/rules/:ruleId', async (req, reply) => {
    const { allianceId, ruleId } = req.params as { allianceId: string; ruleId: string };
    const viewer = await resolveViewer(req);
    if (!(await canManageAlliance(viewer, allianceId))) {
      return reply.code(403).send({ error: 'requiere lider u oficial de la alianza' });
    }
    const { error } = await supabase
      .from('rule_sections')
      .delete()
      .eq('id', ruleId)
      .eq('alliance_id', allianceId); // candado: nunca toca reglas globales
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });
}
