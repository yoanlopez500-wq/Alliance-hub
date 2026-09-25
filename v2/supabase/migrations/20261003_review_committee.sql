-- ============================================================
-- AllianceHub v2 — Comite de revision de strikes
-- La pagina /admin/review-committee (enlazada desde el panel) usa
-- strike_review_requests, tabla que existia en el diseno pero nunca
-- se creo en produccion. Se crea aqui (aditiva, sin tocar v1).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.strike_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strike_id uuid NOT NULL REFERENCES public.player_strikes(id) ON DELETE CASCADE,
  player_id bigint NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  player_name text,
  strike_type_name text,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  committee_comment text,
  precedent_id uuid REFERENCES public.rule_precedents(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strike_review_requests_status_idx
  ON public.strike_review_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS strike_review_requests_strike_idx
  ON public.strike_review_requests(strike_id);

ALTER TABLE public.strike_review_requests ENABLE ROW LEVEL SECURITY;

-- Staff de plataforma (superadmin / event_admin / moderator) lee y resuelve.
DROP POLICY IF EXISTS strike_review_requests_staff_read ON public.strike_review_requests;
CREATE POLICY strike_review_requests_staff_read ON public.strike_review_requests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
      AND au.role IN ('superadmin', 'event_admin', 'moderator')
  ));

DROP POLICY IF EXISTS strike_review_requests_staff_write ON public.strike_review_requests;
CREATE POLICY strike_review_requests_staff_write ON public.strike_review_requests
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
      AND au.role IN ('superadmin', 'event_admin', 'moderator')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = auth.uid() AND au.status = 'active'
      AND au.role IN ('superadmin', 'event_admin', 'moderator')
  ));

GRANT SELECT, INSERT, UPDATE ON public.strike_review_requests TO authenticated;
