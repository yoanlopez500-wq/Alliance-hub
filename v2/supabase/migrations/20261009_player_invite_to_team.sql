-- RPC: un miembro de un equipo puede invitar a otro jugador registrado (confirmado/aprobado) que no este en otro equipo.
-- Los limites de cupo y el "un equipo por jugador" los sigue imponiendo el trigger guard_match_team_member.
CREATE OR REPLACE FUNCTION public.player_invite_to_team(
  p_match_id uuid,
  p_team_id uuid,
  p_target_player_id integer,
  p_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller integer;
  v_match public.matches%ROWTYPE;
  v_team public.match_teams%ROWTYPE;
  v_reg public.match_registrations%ROWTYPE;
BEGIN
  SELECT player_id INTO v_caller FROM public.player_tokens WHERE token = p_token LIMIT 1;
  IF v_caller IS NULL OR NOT public.verify_player_token(v_caller, p_token) THEN
    RAISE EXCEPTION 'sesion de jugador invalida';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND OR NOT v_match.use_teams THEN
    RAISE EXCEPTION 'esta partida no usa equipos';
  END IF;

  SELECT * INTO v_team FROM public.match_teams WHERE id = p_team_id AND match_id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'equipo no valido para esta partida';
  END IF;

  -- quien invita debe ser miembro de ESE equipo
  IF NOT EXISTS (SELECT 1 FROM public.match_team_members WHERE team_id = p_team_id AND player_id = v_caller) THEN
    RAISE EXCEPTION 'solo los miembros del equipo pueden invitar';
  END IF;

  -- el invitado debe estar registrado y confirmado/aprobado
  SELECT * INTO v_reg FROM public.match_registrations
    WHERE match_id = p_match_id AND player_id = p_target_player_id;
  IF NOT FOUND OR v_reg.status NOT IN ('confirmed','approved') THEN
    RAISE EXCEPTION 'ese jugador no esta registrado (o no confirmado) en la partida';
  END IF;

  INSERT INTO public.match_team_members (match_id, team_id, player_id)
  VALUES (p_match_id, p_team_id, p_target_player_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.player_invite_to_team(uuid, uuid, integer, text) TO anon, authenticated;
