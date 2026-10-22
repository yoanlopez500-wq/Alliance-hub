-- Directorio de creadores de contenido (v1: YouTube, cuenta de jugador
-- requerida, moderacion manual por staff, avisos DM con auditoria).

CREATE TABLE public.creator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id bigint NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  channel_name text NOT NULL CHECK (char_length(trim(channel_name)) BETWEEN 2 AND 60),
  channel_url text NOT NULL,
  description text CHECK (description IS NULL OR char_length(description) <= 600),
  avatar_url text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes text,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.creator_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  video_id text NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, video_id)
);

CREATE INDEX creator_profiles_status_idx ON public.creator_profiles(status, created_at DESC);
CREATE INDEX creator_videos_profile_idx ON public.creator_videos(profile_id, position);

-- Anti-spam: 1 solicitud pendiente por jugador, 1 perfil aprobado por jugador,
-- y un canal no puede solicitarse/poseerse dos veces.
CREATE UNIQUE INDEX creator_profiles_one_pending ON public.creator_profiles(player_id) WHERE status = 'pending';
CREATE UNIQUE INDEX creator_profiles_one_approved ON public.creator_profiles(player_id) WHERE status = 'approved';
CREATE UNIQUE INDEX creator_profiles_unique_channel ON public.creator_profiles(lower(trim(channel_url))) WHERE status IN ('pending','approved');

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_videos ENABLE ROW LEVEL SECURITY;

-- Publico: solo perfiles aprobados; staff lo gestiona todo.
CREATE POLICY creator_profiles_public_read ON public.creator_profiles
  FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY creator_profiles_staff_all ON public.creator_profiles
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Videos solo visibles si su perfil esta aprobado (oculta pendientes/rechazados).
CREATE POLICY creator_videos_public_read ON public.creator_videos
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.creator_profiles p WHERE p.id = profile_id AND p.status = 'approved')
  );
CREATE POLICY creator_videos_staff_all ON public.creator_videos
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Extrae el ID de video (11 chars) de una URL de YouTube (o ID crudo).
CREATE OR REPLACE FUNCTION public.extract_youtube_id(p_url text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v text := trim(p_url);
  m text;
BEGIN
  IF v ~ '^[A-Za-z0-9_-]{11}$' THEN RETURN v; END IF;
  m := substring(v from 'youtu\.be/([A-Za-z0-9_-]{11})');
  IF m IS NOT NULL THEN RETURN m; END IF;
  m := substring(v from '[?&]v=([A-Za-z0-9_-]{11})');
  IF m IS NOT NULL THEN RETURN m; END IF;
  m := substring(v from '/(shorts|live|embed)/([A-Za-z0-9_-]{11})');
  IF m IS NOT NULL THEN
    RETURN substring(v from '/(?:shorts|live|embed)/([A-Za-z0-9_-]{11})');
  END IF;
  RETURN NULL;
END $f$;

-- Normaliza la URL del canal para el UNIQUE (minusculas, sin espacios).
CREATE OR REPLACE FUNCTION public.normalize_channel_url(p_url text)
RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT lower(trim(p_url));
$f$;

-- El jugador crea su solicitud de perfil con sus videos destacados.
CREATE OR REPLACE FUNCTION public.player_create_creator_request(
  p_token text, p_channel_name text, p_channel_url text,
  p_description text DEFAULT NULL, p_video_urls text[] DEFAULT '{}'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player bigint;
  v_status text;
  v_id uuid;
  v_url text;
  v_vid text;
  i int;
BEGIN
  SELECT player_id INTO v_player FROM public.player_tokens WHERE token = p_token LIMIT 1;
  IF v_player IS NULL OR NOT public.verify_player_token(v_player, p_token) THEN
    RAISE EXCEPTION 'sesion de jugador invalida';
  END IF;
  SELECT status INTO v_status FROM public.players WHERE id = v_player;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'tu cuenta no puede registrar creadores ahora mismo';
  END IF;

  IF EXISTS (SELECT 1 FROM public.creator_profiles WHERE player_id = v_player AND status = 'pending') THEN
    RAISE EXCEPTION 'ya tienes una solicitud pendiente; espera a que el staff la revise';
  END IF;
  IF EXISTS (SELECT 1 FROM public.creator_profiles WHERE player_id = v_player AND status = 'approved') THEN
    RAISE EXCEPTION 'ya tienes un perfil de creador aprobado';
  END IF;

  v_url := public.normalize_channel_url(p_channel_url);
  IF v_url IS NULL OR v_url = '' OR v_url !~ 'youtube\.com' THEN
    RAISE EXCEPTION 'por ahora solo admitimos canales de YouTube';
  END IF;
  IF EXISTS (SELECT 1 FROM public.creator_profiles WHERE lower(trim(channel_url)) = v_url AND status IN ('pending','approved')) THEN
    RAISE EXCEPTION 'ese canal ya fue registrado o esta pendiente';
  END IF;

  INSERT INTO public.creator_profiles (player_id, channel_name, channel_url, description)
  VALUES (v_player, trim(p_channel_name), trim(p_channel_url), nullif(trim(coalesce(p_description, '')), ''))
  RETURNING id INTO v_id;

  IF p_video_urls IS NOT NULL THEN
    FOR i IN 1 .. least(array_length(p_video_urls, 1), 6) LOOP
      v_vid := public.extract_youtube_id(p_video_urls[i]);
      IF v_vid IS NOT NULL THEN
        INSERT INTO public.creator_videos (profile_id, video_id, position)
        VALUES (v_id, v_vid, i)
        ON CONFLICT (profile_id, video_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_id;
END $$;

-- Mis solicitudes/perfiles (jugador).
CREATE OR REPLACE FUNCTION public.player_my_creator_requests(p_token text)
RETURNS SETOF public.creator_profiles LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_player bigint;
BEGIN
  SELECT player_id INTO v_player FROM public.player_tokens WHERE token = p_token LIMIT 1;
  IF v_player IS NULL OR NOT public.verify_player_token(v_player, p_token) THEN
    RAISE EXCEPTION 'sesion de jugador invalida';
  END IF;
  RETURN QUERY SELECT * FROM public.creator_profiles WHERE player_id = v_player ORDER BY created_at DESC LIMIT 10;
END $$;

-- Staff: aprueba. Ademas dispara el relleno de titulos via creator-meta (best effort).
CREATE OR REPLACE FUNCTION public.approve_creator_request(p_request_id uuid, p_avatar_url text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  v_req public.creator_profiles%ROWTYPE;
  v_url text;
  v_secret text;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'sin permisos'; END IF;
  SELECT * INTO v_req FROM public.creator_profiles WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'solicitud no encontrada'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'ya fue revisada'; END IF;

  UPDATE public.creator_profiles
     SET status = 'approved', approved_by = auth.uid(),
         avatar_url = coalesce(p_avatar_url, avatar_url), updated_at = now()
   WHERE id = p_request_id;

  -- Rellenar titulos de los videos por oEmbed (nunca rompe la aprobacion).
  BEGIN
    SELECT value INTO v_url FROM public.discord_config WHERE key = 'creator_meta_url';
    SELECT value INTO v_secret FROM public.discord_config WHERE key = 'hook_secret';
    IF v_url IS NOT NULL AND v_secret IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url,
        body := jsonb_build_object('event', 'fill', 'profile_id', p_request_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
        timeout_milliseconds := 8000
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fill creator-meta fallo: %', SQLERRM;
  END;
END $$;

-- Staff: rechaza con motivo.
CREATE OR REPLACE FUNCTION public.reject_creator_request(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'sin permisos'; END IF;
  UPDATE public.creator_profiles
     SET status = 'rejected', admin_notes = p_reason, updated_at = now()
   WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'solicitud no encontrada o ya revisada'; END IF;
END $$;

-- Avisos DM al staff con auditoria (mismo canal que match_requests).
CREATE OR REPLACE FUNCTION public.notify_creator_request_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM public.staff_discord_notify(jsonb_build_object(
      'event', 'staff_dm', 'kind', 'creator_request',
      'request_id', NEW.id, 'action', 'new'
    ));
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved','rejected') THEN
    PERFORM public.staff_discord_notify(jsonb_build_object(
      'event', 'staff_dm', 'kind', 'creator_request',
      'request_id', NEW.id, 'action', 'resolved',
      'new_status', NEW.status, 'resolved_by', auth.uid()
    ));
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_creator_profiles_staff_dm
  AFTER INSERT OR UPDATE OF status ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_creator_request_event();

GRANT EXECUTE ON FUNCTION public.player_create_creator_request(text, text, text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_my_creator_requests(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_creator_request(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_creator_request(uuid, text) TO anon, authenticated;
