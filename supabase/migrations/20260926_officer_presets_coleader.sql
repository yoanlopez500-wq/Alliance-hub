-- 20260926_officer_presets_coleader
-- Presets de delegacion del lider: oficial basico vs co-lider.
-- is_alliance_manager (existente) cubre "miembro gestor" (lider + cualquier oficial)
-- para lecturas/operaciones comunes. Esta migracion anade is_alliance_coleader()
-- para las operaciones sensibles que el preset reserva a lider + co-lider:
--   - invitar oficiales (INSERT en admin_invites, role officer/co_leader)
--   - crear partidas (INSERT en matches de su alianza)
--   - expulsar/gestionar miembros (DELETE/UPDATE en alliance_memberships de su alianza)

CREATE OR REPLACE FUNCTION public.is_alliance_coleader(p_alliance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.id = auth.uid() AND au.status = 'active'
        AND au.role = 'alliance_leader' AND au.alliance_id = p_alliance_id
    )
    OR EXISTS (
      SELECT 1 FROM public.alliance_officers o
      WHERE o.auth_user_id = auth.uid() AND o.alliance_id = p_alliance_id
        AND o.is_active = true AND o.role = 'co_leader'
    );
$function$;

-- Co-lider (o lider) invita oficiales/co-lideres de SU alianza.
CREATE POLICY admin_invites_insert_coleader ON public.admin_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    is_alliance_coleader(alliance_id)
    AND role IN ('officer', 'co_leader')
    AND created_by = auth.uid()
  );

-- Co-lider crea partidas de su alianza (el lider ya entra por is_admin()).
CREATE POLICY matches_insert_coleader ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK (is_alliance_coleader(alliance_id));

-- Co-lider gestiona membresias de su alianza (expulsar = DELETE;
-- cambiar rol/status = UPDATE). Nunca toca al lider (role='leader').
CREATE POLICY alliance_memberships_delete_coleader ON public.alliance_memberships
  FOR DELETE TO authenticated
  USING (is_alliance_coleader(alliance_id) AND role <> 'leader');

CREATE POLICY alliance_memberships_update_coleader ON public.alliance_memberships
  FOR UPDATE TO authenticated
  USING (is_alliance_coleader(alliance_id) AND role <> 'leader')
  WITH CHECK (is_alliance_coleader(alliance_id) AND role <> 'leader');
