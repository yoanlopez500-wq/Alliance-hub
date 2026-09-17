-- Alianzas 2.0: push automatico al publicar un anuncio en el tablon.
-- Patron identico al cron batallon: pg_net + secreto leido de push_config
-- en runtime (nunca hardcodeado). Aditivo: no toca nada existente.

CREATE OR REPLACE FUNCTION public.notify_alliance_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://qkccyjegkgjzwoxytnqp.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', (SELECT value FROM public.push_config WHERE key = 'hook_secret')
    ),
    body := jsonb_build_object(
      'event', 'alliance_announcement',
      'announcement_id', NEW.id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alliance_announcement_push ON public.alliance_announcements;
CREATE TRIGGER trg_alliance_announcement_push
  AFTER INSERT ON public.alliance_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_alliance_announcement();
