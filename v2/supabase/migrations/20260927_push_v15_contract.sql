-- ============================================================
-- Push v15: unificar contrato de notificaciones
-- El edge function push-notify v15 solo acepta eventos concretos.
-- Los triggers antiguos enviaban {subject_id, event} con eventos que v15
-- ya no soporta -> 400 silenciosos. Se consolidan en un contrato unico
-- via push_notify(jsonb), todo leyendo URL y secreto de push_config.
-- ============================================================

-- 1) Funcion generica: unico punto de salida hacia push-notify
CREATE OR REPLACE FUNCTION public.push_notify(p_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT value INTO v_url FROM public.push_config WHERE key = 'function_url';
  SELECT value INTO v_secret FROM public.push_config WHERE key = 'hook_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'push_notify: push_config incompleta';
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
  RAISE WARNING 'push_notify fallo: %', SQLERRM;
END;
$function$;

-- 2) Partidas: consolidar los 3 triggers duplicados en uno solo.
--    Se notifican las partidas NO privadas (las internas llegan solo a la
--    alianza, el edge function filtra por match.alliance_id).
DROP TRIGGER IF EXISTS trg_match_push_notify ON public.matches;
DROP TRIGGER IF EXISTS trg_push_new_match ON public.matches;
DROP TRIGGER IF EXISTS trg_push_status_change ON public.matches;

CREATE OR REPLACE FUNCTION public.notify_match_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'open' AND COALESCE(NEW.is_private, false) = false THEN
      v_event := 'new_match';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status AND COALESCE(NEW.is_private, false) = false THEN
      IF NEW.status = 'open' THEN
        v_event := 'new_match';
      ELSE
        v_event := 'status_change';
      END IF;
    END IF;
  END IF;

  IF v_event IS NOT NULL THEN
    PERFORM public.push_notify(jsonb_build_object('match_id', NEW.id, 'event', v_event));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_matches_push
  AFTER INSERT OR UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.notify_match_event();

DROP FUNCTION IF EXISTS public.notify_match_push();
DROP FUNCTION IF EXISTS public.trg_push_match_insert();
DROP FUNCTION IF EXISTS public.trg_push_match_status();

-- 3) Strikes y sanciones: notificar al jugador afectado (player_id + event)
CREATE OR REPLACE FUNCTION public.trg_notify_strike()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.push_notify(jsonb_build_object('player_id', NEW.player_id, 'event', 'strike_received'));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_sanction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.push_notify(jsonb_build_object('player_id', NEW.player_id, 'event', 'sanction_applied'));
  RETURN NEW;
END;
$function$;

-- 4) Resultados publicados: notificar a los inscritos (match_id + event)
CREATE OR REPLACE FUNCTION public.trg_notify_results_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.push_notify(jsonb_build_object('match_id', NEW.match_id, 'event', 'results_published'));
  RETURN NEW;
END;
$function$;

-- 5) Eliminar triggers muertos (eventos que v15 no soporta y no se restauran)
DROP TRIGGER IF EXISTS trg_push_new_report ON public.player_reports;
DROP TRIGGER IF EXISTS trg_player_reports_update_push ON public.player_reports;
DROP TRIGGER IF EXISTS trg_alliance_leader_requests_push ON public.alliance_leader_requests;
DROP TRIGGER IF EXISTS trg_alliance_memberships_push ON public.alliance_memberships;
DROP TRIGGER IF EXISTS trg_match_registrations_status_push ON public.match_registrations;
DROP FUNCTION IF EXISTS public.trg_push_new_report();
DROP FUNCTION IF EXISTS public.trg_notify_report_update();
DROP FUNCTION IF EXISTS public.trg_notify_alliance_request();
DROP FUNCTION IF EXISTS public.trg_notify_membership_change();
DROP FUNCTION IF EXISTS public.trg_notify_registration_status();

-- 6) notify_push (contrato viejo subject_id) queda obsoleto
DROP FUNCTION IF EXISTS public.notify_push(uuid, text);
