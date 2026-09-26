import { createClient } from '@supabase/supabase-js';

/**
 * AllianceHub v2 SIN server Node (decision del usuario):
 * - publicDb: unico cliente (anon key). La sesion Supabase Auth se guarda
 *   sola en localStorage y supabase-js adjunta el JWT en cada llamada;
 *   RLS hace todo el control de acceso (politica is_alliance_manager).
 * - Jugadores: token sellado del v1 via RPC player_login (llamable con anon).
 * - serverApi: shim de compatibilidad que resuelve LAS MISMAS rutas que el
 *   server v2 (Fastify) pero en local contra Supabase. Las paginas no cambian.
 * - Lo unico que sigue en edge functions (service_role): invitaciones del
 *   jugador por token (player-invitations) y alta de oficiales (officer-signup).
 */

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const publicDb = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ---------------- Sesion de jugador (token sellado del v1) ---------------- */

export function getSessionToken(): string | null {
  return localStorage.getItem('ah2_token');
}
export function setSessionToken(token: string | null, playerId?: number) {
  if (!token) {
    localStorage.removeItem('ah2_token');
    localStorage.removeItem('ah2_player_id');
    return;
  }
  localStorage.setItem('ah2_token', token);
  if (playerId) localStorage.setItem('ah2_player_id', String(playerId));
}
export function getStoredPlayerId(): number | null {
  const v = localStorage.getItem('ah2_player_id');
  return v ? Number(v) : null;
}

/* ---------------- Marca de sesion admin (la sesion real la guarda supabase-js) ---------------- */
// Antes se guardaba el JWT de Supabase en ah2_token y se mezclaba con la sesion de jugador.
export function setAdminSessionMarker() {
  localStorage.setItem('ah2_admin_session', '1');
}
export function hasAdminSessionMarker(): boolean {
  return localStorage.getItem('ah2_admin_session') === '1';
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/* ---------------- Edge functions (service_role) ---------------- */

export async function edgeCall(fn: string, body: unknown): Promise<any> {
  const pid = getStoredPlayerId();
  const token = getSessionToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON,
      ...(pid && token ? { Authorization: `Player ${pid}:${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Error ${res.status}`);
  return data;
}

/* ---------------- /me (identidad del viewer, antes server-side) ---------------- */

export type Me = {
  kind: 'admin' | 'player';
  role?: string;
  playerId?: number;
  managedAllianceId?: string | null;
  /** 'officer' | 'co_leader' cuando kind='player' y la cuenta auth es oficial de alianza. */
  officerRole?: string | null;
};

let meCache: Me | null = null;

export async function fetchMe(): Promise<Me> {
  // Token de jugador: se adjunta SIEMPRE que exista, venga o no sesion Auth.
  // Una sesion Auth (admin/oficial) nunca debe sombrear la sesion de jugador:
  // muchas cuentas son ambas cosas y las paginas de jugador necesitan playerId.
  const pid = getStoredPlayerId();
  const playerId = pid && getSessionToken() ? pid : undefined;

  // 1) Sesion Supabase Auth (admin / lider / oficial). Solo cuenta si la cuenta
  //    tiene rol real; una sesion auth huerfana no debe tapar la sesion de jugador.
  const { data: sess } = await publicDb.auth.getSession();
  if (sess.session) {
    const uid = sess.session.user.id;
    const { data: au } = await publicDb.from('admin_users')
      .select('id, role, alliance_id').eq('id', uid).eq('status', 'active').maybeSingle();
    if (au) {
      const role = au.role as string;
      // Doble sesion: CUALQUIER staff con alianza vinculada la gestiona
      // (los superadmin que tambien son lideres ven panel admin Y panel de lider).
      let managedAllianceId: string | null = (au.alliance_id as string | null) ?? null;
      if (!managedAllianceId && role !== 'alliance_leader') {
        // staff sin alianza: por si acaso, mira officers
        const { data: off } = await publicDb.from('alliance_officers')
          .select('alliance_id').eq('auth_user_id', uid).eq('is_active', true).limit(1).maybeSingle();
        managedAllianceId = (off?.alliance_id as string | null) ?? null;
      }
      // Un lider tambien puede ser oficial de otra? no: su alianza es la suya.
      meCache = { kind: 'admin', role, managedAllianceId, playerId };
      return meCache;
    }
    // Auth pero sin fila admin_users: oficial (o cuenta huerfana)
    const { data: off } = await publicDb.from('alliance_officers')
      .select('alliance_id, role').eq('auth_user_id', uid).eq('is_active', true).limit(1).maybeSingle();
    if (off) {
      meCache = {
        kind: 'player',
        managedAllianceId: (off.alliance_id as string | null) ?? null,
        officerRole: (off.role as string) ?? 'officer',
        playerId,
      };
      return meCache;
    }
    // Sesion auth huerfana (sin rol admin ni officer): NO sombrear la sesion
    // de jugador que pueda existir. Limpiamos la sesion auth y seguimos abajo.
    await publicDb.auth.signOut().catch(() => { /* noop */ });
  }
  // 2) Solo token de jugador (sin sesion Auth)
  if (playerId) {
    meCache = { kind: 'player', playerId, managedAllianceId: null };
    return meCache;
  }
  meCache = { kind: 'player', managedAllianceId: null };
  return meCache;
}
export function invalidateMe() { meCache = null; }

export async function signOutAll() {
  await publicDb.auth.signOut().catch(() => { /* noop */ });
  setSessionToken(null);
  localStorage.removeItem('ah2_admin_session');
  invalidateMe();
}

/* ---------------- Shim serverApi (mismas rutas, ahora locales) ---------------- */

type ViewerAlliance = { allianceId: string };

async function requireManagedAlliance(): Promise<ViewerAlliance> {
  const me = meCache ?? (await fetchMe());
  if (!me.managedAllianceId) throw new ApiError(403, 'requiere lider u oficial de una alianza');
  return { allianceId: me.managedAllianceId };
}

async function meOrThrow(): Promise<Me> {
  const me = meCache ?? (await fetchMe());
  if (me.kind === 'player' && !me.playerId) throw new ApiError(401, 'no autenticado');
  return me;
}

function notFound(path: string): never {
  throw new ApiError(404, `ruta no soportada sin server: ${path}`);
}

async function request(method: string, path: string, body?: unknown): Promise<any> {
  const db = publicDb;

  /* ---- auth ---- */
  if (path === '/auth/player' && method === 'POST') {
    const { playerId, displayName } = body as { playerId: number; displayName: string };
    const { data: token, error } = await db.rpc('player_login', {
      p_player_id: playerId, p_display_name: displayName,
    });
    if (error || !token) throw new ApiError(401, 'login rechazado');
    return { token, playerId };
  }
  if (path === '/me' && method === 'GET') return fetchMe();

  /* ---- match types (RLS: lectura scoping, escritura superadmin) ---- */
  if (path === '/match-types') {
    if (method === 'GET') {
      const { data, error } = await db.from('match_types').select('*').order('order_index');
      if (error) throw new ApiError(500, error.message);
      return data;
    }
    if (method === 'POST') {
      const { data, error } = await db.from('match_types').insert(body as Record<string, unknown>).select().single();
      if (error) throw new ApiError(500, error.message);
      return data;
    }
  }

  /* ---- invitaciones ---- */
  if (path === '/invitations' && method === 'POST') {
    await requireManagedAlliance();
    const { playerId, message } = body as { playerId: number; message?: string };
    const { data: player } = await db.from('players').select('id, current_alliance_id').eq('id', playerId).single();
    if (!player) throw new ApiError(404, 'jugador no encontrado');
    if (player.current_alliance_id) throw new ApiError(409, 'el jugador ya pertenece a una alianza');
    const { data: sess } = await db.auth.getSession();
    const { data, error } = await db.from('alliance_invitations').insert({
      player_id: playerId, message: message ?? null,
      invited_by: sess.session?.user.id ?? null,
    }).select().single();
    if (error) {
      if (error.code === '23505') throw new ApiError(409, 'ya hay una invitacion pendiente de tu alianza a este jugador');
      throw new ApiError(500, error.message);
    }
    return data;
  }
  if (path === '/invitations/mine' && method === 'GET') {
    const r = await edgeCall('player-invitations', { action: 'mine' });
    return r.data ?? r;
  }
  const respondM = path.match(/^\/invitations\/([^/]+)\/respond$/);
  if (respondM && method === 'POST') {
    const b = body as { action?: string };
    return edgeCall('player-invitations', { action: 'respond', id: respondM[1], respond: b.action });
  }

  /* ---- alliances/:id/* ---- */
  const am = path.match(/^\/alliances\/([^/]+)(\/(.*))?$/);
  if (am) {
    const allianceId = am[1];
    const rest = am[3] ?? '';

    if (rest === 'space' && method === 'GET') {
      const [{ data: alliance }, { data: announcements }, { data: rules }] = await Promise.all([
        db.from('alliances').select('id, name, tag, description, profile').eq('id', allianceId).single(),
        db.from('alliance_announcements').select('id, title, body, image_url, is_pinned, expires_at, created_at')
          .eq('alliance_id', allianceId).order('created_at', { ascending: false }),
        db.from('rule_sections').select('id, title, content, order_index, is_active')
          .eq('alliance_id', allianceId).order('order_index'),
      ]);
      return { alliance, announcements: announcements ?? [], rules: rules ?? [] };
    }

    if (rest === 'profile' && method === 'PUT') {
      const b = body as {
        description?: string; welcome_text?: string | null;
        accent_color?: string; community_links?: unknown[];
        logo_url?: string | null; banner_url?: string | null;
      };
      const links = Array.isArray(b.community_links) ? (b.community_links as any[]).slice(0, 4) : [];
      for (const l of links) {
        if (l.url && !String(l.url).startsWith('https://')) throw new ApiError(400, 'los enlaces deben ser https');
      }
      const { data: current } = await db.from('alliances').select('profile').eq('id', allianceId).single();
      const profile = {
        ...(current?.profile ?? {}),
        welcome_text: b.welcome_text ?? null,
        accent_color: /^#[0-9a-f]{6}$/i.test(b.accent_color ?? '') ? b.accent_color : '#ff8f00',
        community_links: links,
        logo_url: b.logo_url ?? (current?.profile as any)?.logo_url ?? null,
        banner_url: b.banner_url ?? (current?.profile as any)?.banner_url ?? null,
      };
      const { error } = await db.from('alliances')
        .update({ description: b.description ?? null, profile }).eq('id', allianceId);
      if (error) throw new ApiError(500, error.message);
      return { ok: true, profile };
    }

    if (rest === 'images' && method === 'POST') {
      const { dataBase64, kind } = body as { dataBase64?: string; kind?: 'logo' | 'banner' | 'announcement' };
      if (!dataBase64 || !kind) throw new ApiError(400, 'dataBase64 y kind son obligatorios');
      const folder = kind === 'announcement' ? 'announcements' : 'alliance-profiles';
      const storagePath = `${folder}/${allianceId}/${Date.now()}.webp`;
      const bin = atob(dataBase64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const { error } = await db.storage.from('public-assets')
        .upload(storagePath, arr, { contentType: 'image/webp', upsert: true });
      if (error) throw new ApiError(500, error.message);
      const { data } = db.storage.from('public-assets').getPublicUrl(storagePath);
      return { url: data.publicUrl };
    }

    if (rest === 'announcements' && method === 'POST') {
      const b = body as { title?: string; body?: string; image_url?: string | null; is_pinned?: boolean; expires_at?: string | null };
      const { data, error } = await db.from('alliance_announcements').insert({
        alliance_id: allianceId, title: b.title, body: b.body,
        image_url: b.image_url ?? null, is_pinned: b.is_pinned ?? false,
        expires_at: b.expires_at ?? null,
      }).select().single();
      if (error) throw new ApiError(500, error.message);
      return data;
    }
    const annM = rest.match(/^announcements\/([^/]+)$/);
    if (annM && method === 'DELETE') {
      const { error } = await db.from('alliance_announcements').delete()
        .eq('id', annM[1]).eq('alliance_id', allianceId);
      if (error) throw new ApiError(500, error.message);
      return { ok: true };
    }

    if (rest === 'rules' && method === 'POST') {
      const b = body as { title?: string; content?: string };
      if (!b.title || !b.content) throw new ApiError(400, 'title y content son obligatorios');
      const { count } = await db.from('rule_sections').select('id', { count: 'exact', head: true })
        .eq('alliance_id', allianceId);
      const { data, error } = await db.from('rule_sections').insert({
        alliance_id: allianceId, title: b.title, content: b.content,
        order_index: (count ?? 0) + 1, section_number: String((count ?? 0) + 1),
        visibility: 'public', is_active: true,
      }).select().single();
      if (error) throw new ApiError(500, error.message);
      return data;
    }
    const ruleM = rest.match(/^rules\/([^/]+)$/);
    if (ruleM && method === 'DELETE') {
      const { error } = await db.from('rule_sections').delete()
        .eq('id', ruleM[1]).eq('alliance_id', allianceId);
      if (error) throw new ApiError(500, error.message);
      return { ok: true };
    }

    if (rest === 'strikes' && method === 'GET') {
      const { data, error } = await db.from('player_strikes')
        .select('*, players:player_id(current_username)')
        .eq('alliance_id', allianceId).order('applied_at', { ascending: false });
      if (error) throw new ApiError(500, error.message);
      return data;
    }
    if (rest === 'strikes' && method === 'POST') {
      const b = body as {
        playerId?: number; strikeTypeId?: string; reason?: string; notes?: string;
        matchId?: string; ruleSectionId?: string; evidenceUrls?: string[];
      };
      if (!b.playerId || !b.reason) throw new ApiError(400, 'playerId y reason son obligatorios');
      // El objetivo debe ser miembro aprobado de la alianza
      const { data: mem } = await db.from('alliance_memberships').select('id')
        .eq('player_id', b.playerId).eq('alliance_id', allianceId).eq('status', 'approved').maybeSingle();
      if (!mem) throw new ApiError(409, 'el jugador no es miembro aprobado de la alianza');
      // El tipo de falta debe ser global o de esta alianza, y SIN efectos de
      // plataforma: ban y anulacion de bajas son jurisdiccion exclusiva del staff.
      let typeInfo: { legend?: string | null; penalty_pct?: number } = {};
      if (b.strikeTypeId) {
        const { data: st } = await db.from('strike_types')
          .select('alliance_id, legend, is_ban, nullifies_kills').eq('id', b.strikeTypeId).maybeSingle();
        if (!st) throw new ApiError(404, 'tipo de falta inexistente');
        if (st.alliance_id && st.alliance_id !== allianceId) throw new ApiError(403, 'no puedes usar tipos de falta de otra alianza');
        if (st.is_ban || st.nullifies_kills) throw new ApiError(403, 'ese tipo de falta tiene efectos de plataforma (ban/anula bajas): usa uno interno o sin esos efectos');
        typeInfo = st as { legend?: string | null };
      }
      // La partida, si se indica, debe ser de esta alianza
      if (b.matchId) {
        const { data: m } = await db.from('matches').select('id').eq('id', b.matchId)
          .or(`alliance_id.eq.${allianceId},alliance_a_id.eq.${allianceId},alliance_b_id.eq.${allianceId}`)
          .maybeSingle();
        if (!m) throw new ApiError(403, 'la partida no pertenece a esta alianza');
      }
      // El articulo de reglamento, si se indica, debe ser interno de la alianza
      if (b.ruleSectionId) {
        const { data: rs } = await db.from('rule_sections').select('id')
          .eq('id', b.ruleSectionId).eq('alliance_id', allianceId).maybeSingle();
        if (!rs) throw new ApiError(403, 'el articulo de reglamento no pertenece a esta alianza');
      }
      const { data: sess } = await db.auth.getSession();
      const { data, error } = await db.from('player_strikes').insert({
        player_id: b.playerId, strike_type_id: b.strikeTypeId ?? null,
        match_id: b.matchId ?? null, rule_section_id: b.ruleSectionId ?? null,
        reason: b.reason, notes: b.notes ?? null,
        alliance_id: allianceId,
        applied_by: sess.session?.user.id ?? null,
        is_active: true, status: 'active',
        evidence_urls: Array.isArray(b.evidenceUrls) && b.evidenceUrls.length ? b.evidenceUrls : [],
      }).select().single();
      if (error) throw new ApiError(500, error.message);

      // Snapshot interno de sancion: historial de la alianza SOBRE partidas de
      // la alianza. Jamas toca players.status ni el ranking global.
      try {
        let penaltyPct = 0;
        if (typeInfo.legend) {
          try { penaltyPct = parseFloat(JSON.parse(typeInfo.legend).penalty_pct) || 0; }
          catch { const mm = String(typeInfo.legend).match(/(\d+)%/); penaltyPct = mm ? parseInt(mm[1]) : 0; }
        }
        const { data: results } = await db.from('match_results')
          .select('kills, match_id, matches!inner(alliance_id, alliance_a_id, alliance_b_id)')
          .eq('player_id', b.playerId);
        const rList = ((results as { kills: number; match_id: string }[]) || [])
          .filter((r) => {
            const m = (r as unknown as { matches: { alliance_id: string | null; alliance_a_id: string | null; alliance_b_id: string | null } }).matches;
            return m.alliance_id === allianceId || m.alliance_a_id === allianceId || m.alliance_b_id === allianceId;
          });
        const mIds = [...new Set(rList.map((r) => r.match_id).filter(Boolean))];
        const valid: Record<string, boolean> = {};
        if (mIds.length) {
          const { data: regs } = await db.from('match_registrations').select('match_id')
            .eq('player_id', b.playerId).in('match_id', mIds);
          ((regs as { match_id: string }[]) || []).forEach((r) => { valid[r.match_id] = true; });
        }
        const killsBefore = rList.reduce((t, r) => t + (valid[r.match_id] ? r.kills || 0 : 0), 0);
        const killsAfter = Math.round(killsBefore * (1 - penaltyPct / 100));
        const { data: playerBefore } = await db.from('players').select('status').eq('id', b.playerId).maybeSingle();
        await db.from('player_sanctions').insert({
          player_id: b.playerId,
          strike_id: data ? (data as { id: string }).id : null,
          strike_type_id: b.strikeTypeId ?? null,
          kills_before: killsBefore, kills_after: killsAfter,
          status_before: (playerBefore as { status: string } | null)?.status ?? null,
          status_after: (playerBefore as { status: string } | null)?.status ?? null,
          penalty_pct: penaltyPct,
          formula_used: typeInfo.legend ?? null,
          alliance_id: allianceId,
        });
      } catch (snapErr) { console.error('[AllianceStrikes] snapshot interno:', snapErr); }

      return data;
    }
    const strikeDelM = rest.match(/^strikes\/([^/]+)$/);
    if (strikeDelM && method === 'DELETE') {
      const { error } = await db.from('player_strikes').delete()
        .eq('id', strikeDelM[1]).eq('alliance_id', allianceId);
      if (error) throw new ApiError(500, error.message);
      return { ok: true };
    }

    if (rest === 'strike-types' && method === 'GET') {
      const { data, error } = await db.from('strike_types')
        .select('id, code, name, description, severity, legend, is_ban, nullifies_kills, alliance_id')
        .or(`alliance_id.is.null,alliance_id.eq.${allianceId}`).order('name');
      if (error) throw new ApiError(500, error.message);
      return data;
    }
    if (rest === 'strike-types' && method === 'POST') {
      const b = body as { code?: string; name?: string; description?: string; severity?: string };
      if (!b.name) throw new ApiError(400, 'name es obligatorio');
      const { data: sess } = await db.auth.getSession();
      const { data, error } = await db.from('strike_types').insert({
        code: b.code ?? b.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40),
        name: b.name, description: b.description ?? null,
        severity: b.severity ?? 'warning',
        is_preset: false, alliance_id: allianceId,
        created_by: sess.session?.user.id ?? null,
      }).select().single();
      if (error) throw new ApiError(500, error.message);
      return data;
    }

    /* -- Historial interno de sanciones (snapshots de strikes de la alianza) -- */
    if (rest === 'sanctions' && method === 'GET') {
      const { data, error } = await db.from('player_sanctions')
        .select('id, player_id, strike_id, strike_type_id, kills_before, kills_after, penalty_pct, formula_used, created_at, players:player_id(current_username)')
        .eq('alliance_id', allianceId).order('created_at', { ascending: false }).limit(100);
      if (error) throw new ApiError(500, error.message);
      return data ?? [];
    }

    /* -- Reportes internos de la alianza (bandeja del lider/oficial) -- */
    if (rest === 'reports' && method === 'GET') {
      const { data, error } = await db.from('player_reports')
        .select('id, player_id, player_name, reported_player_id, reported_player_name, match_id, rule_section_id, report_type, description, evidence_urls, status, admin_response, strike_applied, strike_id, created_at, resolved_at')
        .eq('alliance_id', allianceId).order('created_at', { ascending: false }).limit(100);
      if (error) throw new ApiError(500, error.message);
      return data ?? [];
    }
    if (rest === 'reports' && method === 'POST') {
      const b = body as { reportedPlayerId?: number; description?: string; matchId?: string; ruleSectionId?: string };
      if (!b.reportedPlayerId || !b.description?.trim()) throw new ApiError(400, 'reportedPlayerId y description son obligatorios');
      const { data: rep } = await db.from('alliance_memberships').select('id')
        .eq('player_id', b.reportedPlayerId).eq('alliance_id', allianceId).eq('status', 'approved').maybeSingle();
      if (!rep) throw new ApiError(409, 'el jugador reportado no es miembro aprobado de la alianza');
      const { data: sess } = await db.auth.getSession();
      const uid = sess.session?.user.id ?? '';
      // Autor del reporte: el jugador vinculado a la cuenta del manager
      // (lider -> admin_users.supremacy_player_id, oficial -> alliance_officers.player_id)
      let authorPlayerId: number | null = null;
      const { data: au } = await db.from('admin_users').select('supremacy_player_id')
        .eq('id', uid).maybeSingle();
      authorPlayerId = (au as { supremacy_player_id: number | null } | null)?.supremacy_player_id ?? null;
      if (!authorPlayerId) {
        const { data: off } = await db.from('alliance_officers').select('player_id')
          .eq('auth_user_id', uid).eq('alliance_id', allianceId).eq('is_active', true).maybeSingle();
        authorPlayerId = (off as { player_id: number | null } | null)?.player_id ?? null;
      }
      if (!authorPlayerId) throw new ApiError(400, 'tu cuenta no tiene un jugador vinculado; pide a un admin que lo asocie');
      let reportedName: string | null = null;
      try {
        const { data: rp } = await db.from('players').select('current_username').eq('id', b.reportedPlayerId).maybeSingle();
        reportedName = (rp as { current_username: string } | null)?.current_username ?? null;
      } catch { /* opcional */ }
      const { data, error } = await db.from('player_reports').insert({
        player_id: authorPlayerId,
        player_name: 'Liderazgo de la alianza',
        reported_player_id: b.reportedPlayerId,
        reported_player_name: reportedName,
        match_id: b.matchId ?? null,
        rule_section_id: b.ruleSectionId ?? null,
        report_type: 'alliance_internal',
        description: b.description.trim(),
        status: 'pending',
        alliance_id: allianceId,
      }).select().single();
      if (error) throw new ApiError(500, error.message);
      return data;
    }
    const reportM = rest.match(/^reports\/([^/]+)$/);
    if (reportM && method === 'PUT') {
      const b = body as { status?: string; adminResponse?: string; strikeId?: string | null };
      if (!b.status) throw new ApiError(400, 'status es obligatorio');
      const { data: sess } = await db.auth.getSession();
      // resolved_by exige FK a admin_users: un oficial no es admin_users, queda null
      const { data: au } = await db.from('admin_users').select('id')
        .eq('id', sess.session?.user.id ?? '').maybeSingle();
      const patch: Record<string, unknown> = {
        status: b.status,
        admin_response: b.adminResponse ?? null,
        resolved_at: new Date().toISOString(),
        resolved_by: au ? sess.session?.user.id : null,
      };
      if (b.strikeId) { patch.strike_applied = true; patch.strike_id = b.strikeId; }
      const { data, error } = await db.from('player_reports').update(patch)
        .eq('id', reportM[1]).eq('alliance_id', allianceId).select();
      if (error) throw new ApiError(500, error.message);
      if (!data || data.length === 0) throw new ApiError(404, 'reporte no encontrado en esta alianza');
      return data[0];
    }

    if (rest === 'invitations' && method === 'GET') {
      const { data, error } = await db.from('alliance_invitations')
        .select('id, player_id, status, created_at, responded_at, players:player_id(current_username)')
        .eq('alliance_id', allianceId).order('created_at', { ascending: false }).limit(50);
      if (error) throw new ApiError(500, error.message);
      return data;
    }
  }

  /* ---- expediente ---- */
  const expM = path.match(/^\/players\/([^/]+)\/expediente$/);
  if (expM && method === 'GET') {
    const playerId = Number(expM[1]);
    const [{ data: player }, resultsRes, strikesRes] = await Promise.all([
      db.from('players').select('id, current_username, current_alliance_id, created_at').eq('id', playerId).single(),
      db.from('match_results').select('kills, deaths, matches!inner(id, name, match_type, status)').eq('player_id', playerId),
      // RLS devuelve globales + los de la alianza del viewer si es su manager.
      // Para el contexto de transferencia pedimos explicitamente esos dos grupos.
      db.from('player_strikes').select('id, reason, status, strike_type_id, alliance_id, applied_at')
        .eq('player_id', playerId).order('applied_at', { ascending: false }),
    ]);
    if (!player) throw new ApiError(404, 'jugador no encontrado');
    const rows = resultsRes.data ?? [];
    const kills = rows.reduce((s: number, r: any) => s + (r.kills ?? 0), 0);
    const deaths = rows.reduce((s: number, r: any) => s + (r.deaths ?? 0), 0);
    let alliance = null;
    if (player.current_alliance_id) {
      const { data } = await db.from('alliances').select('id, name, tag, profile')
        .eq('id', player.current_alliance_id).single();
      alliance = data;
    }
    return {
      player,
      alliance,
      estadisticas: { partidas: rows.length, kills, deaths, kd: deaths > 0 ? kills / deaths : kills },
      partidas: rows.map((r: any) => r.matches),
      strikes: strikesRes.data ?? [],
      puede_ser_invitado: !player.current_alliance_id,
    };
  }

  return notFound(path);
}

export const serverApi = {
  get: (path: string) => request('GET', path),
  post: (path: string, body?: unknown) => request('POST', path, body),
  put: (path: string, body?: unknown) => request('PUT', path, body),
  delete: (path: string) => request('DELETE', path),
};
