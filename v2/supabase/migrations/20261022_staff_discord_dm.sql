-- Avisos por DM de Discord al staff (auditoria de solicitudes de partidas).
-- Cada staff vincula su discord_user_id; el bot avisa a TODOS y el mensaje
-- refleja el estado real: quien resolvio, que queda pendiente o "sin pendientes".

CREATE TABLE public.staff_discord_links (
  admin_user_id uuid PRIMARY KEY REFERENCES public.admin_users(id) ON DELETE CASCADE,
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{5,25}$'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_discord_links ENABLE ROW LEVEL SECURITY;

-- Cada staff ve todos los enlaces (auditoria) pero solo gestiona el suyo.
CREATE POLICY staff_discord_links_select ON public.staff_discord_links
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY staff_discord_links_insert ON public.staff_discord_links
  FOR INSERT TO authenticated WITH CHECK (admin_user_id = auth.uid() AND public.is_staff());
CREATE POLICY staff_discord_links_update ON public.staff_discord_links
  FOR UPDATE TO authenticated USING (admin_user_id = auth.uid() AND public.is_staff())
  WITH CHECK (admin_user_id = auth.uid() AND public.is_staff());
CREATE POLICY staff_discord_links_delete ON public.staff_discord_links
  FOR DELETE TO authenticated USING (admin_user_id = auth.uid() AND public.is_staff());

-- Salida hacia discord-notify (URL y secreto ya viven en discord_config).
CREATE OR REPLACE FUNCTION public.staff_discord_notify(p_body jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT value INTO v_url FROM public.discord_config WHERE key = 'function_url';
  SELECT value INTO v_secret FROM public.discord_config WHERE key = 'hook_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'staff_discord_notify: discord_config incompleta';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  -- Nunca romper la transaccion de negocio por un fallo de notificacion
  RAISE WARNING 'staff_discord_notify fallo: %', SQLERRM;
END $function$;

-- Disparador: nueva solicitud pendiente o resolucion (aprobada/rechazada).
-- auth.uid() conserva el JWT del staff que ejecuta el RPC aunque el trigger
-- corra como SECURITY DEFINER, asi sabemos QUIEN resolvio (auditoria).
CREATE OR REPLACE FUNCTION public.notify_match_request_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM public.staff_discord_notify(jsonb_build_object(
      'event', 'staff_dm', 'kind', 'match_request',
      'request_id', NEW.id, 'action', 'new'
    ));
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved','rejected') THEN
    PERFORM public.staff_discord_notify(jsonb_build_object(
      'event', 'staff_dm', 'kind', 'match_request',
      'request_id', NEW.id, 'action', 'resolved',
      'new_status', NEW.status, 'resolved_by', auth.uid()
    ));
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_match_requests_staff_dm
  AFTER INSERT OR UPDATE OF status ON public.match_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_match_request_event();

-- Prueba de DM: cada staff se envia un mensaje de prueba a si mismo.
CREATE OR REPLACE FUNCTION public.staff_discord_test()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_link public.staff_discord_links%ROWTYPE;
  v_url text;
  v_secret text;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'sin permisos'; END IF;
  SELECT * INTO v_link FROM public.staff_discord_links WHERE admin_user_id = auth.uid();
  IF v_link.admin_user_id IS NULL THEN RAISE EXCEPTION 'primero guarda tu ID de Discord'; END IF;
  IF NOT v_link.enabled THEN RAISE EXCEPTION 'tienes los avisos desactivados'; END IF;

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
  RAISE WARNING 'staff_discord_test fallo: %', SQLERRM;
  RAISE;
END $function$;

GRANT EXECUTE ON FUNCTION public.staff_discord_test() TO authenticated;
