-- 20260926_admin_users_update_superadmin_only
-- La UI de "Cambiar rol / Suspender" (AdminAdminsPage) solo la muestra el
-- superadmin, pero la politica admin_users_update permitia UPDATE a CUALQUIER
-- admin activo: un moderator podia editar la fila de un superadmin.
-- Alineado con INSERT/DELETE: UPDATE solo superadmin.
DROP POLICY IF EXISTS admin_users_update ON public.admin_users;
CREATE POLICY admin_users_update ON public.admin_users
  FOR UPDATE TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());
