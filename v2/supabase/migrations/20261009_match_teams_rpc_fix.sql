-- RPCs de auto-gestion del jugador (version limpia, aplicada el 2026-10-09).
CREATE OR REPLACE FUNCTION public.player_join_team(p_match_id uuid, p_team_id uuid, p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player bigint;
  v_use boolean;
  v_team_match uuid;
BEGIN
  SELECT player_id INTO v_player FROM public.player_tokens WHERE token = p_token LIMIT 1;
  IF v_player IS NULL OR NOT public.verify_player_token(v_player, p_token) THEN
    RAISE EXCEPTION 'sesion de jugador invalida';
  END IF;
  SELECT use_teams INTO v_use FROM public.matches WHERE id = p_match_id;
  IF NOT coalesce(v_use, false) THEN RAISE EXCEPTION 'esta partida no usa equipos'; END IF;
  SELECT match_id INTO v_team_match FROM public.match_teams WHERE id = p_team_id;
  IF v_team_match IS NULL OR v_team_match <> p_match_id THEN RAISE EXCEPTION 'equipo no valido para esta partida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.match_registrations WHERE match_id = p_match_id AND player_id = v_player AND status IN ('confirmed','approved')) THEN
    RAISE EXCEPTION 'debes estar registrado en la partida';
  END IF;
  DELETE FROM public.match_team_members
   WHERE match_id = p_match_id AND player_id = v_player AND team_id <> p_team_id;
  INSERT INTO public.match_team_members (match_id, team_id, player_id, added_by)
  VALUES (p_match_id, p_team_id, v_player, 'player')
  ON CONFLICT (team_id, player_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.player_leave_team(p_match_id uuid, p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player bigint;
BEGIN
  SELECT player_id INTO v_player FROM public.player_tokens WHERE token = p_token LIMIT 1;
  IF v_player IS NULL OR NOT public.verify_player_token(v_player, p_token) THEN
    RAISE EXCEPTION 'sesion de jugador invalida';
  END IF;
  DELETE FROM public.match_team_members WHERE match_id = p_match_id AND player_id = v_player;
END $$;
