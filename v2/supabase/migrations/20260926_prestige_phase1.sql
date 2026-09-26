-- ============================================================
-- AllianceHub v2 — Prestigio Fase 1 + metricas de podio
-- - Insignias configurables por formulas JSON sobre metricas ESTABLES.
-- - Alcance platform (superadmin) / alliance (lider-event_admin-oficiales de esa alianza).
-- - Coleccion acumulativa: se evaluan en vivo; la principal = mayor rareza.
-- - Podios: top 1/2/3 por partida valida, derivado de match_results.
-- No se usa "ultima actividad" ni estados temporales.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prestige_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('platform', 'alliance')),
  alliance_id uuid REFERENCES public.alliances(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '🏅',
  rarity text NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  color text NOT NULL DEFAULT '#9fa8da',
  formula jsonb NOT NULL CHECK (jsonb_typeof(formula) = 'object'),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prestige_scope_alliance_chk CHECK (
    (scope = 'platform' AND alliance_id IS NULL) OR
    (scope = 'alliance' AND alliance_id IS NOT NULL)
  ),
  CONSTRAINT prestige_color_chk CHECK (color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE INDEX IF NOT EXISTS prestige_definitions_scope_idx ON public.prestige_definitions(scope, alliance_id, is_active);
CREATE INDEX IF NOT EXISTS prestige_definitions_rarity_idx ON public.prestige_definitions(rarity);

CREATE OR REPLACE FUNCTION public.touch_prestige_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prestige_definitions_touch ON public.prestige_definitions;
CREATE TRIGGER trg_prestige_definitions_touch
BEFORE UPDATE ON public.prestige_definitions
FOR EACH ROW EXECUTE FUNCTION public.touch_prestige_updated_at();

-- Permisos: platform = superadmin; alliance = lider/event_admin de esa alianza u oficial activo.
CREATE OR REPLACE FUNCTION public.can_manage_prestige(p_scope text, p_alliance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_scope = 'platform' THEN public.is_superadmin()
    WHEN p_scope = 'alliance' THEN (
      public.is_superadmin()
      OR EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.id = auth.uid() AND au.status = 'active'
          AND au.alliance_id = p_alliance_id
          AND au.role IN ('alliance_leader', 'event_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.alliance_officers o
        WHERE o.auth_user_id = auth.uid() AND o.alliance_id = p_alliance_id AND o.is_active = true
      )
    )
    ELSE false
  END;
$$;

ALTER TABLE public.prestige_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prestige_definitions_public_read ON public.prestige_definitions;
CREATE POLICY prestige_definitions_public_read ON public.prestige_definitions
FOR SELECT TO anon, authenticated
USING (is_active = true OR public.can_manage_prestige(scope, alliance_id));

DROP POLICY IF EXISTS prestige_definitions_manage_insert ON public.prestige_definitions;
CREATE POLICY prestige_definitions_manage_insert ON public.prestige_definitions
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_prestige(scope, alliance_id));

DROP POLICY IF EXISTS prestige_definitions_manage_update ON public.prestige_definitions;
CREATE POLICY prestige_definitions_manage_update ON public.prestige_definitions
FOR UPDATE TO authenticated
USING (public.can_manage_prestige(scope, alliance_id))
WITH CHECK (public.can_manage_prestige(scope, alliance_id));

DROP POLICY IF EXISTS prestige_definitions_manage_delete ON public.prestige_definitions;
CREATE POLICY prestige_definitions_manage_delete ON public.prestige_definitions
FOR DELETE TO authenticated
USING (public.can_manage_prestige(scope, alliance_id));

GRANT SELECT ON public.prestige_definitions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.prestige_definitions TO authenticated;

-- Auditoria: escritura controlada para staff activo (el SELECT sigue siendo superadmin).
DROP POLICY IF EXISTS admin_audit_log_staff_insert ON public.admin_audit_log;
CREATE POLICY admin_audit_log_staff_insert ON public.admin_audit_log
FOR INSERT TO authenticated
WITH CHECK (public.is_active_admin() AND (actor_id IS NULL OR actor_id = auth.uid()));
GRANT INSERT ON public.admin_audit_log TO authenticated;

-- ---------- Metricas base publicas ----------
CREATE OR REPLACE VIEW public.public_player_metric_view AS
WITH priors AS (
  SELECT
    COALESCE(SUM(total_kills), 0)::numeric AS prior_k,
    COALESCE(SUM(total_deaths), 0)::numeric AS prior_d,
    COALESCE(SUM(games_played), 0)::numeric AS games
  FROM public.public_rankings_view
), base AS (
  SELECT
    pr.player_id,
    COALESCE(pr.games_played, 0)::numeric AS games,
    COALESCE(pr.total_kills, 0)::numeric AS kills,
    COALESCE(pr.total_deaths, 0)::numeric AS deaths
  FROM public.public_rankings_view pr
)
SELECT
  b.player_id,
  b.games,
  b.kills,
  b.deaths,
  CASE WHEN b.deaths > 0 THEN b.kills / b.deaths ELSE b.kills END AS kd,
  CASE WHEN b.games > 0 THEN b.kills / b.games ELSE 0 END AS avg_kills,
  CASE WHEN b.kills > 0 THEN ROUND(b.kills * SQRT(CASE WHEN b.deaths > 0 THEN b.kills / b.deaths ELSE b.kills END), 6) ELSE 0 END AS power,
  ROUND((b.kills + 3 * (p.prior_k / NULLIF(p.games, 0))) / GREATEST(b.deaths + 3 * (p.prior_d / NULLIF(p.games, 0)), 1), 6) AS bayes_kd
FROM base b
CROSS JOIN priors p;

CREATE OR REPLACE VIEW public.public_player_podium_stats AS
WITH valid_matches AS (
  SELECT m.id
  FROM public.matches m
  LEFT JOIN public.match_types mt ON mt.id = m.match_type
  WHERE (m.match_type IS NULL OR m.match_type <> 'internal')
    AND (mt.id IS NULL OR mt.scope = 'global')
), ranked AS (
  SELECT
    mr.player_id,
    ROW_NUMBER() OVER (
      PARTITION BY mr.match_id
      ORDER BY COALESCE(mr.kills, 0) DESC, COALESCE(mr.deaths, 0) ASC, mr.player_id ASC
    ) AS place
  FROM public.match_results mr
  JOIN valid_matches vm ON vm.id = mr.match_id
  JOIN public.match_registrations mreg
    ON mreg.match_id = mr.match_id AND mreg.player_id = mr.player_id
)
SELECT
  player_id,
  COUNT(*) FILTER (WHERE place = 1)::bigint AS podium_1,
  COUNT(*) FILTER (WHERE place = 2)::bigint AS podium_2,
  COUNT(*) FILTER (WHERE place = 3)::bigint AS podium_3
FROM ranked
GROUP BY player_id;

GRANT SELECT ON public.public_player_metric_view TO anon, authenticated;
GRANT SELECT ON public.public_player_podium_stats TO anon, authenticated;

-- ---------- Evaluador del DSL JSON ----------
CREATE OR REPLACE FUNCTION public.eval_prestige_condition(p_condition jsonb, p_stats jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_metric text;
  v_op text;
  v_value numeric;
  v_actual numeric;
BEGIN
  IF p_condition IS NULL OR NOT (p_condition ? 'metric') THEN
    RETURN false;
  END IF;

  v_metric := p_condition->>'metric';
  IF p_stats -> v_metric IS NULL OR jsonb_typeof(p_stats -> v_metric) NOT IN ('number', 'string') THEN
    RETURN false;
  END IF;

  BEGIN
    v_actual := (p_stats ->> v_metric)::numeric;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  v_op := COALESCE(p_condition->>'op', '>=');
  BEGIN
    v_value := (p_condition->>'value')::numeric;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN CASE v_op
    WHEN '>=' THEN v_actual >= v_value
    WHEN '<=' THEN v_actual <= v_value
    WHEN '>'  THEN v_actual > v_value
    WHEN '<'  THEN v_actual < v_value
    WHEN '='  THEN v_actual = v_value
    WHEN '==' THEN v_actual = v_value
    WHEN '!=' THEN v_actual <> v_value
    WHEN '<>' THEN v_actual <> v_value
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.eval_prestige_formula(p_formula jsonb, p_stats jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cond jsonb;
BEGIN
  IF p_formula IS NULL OR jsonb_typeof(p_formula) <> 'object' OR p_stats IS NULL THEN
    RETURN false;
  END IF;

  IF p_formula ? 'all' THEN
    IF jsonb_typeof(p_formula->'all') <> 'array' OR jsonb_array_length(p_formula->'all') = 0 THEN
      RETURN false;
    END IF;
    FOR v_cond IN SELECT value FROM jsonb_array_elements(p_formula->'all') LOOP
      IF NOT public.eval_prestige_condition(v_cond, p_stats) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  IF p_formula ? 'any' THEN
    IF jsonb_typeof(p_formula->'any') <> 'array' OR jsonb_array_length(p_formula->'any') = 0 THEN
      RETURN false;
    END IF;
    FOR v_cond IN SELECT value FROM jsonb_array_elements(p_formula->'any') LOOP
      IF public.eval_prestige_condition(v_cond, p_stats) THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  END IF;

  RETURN public.eval_prestige_condition(p_formula, p_stats);
END;
$$;

-- ---------- Stats para formulas ----------
CREATE OR REPLACE FUNCTION public.player_prestige_stats(p_player_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'games', COALESCE(m.games, 0),
    'kills', COALESCE(m.kills, 0),
    'deaths', COALESCE(m.deaths, 0),
    'kd', COALESCE(m.kd, 0),
    'avg_kills', COALESCE(m.avg_kills, 0),
    'power', COALESCE(m.power, 0),
    'bayes_kd', COALESCE(m.bayes_kd, 0),
    'podium_1', COALESCE(p.podium_1, 0),
    'podium_2', COALESCE(p.podium_2, 0),
    'podium_3', COALESCE(p.podium_3, 0),
    'podiums', COALESCE(p.podium_1, 0) + COALESCE(p.podium_2, 0) + COALESCE(p.podium_3, 0),
    'strikes_active', COALESCE(s.strikes_active, 0)
  )
  FROM (SELECT 1 AS one) x
  LEFT JOIN public.public_player_metric_view m ON m.player_id = p_player_id
  LEFT JOIN public.public_player_podium_stats p ON p.player_id = p_player_id
  LEFT JOIN (
    SELECT player_id, COUNT(*)::numeric AS strikes_active
    FROM public.player_strikes
    WHERE status = 'active' AND is_active = true
    GROUP BY player_id
  ) s ON s.player_id = p_player_id;
$$;

CREATE OR REPLACE FUNCTION public.alliance_prestige_stats(p_alliance_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'official_wins', COALESCE((
      SELECT COUNT(*)::numeric FROM public.matches m
      WHERE m.status = 'finished' AND m.winner_alliance_id = p_alliance_id
    ), 0),
    'games_played', COALESCE((
      SELECT SUM(COALESCE(m.games, 0))::numeric
      FROM public.players p
      LEFT JOIN public.public_player_metric_view m ON m.player_id = p.id
      WHERE p.current_alliance_id = p_alliance_id
    ), 0),
    'top10_avg_bayes_kd', COALESCE((
      SELECT AVG(m.bayes_kd)::numeric
      FROM (
        SELECT pm.bayes_kd
        FROM public.players p
        JOIN public.public_player_metric_view pm ON pm.player_id = p.id
        WHERE p.current_alliance_id = p_alliance_id
        ORDER BY pm.bayes_kd DESC
        LIMIT 10
      ) m
    ), 0),
    'active_strikes', COALESCE((
      SELECT COUNT(*)::numeric
      FROM public.player_strikes ps
      JOIN public.players p ON p.id = ps.player_id
      WHERE p.current_alliance_id = p_alliance_id
        AND ps.status = 'active' AND ps.is_active = true
    ), 0),
    'member_podiums', COALESCE((
      SELECT SUM(COALESCE(pod.podium_1, 0) + COALESCE(pod.podium_2, 0) + COALESCE(pod.podium_3, 0))::numeric
      FROM public.players p
      LEFT JOIN public.public_player_podium_stats pod ON pod.player_id = p.id
      WHERE p.current_alliance_id = p_alliance_id
    ), 0)
  );
$$;

-- ---------- Colecciones evaluadas en vivo ----------
CREATE OR REPLACE FUNCTION public.player_prestiges(p_player_id bigint)
RETURNS SETOF public.prestige_definitions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pd.*
  FROM public.prestige_definitions pd
  WHERE pd.is_active = true
    AND (
      pd.scope = 'platform'
      OR pd.alliance_id = (SELECT p.current_alliance_id FROM public.players p WHERE p.id = p_player_id)
    )
    AND public.eval_prestige_formula(pd.formula, public.player_prestige_stats(p_player_id))
  ORDER BY
    CASE pd.rarity WHEN 'legendary' THEN 5 WHEN 'epic' THEN 4 WHEN 'rare' THEN 3 WHEN 'uncommon' THEN 2 ELSE 1 END DESC,
    CASE pd.scope WHEN 'platform' THEN 0 ELSE 1 END ASC,
    pd.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.alliance_prestiges(p_alliance_id uuid)
RETURNS SETOF public.prestige_definitions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pd.*
  FROM public.prestige_definitions pd
  WHERE pd.is_active = true
    AND pd.scope = 'alliance'
    AND pd.alliance_id = p_alliance_id
    AND public.eval_prestige_formula(pd.formula, public.alliance_prestige_stats(p_alliance_id))
  ORDER BY
    CASE pd.rarity WHEN 'legendary' THEN 5 WHEN 'epic' THEN 4 WHEN 'rare' THEN 3 WHEN 'uncommon' THEN 2 ELSE 1 END DESC,
    pd.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.eval_prestige_condition(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eval_prestige_formula(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_prestige_stats(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alliance_prestige_stats(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_prestiges(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alliance_prestiges(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_prestige(text, uuid) TO authenticated;
