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
      meCache = { kind: 'admin', role, managedAllianceId };
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
      };
      return meCache;
    }
    // Sesion auth huerfana (sin rol admin ni officer): NO sombrear la sesion
    // de jugador que pueda existir. Limpiamos la sesion auth y seguimos abajo.
    await publicDb.auth.signOut().catch(() => { /* noop */ });
  }
  // 2) Token de jugador
  const pid = getStoredPlayerId();
  if (pid && getSessionToken()) {
    meCache = { kind: 'player', playerId: pid, managedAllianceId: null };
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
      const b = body as { playerId?: number; strikeTypeId?: number; reason?: string; notes?: string };
      if (!b.playerId || !b.reason) throw new ApiError(400, 'playerId y reason son obligatorios');
      // El objetivo debe ser miembro aprobado de la alianza
      const { data: mem } = await db.from('alliance_memberships').select('id')
        .eq('player_id', b.playerId).eq('alliance_id', allianceId).eq('status', 'approved').maybeSingle();
      if (!mem) throw new ApiError(409, 'el jugador no es miembro aprobado de la alianza');
      // El tipo de falta debe ser global o de esta alianza
      if (b.strikeTypeId) {
        const { data: st } = await db.from('strike_types').select('alliance_id').eq('id', b.strikeTypeId).maybeSingle();
        if (!st) throw new ApiError(404, 'tipo de falta inexistente');
        if (st.alliance_id && st.alliance_id !== allianceId) throw new ApiError(403, 'no puedes usar tipos de falta de otra alianza');
      }
      const { data: sess } = await db.auth.getSession();
      const { data, error } = await db.from('player_strikes').insert({
        player_id: b.playerId, strike_type_id: b.strikeTypeId ?? null,
        reason: b.reason, notes: b.notes ?? null,
        alliance_id: allianceId,
        applied_by: sess.session?.user.id ?? null,
        is_active: true,
      }).select().single();
      if (error) throw new ApiError(500, error.message);
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
        .select('id, code, name, description, severity, is_ban, alliance_id')
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
