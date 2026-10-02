-- Estado completo de la ultima invitacion de un jugador (usado / expirado /
-- activo), para que la pagina de solicitud de liderazgo distinga los casos
-- tras la aprobacion. Devuelve una fila aunque el codigo este usado o vencido.
CREATE OR REPLACE FUNCTION public.get_player_invite_status(p_player_id bigint)
RETURNS TABLE(code text, role text, used boolean, expires_at timestamp with time zone, expired boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT ai.code, ai.role, ai.used, ai.expires_at,
         (ai.expires_at IS NOT NULL AND ai.expires_at <= now()) AS expired
  FROM public.admin_invites ai
  WHERE ai.player_id = p_player_id
  ORDER BY ai.created_at DESC
  LIMIT 1;
END;
$function$;
