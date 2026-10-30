-- ---------- Self-service de perfil admin: nombre visible propio ----------
-- Cada admin activo edita SU display_name desde /cuenta. No toca rol, status,
-- supremacy_player_id ni alliance_id (eso sigue siendo decision de staff).
-- El Discord se gestiona directo contra staff_discord_links: su RLS ya solo
-- permite insert/update/delete del PROPIO enlace (y solo si es staff).
CREATE OR REPLACE FUNCTION public.update_own_display_name(p_display_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_old text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  p_display_name := btrim(p_display_name);
  IF p_display_name IS NULL OR p_display_name = '' OR length(p_display_name) > 50 THEN
    RAISE EXCEPTION 'Nombre visible invalido (1-50 caracteres)';
  END IF;
  SELECT display_name INTO v_old FROM public.admin_users
   WHERE id = v_uid AND status = 'active';
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_old IS NOT DISTINCT FROM p_display_name THEN RETURN true; END IF;
  UPDATE public.admin_users SET display_name = p_display_name WHERE id = v_uid;
  -- Auditoria best-effort: admin_audit_log viene de la v1; si el shape difiere
  -- no queremos que falle el cambio de nombre por eso.
  BEGIN
    INSERT INTO public.admin_audit_log
      (actor_id, actor_name, action, table_name, row_id, old_data, new_data)
    VALUES (v_uid, p_display_name, 'update_own_display_name', 'admin_users', v_uid::text,
            jsonb_build_object('display_name', v_old),
            jsonb_build_object('display_name', p_display_name));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.update_own_display_name(text) TO authenticated;
