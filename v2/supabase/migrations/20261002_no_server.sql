-- ============================================================
-- AllianceHub v2 — SIN SERVER NODE (aditiva, v1 intacto)
-- La v2 deja de depender del backend Fastify: todo pasa por
-- anon key + RLS + Supabase Auth (+ 2 edge functions para lo
-- que solo puede hacer service_role: token de jugador).
--
-- Decision clave: los OFICIALES son ahora usuarios Auth, creados
-- por invitacion de su lider (patron complete-leader-signup).
-- Por eso RLS puede reconocerlos via alliance_officers.auth_user_id
-- y validar "lider u oficial de ESA alianza" sin backend propio.
-- ============================================================

-- ---------- 1) OFICIALES COMO USUARIOS AUTH ----------
ALTER TABLE public.alliance_officers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alliance_officers_auth_uid
  ON public.alliance_officers(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS alliance_officers_alliance_idx
  ON public.alliance_officers(alliance_id) WHERE is_active = true;

-- ---------- 2) NUCLEO: is_alliance_manager(alliance_id) ----------
-- SECURITY DEFINER (lee admin_users / alliance_officers sin recursividad RLS).
-- TRUE si auth.uid() es: staff de plataforma activo, lider de ESA alianza,
-- u oficial activo (auth) de ESA alianza.
CREATE OR REPLACE FUNCTION public.is_alliance_manager(p_alliance_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.id = auth.uid() AND au.status = 'active'
        AND (au.role <> 'alliance_leader' OR au.alliance_id = p_alliance_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.alliance_officers o
      WHERE o.auth_user_id = auth.uid() AND o.alliance_id = p_alliance_id
        AND o.is_active = true
    );
$fn$;

-- Ampliar la funcion de visibilidad del big-update: los oficiales (auth)
-- de una alianza tambien ven sus filas privadas (antes solo via server).
CREATE OR REPLACE FUNCTION public.can_view_alliance_scope(p_alliance_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p_alliance_id IS NULL
    OR public.is_alliance_manager(p_alliance_id);
$fn$;

-- ---------- 3) STRIKES/SANCIONES POR ALIANZA: escritura por managers ----------
-- (la lectura scoping ya existe: can_view_alliance_scope)
DROP POLICY IF EXISTS player_strikes_insert_alliance ON public.player_strikes;
CREATE POLICY player_strikes_insert_alliance ON public.player_strikes
  FOR INSERT TO authenticated
  WITH CHECK (alliance_id IS NOT NULL AND public.is_alliance_manager(alliance_id));

DROP POLICY IF EXISTS player_strikes_delete_alliance ON public.player_strikes;
CREATE POLICY player_strikes_delete_alliance ON public.player_strikes
  FOR DELETE TO authenticated
  USING (alliance_id IS NOT NULL AND public.is_alliance_manager(alliance_id));

-- Tipos de falta propios de la alianza (los globales siguen siendo de staff plataforma)
DROP POLICY IF EXISTS strike_types_insert_alliance ON public.strike_types;
CREATE POLICY strike_types_insert_alliance ON public.strike_types
  FOR INSERT TO authenticated
  WITH CHECK (alliance_id IS NOT NULL AND public.is_alliance_manager(alliance_id));

-- ---------- 4) INVITACIONES DEL MERCADO: lectura/escritura por managers ----------
-- (el jugador destino lee/responde via edge function player-invitations,
--  que usa service_role; aqui abrimos el acceso autenticado del staff)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alliance_invitations TO authenticated;

DROP POLICY IF EXISTS alliance_invitations_select_mgr ON public.alliance_invitations;
CREATE POLICY alliance_invitations_select_mgr ON public.alliance_invitations
  FOR SELECT TO authenticated
  USING (public.is_alliance_manager(alliance_id));

DROP POLICY IF EXISTS alliance_invitations_insert_mgr ON public.alliance_invitations;
CREATE POLICY alliance_invitations_insert_mgr ON public.alliance_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_alliance_manager(alliance_id));

DROP POLICY IF EXISTS alliance_invitations_update_mgr ON public.alliance_invitations;
CREATE POLICY alliance_invitations_update_mgr ON public.alliance_invitations
  FOR UPDATE TO authenticated
  USING (public.is_alliance_manager(alliance_id))
  WITH CHECK (public.is_alliance_manager(alliance_id));

DROP POLICY IF EXISTS alliance_invitations_delete_mgr ON public.alliance_invitations;
CREATE POLICY alliance_invitations_delete_mgr ON public.alliance_invitations
  FOR DELETE TO authenticated
  USING (public.is_alliance_manager(alliance_id));

-- ---------- 5) MI ESPACIO: anuncios, reglas propias, perfil ----------
-- Tablon publico de la alianza: lectura publica, escritura de su manager.
ALTER TABLE public.alliance_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alliance_announcements_public_read ON public.alliance_announcements;
CREATE POLICY alliance_announcements_public_read ON public.alliance_announcements
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS alliance_announcements_write_mgr ON public.alliance_announcements;
CREATE POLICY alliance_announcements_write_mgr ON public.alliance_announcements
  FOR ALL TO authenticated
  USING (public.is_alliance_manager(alliance_id))
  WITH CHECK (public.is_alliance_manager(alliance_id));

-- Reglamento: los managers escriben las secciones de SU alianza
-- (las filas globales, alliance_id NULL, siguen siendo de staff plataforma).
DROP POLICY IF EXISTS rule_sections_write_alliance ON public.rule_sections;
CREATE POLICY rule_sections_write_alliance ON public.rule_sections
  FOR ALL TO authenticated
  USING (alliance_id IS NOT NULL AND public.is_alliance_manager(alliance_id))
  WITH CHECK (alliance_id IS NOT NULL AND public.is_alliance_manager(alliance_id));

-- Perfil publico de la alianza: los managers (lider u oficial auth) lo editan.
-- Reemplaza la politica v1 de "solo lider" para incluir oficiales.
DROP POLICY IF EXISTS alliances_update_own_profile ON public.alliances;
DROP POLICY IF EXISTS alliances_update_mgr ON public.alliances;
CREATE POLICY alliances_update_mgr ON public.alliances
  FOR UPDATE TO authenticated
  USING (public.is_alliance_manager(id))
  WITH CHECK (public.is_alliance_manager(id));

-- ---------- 6) GESTION DE OFICIALES POR SU LIDER ----------
DROP POLICY IF EXISTS alliance_officers_leader_manage ON public.alliance_officers;
CREATE POLICY alliance_officers_leader_manage ON public.alliance_officers
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users au
            WHERE au.id = auth.uid() AND au.status = 'active'
              AND au.role = 'alliance_leader' AND au.alliance_id = alliance_id)
    OR public.is_alliance_manager(alliance_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users au
            WHERE au.id = auth.uid() AND au.status = 'active'
              AND au.role = 'alliance_leader' AND au.alliance_id = alliance_id)
  );

-- ---------- 7) INVITACIONES DE OFICIAL (admin_invites role='officer') ----------
-- El lider genera codigos de invitacion de oficial para SU alianza.
-- (los codigos de staff plataforma siguen siendo de superadmin, politicas v1)
DROP POLICY IF EXISTS admin_invites_officer_leader ON public.admin_invites;
CREATE POLICY admin_invites_officer_leader ON public.admin_invites
  FOR ALL TO authenticated
  USING (
    role = 'officer'
    AND EXISTS (SELECT 1 FROM public.admin_users au
                WHERE au.id = auth.uid() AND au.status = 'active'
                  AND au.role = 'alliance_leader' AND au.alliance_id = alliance_id)
  )
  WITH CHECK (
    role = 'officer'
    AND EXISTS (SELECT 1 FROM public.admin_users au
                WHERE au.id = auth.uid() AND au.status = 'active'
                  AND au.role = 'alliance_leader' AND au.alliance_id = alliance_id)
  );

-- ---------- 8) STORAGE: managers suben imagenes de su alianza ----------
DROP POLICY IF EXISTS "alliance managers write public-assets" ON storage.objects;
CREATE POLICY "alliance managers write public-assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'public-assets'
    AND (name LIKE 'alliance-profiles/%' OR name LIKE 'announcements/%')
    AND public.is_alliance_manager((split_part(name, '/', 2))::uuid)
  );

-- ---------- 9) RPCs DEL V1 LLAMABLES DESDE EL NAVEGADOR ----------
-- player_login y verify_player_token eran ya del v1; el grant explicito
-- los mantiene accesibles con anon key (el server ya no existe).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('player_login', 'verify_player_token')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated', r.proname, r.args);
  END LOOP;
END $$;

-- ---------- 10) GRANTs explicitos de tablas tocadas ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alliance_officers TO authenticated;
GRANT SELECT ON public.alliance_announcements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alliance_announcements TO authenticated;
