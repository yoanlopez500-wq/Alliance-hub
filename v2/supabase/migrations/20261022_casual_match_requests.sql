-- Solicitudes de partidas casuales: cualquier jugador registrado propone,
-- staff aprueba. CERO grants nuevos sobre `matches` para anon/jugadores.
-- La aprobacion crea la fila en matches via SECURITY DEFINER (staff).

CREATE TABLE public.match_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id bigint NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  match_type text NOT NULL DEFAULT 'public_quick' REFERENCES public.match_types(id),
  max_players integer NOT NULL DEFAULT 10 CHECK (max_players BETWEEN 2 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  admin_notes text,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX match_requests_status_idx ON public.match_requests(status, created_at DESC);
-- Anti-spam: maximo 1 solicitud pendiente por jugador.
CREATE UNIQUE INDEX match_requests_one_pending ON public.match_requests(requester_id) WHERE status = 'pending';

ALTER TABLE public.match_requests ENABLE ROW LEVEL SECURITY;

-- Solo staff toca la tabla directamente. Los jugadores usan los RPC con token sellado.
CREATE POLICY match_requests_staff_all ON public.match_requests
  FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Vista publica: solicitudes pendientes visibles en el lobby (solo lectura, sin datos sensibles).
CREATE OR REPLACE VIEW public.public_match_requests_view AS
  SELECT id, name, description, match_type, max_players, status, created_at
  FROM public.match_requests
  WHERE status = 'pending';

GRANT SELECT ON public.public_match_requests_view TO anon, authenticated;

-- Limpieza perezosa: las pendientes de mas de 30 dias se consideran expiradas y se borran.
CREATE OR REPLACE FUNCTION public.purge_expired_match_requests()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.match_requests
   WHERE status = 'pending' AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- El jugador crea su solicitud (token sellado del v1).
CREATE OR REPLACE FUNCTION public.player_create_match_request(
  p_token text, p_name text, p_description text DEFAULT NULL,
  p_match_type text DEFAULT 'public_quick', p_max_players integer DEFAULT 10
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player bigint;
  v_status text;
  v_id uuid;
BEGIN
  SELECT player_id INTO v_player FROM public.player_tokens WHERE token = p_token LIMIT 1;
  IF v_player IS NULL OR NOT public.verify_player_token(v_player, p_token) THEN
    RAISE EXCEPTION 'sesion de jugador invalida';
  END IF;

  SELECT status INTO v_status FROM public.players WHERE id = v_player;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'tu cuenta no puede crear partidas ahora mismo';
  END IF;

  PERFORM public.purge_expired_match_requests();

  IF EXISTS (SELECT 1 FROM public.match_requests WHERE requester_id = v_player AND status = 'pending') THEN
    RAISE EXCEPTION 'ya tienes una solicitud pendiente; espera a que el staff la revise';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.match_types WHERE id = p_match_type AND is_active AND scope = 'global') THEN
    RAISE EXCEPTION 'tipo de partida no valido';
  END IF;

  INSERT INTO public.match_requests (requester_id, name, description, match_type, max_players)
  VALUES (v_player, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_match_type, p_max_players)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Mis solicitudes (jugador).
CREATE OR REPLACE FUNCTION public.player_my_match_requests(p_token text)
RETURNS SETOF public.match_requests LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_player bigint;
BEGIN
  SELECT player_id INTO v_player FROM public.player_tokens WHERE token = p_token LIMIT 1;
  IF v_player IS NULL OR NOT public.verify_player_token(v_player, p_token) THEN
    RAISE EXCEPTION 'sesion de jugador invalida';
  END IF;
  RETURN QUERY SELECT * FROM public.match_requests WHERE requester_id = v_player ORDER BY created_at DESC LIMIT 20;
END $$;

-- Staff: aprueba y crea la partida real. Devuelve el id de la partida creada.
CREATE OR REPLACE FUNCTION public.approve_match_request(p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req public.match_requests%ROWTYPE;
  v_match uuid;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'sin permisos'; END IF;
  PERFORM public.purge_expired_match_requests();

  SELECT * INTO v_req FROM public.match_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'solicitud no encontrada'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'la solicitud ya fue revisada'; END IF;

  INSERT INTO public.matches (
    name, description, match_type, status, max_players,
    requires_approval, is_official, category, use_global_rules, use_teams,
    created_by, created_at
  ) VALUES (
    v_req.name, v_req.description, v_req.match_type, 'open', v_req.max_players,
    false, false, 'alliance_hub', true, false,
    auth.uid(), now()
  ) RETURNING id INTO v_match;

  INSERT INTO public.match_registrations (match_id, player_id, status, registered_at, confirmed_at, confirmed_by)
  VALUES (v_match, v_req.requester_id, 'confirmed', now(), now(), auth.uid());

  UPDATE public.match_requests
     SET status = 'approved', match_id = v_match, updated_at = now()
   WHERE id = p_request_id;

  RETURN v_match;
END $$;

-- Staff: rechaza con motivo opcional.
CREATE OR REPLACE FUNCTION public.reject_match_request(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'sin permisos'; END IF;
  UPDATE public.match_requests
     SET status = 'rejected', admin_notes = p_reason, updated_at = now()
   WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'solicitud no encontrada o ya revisada'; END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.player_create_match_request(text, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_my_match_requests(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_match_request(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_match_request(uuid, text) TO anon, authenticated;
