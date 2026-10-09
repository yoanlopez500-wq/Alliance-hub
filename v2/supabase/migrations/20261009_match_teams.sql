-- Equipos por partida (aditivo; use_teams=false por defecto = sin cambios)
-- Aplicada el 2026-10-09 via MCP apply_migration (en 2 pasos: tabla+RLS, luego fix RPCs).
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS use_teams boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.match_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  max_members integer CHECK (max_members IS NULL OR max_members > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.match_team_members (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.match_teams(id) ON DELETE CASCADE,
  player_id bigint NOT NULL,
  added_by text NOT NULL DEFAULT 'admin',
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, player_id),
  UNIQUE (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_match_team_members_match ON public.match_team_members(match_id);

-- Guard: un jugador = un equipo por partida + limite max_members por equipo.
CREATE OR REPLACE FUNCTION public.guard_match_team_member() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_existing uuid;
  v_max integer;
  v_count integer;
BEGIN
  SELECT team_id INTO v_existing FROM public.match_team_members
   WHERE match_id = NEW.match_id AND player_id = NEW.player_id;
  IF v_existing IS NOT NULL AND v_existing <> NEW.team_id THEN
    RAISE EXCEPTION 'el jugador ya esta en otro equipo de esta partida';
  END IF;
  SELECT max_members INTO v_max FROM public.match_teams WHERE id = NEW.team_id;
  IF v_max IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.match_team_members WHERE team_id = NEW.team_id;
    IF TG_OP = 'UPDATE' THEN v_count := v_count - 1; END IF;
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'el equipo ha alcanzado su limite de % jugador(es)', v_max;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_match_team_member_guard ON public.match_team_members;
CREATE TRIGGER trg_match_team_member_guard BEFORE INSERT OR UPDATE ON public.match_team_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_match_team_member();

-- RLS: lectura publica; escritura staff o lider/co-lider de la alianza de la
-- partida (misma frontera que matches_update_coleader). Jugadores via RPC.
ALTER TABLE public.match_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_teams_select ON public.match_teams FOR SELECT USING (true);
CREATE POLICY match_team_members_select ON public.match_team_members FOR SELECT USING (true);
CREATE POLICY match_teams_write ON public.match_teams FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.role IN ('superadmin','event_admin','moderator'))
  OR EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_teams.match_id AND m.alliance_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.role = 'alliance_leader' AND au.alliance_id = m.alliance_id)
      OR EXISTS (SELECT 1 FROM public.alliance_officers o WHERE o.alliance_id = m.alliance_id AND o.role = 'co_leader' AND o.player_id = (SELECT player_id FROM public.admin_users WHERE id = auth.uid())))))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.role IN ('superadmin','event_admin','moderator'))
  OR EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_teams.match_id AND m.alliance_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.role = 'alliance_leader' AND au.alliance_id = m.alliance_id)
      OR EXISTS (SELECT 1 FROM public.alliance_officers o WHERE o.alliance_id = m.alliance_id AND o.role = 'co_leader' AND o.player_id = (SELECT player_id FROM public.admin_users WHERE id = auth.uid())))))
);
CREATE POLICY match_team_members_write ON public.match_team_members FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.role IN ('superadmin','event_admin','moderator'))
  OR EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_team_members.match_id AND m.alliance_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.role = 'alliance_leader' AND au.alliance_id = m.alliance_id)
      OR EXISTS (SELECT 1 FROM public.alliance_officers o WHERE o.alliance_id = m.alliance_id AND o.role = 'co_leader' AND o.player_id = (SELECT player_id FROM public.admin_users WHERE id = auth.uid())))))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.role IN ('superadmin','event_admin','moderator'))
  OR EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_team_members.match_id AND m.alliance_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid() AND au.role = 'alliance_leader' AND au.alliance_id = m.alliance_id)
      OR EXISTS (SELECT 1 FROM public.alliance_officers o WHERE o.alliance_id = m.alliance_id AND o.role = 'co_leader' AND o.player_id = (SELECT player_id FROM public.admin_users WHERE id = auth.uid())))))
);

-- RPCs de auto-gestion del jugador (token de sesion; ver 20261009_match_teams_rpc_fix.sql)
