-- 20260926_officer_management_rpc
-- Acciones de gestion de la vista de oficial/co-lider. Los co-lideres NO son
-- admin_users, asi que la politica players_update_admin no les deja limpiar
-- players.current_alliance_id al expulsar/aprobar. Se resuelve con RPCs
-- security definer que verifican is_alliance_coleader() y hacen ambos pasos
-- (membresia + jugador) de forma atomica. Solo el co-lider/lider de ESA
-- alianza puede ejecutarlas.

CREATE OR REPLACE FUNCTION public.alliance_remove_member(p_player_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alliance uuid;
BEGIN
  SELECT current_alliance_id INTO v_alliance FROM public.players WHERE id = p_player_id;
  IF v_alliance IS NULL OR NOT public.is_alliance_coleader(v_alliance) THEN
    RETURN false;
  END IF;
  DELETE FROM public.alliance_memberships
   WHERE player_id = p_player_id AND alliance_id = v_alliance AND role <> 'leader';
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE public.players SET current_alliance_id = NULL WHERE id = p_player_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.alliance_approve_member(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player bigint;
  v_alliance uuid;
BEGIN
  SELECT player_id, alliance_id INTO v_player, v_alliance
    FROM public.alliance_memberships
   WHERE id = p_membership_id AND status = 'pending';
  IF v_player IS NULL OR NOT public.is_alliance_coleader(v_alliance) THEN
    RETURN false;
  END IF;
  UPDATE public.alliance_memberships
     SET status = 'approved', approved_at = now()
   WHERE id = p_membership_id;
  UPDATE public.players SET current_alliance_id = v_alliance WHERE id = v_player;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.alliance_remove_member(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.alliance_approve_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alliance_remove_member(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alliance_approve_member(uuid) TO authenticated;
