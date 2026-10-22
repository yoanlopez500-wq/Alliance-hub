-- Superadmin gestiona los Discord links de CUALQUIER miembro del staff
-- (panel de gestión de admins). Antes cada uno solo tocaba el suyo.

DROP POLICY IF EXISTS staff_discord_links_insert ON public.staff_discord_links;
DROP POLICY IF EXISTS staff_discord_links_update ON public.staff_discord_links;
DROP POLICY IF EXISTS staff_discord_links_delete ON public.staff_discord_links;

CREATE POLICY staff_discord_links_insert ON public.staff_discord_links
  FOR INSERT TO authenticated WITH CHECK (
    (admin_user_id = auth.uid() AND public.is_staff()) OR public.is_superadmin()
  );
CREATE POLICY staff_discord_links_update ON public.staff_discord_links
  FOR UPDATE TO authenticated USING (
    (admin_user_id = auth.uid() AND public.is_staff()) OR public.is_superadmin()
  ) WITH CHECK (
    (admin_user_id = auth.uid() AND public.is_staff()) OR public.is_superadmin()
  );
CREATE POLICY staff_discord_links_delete ON public.staff_discord_links
  FOR DELETE TO authenticated USING (
    (admin_user_id = auth.uid() AND public.is_staff()) OR public.is_superadmin()
  );

-- Prueba de DM dirigida: superadmin puede probar el DM de cualquier staff.
CREATE OR REPLACE FUNCTION public.superadmin_discord_test(p_admin_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_link public.staff_discord_links%ROWTYPE;
  v_url text;
  v_secret text;
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'sin permisos'; END IF;
  SELECT * INTO v_link FROM public.staff_discord_links WHERE admin_user_id = p_admin_user_id;
  IF v_link.admin_user_id IS NULL THEN RAISE EXCEPTION 'ese admin no tiene Discord vinculado'; END IF;

  SELECT value INTO v_url FROM public.discord_config WHERE key = 'function_url';
  SELECT value INTO v_secret FROM public.discord_config WHERE key = 'hook_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RAISE EXCEPTION 'discord_config incompleta'; END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('event', 'staff_dm_test', 'discord_user_id', v_link.discord_user_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'superadmin_discord_test fallo: %', SQLERRM;
  RAISE;
END $function$;

GRANT EXECUTE ON FUNCTION public.superadmin_discord_test(uuid) TO authenticated;
