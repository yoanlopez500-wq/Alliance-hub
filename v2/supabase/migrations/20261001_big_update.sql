-- ============================================================
-- AllianceHub Big Update - migracion v2 (ADITIVA, v1 intacto)
-- Proyecto: qkccyjegkgjzwoxytnqp (mismo de produccion; v1 sigue igual)
-- Regla absoluta: nada destructivo. Filas con alliance_id NULL se
-- comportan exactamente igual que antes de esta migracion.
-- ============================================================

-- ---------- 1) SANCIONES / STRIKES POR ALIANZA ----------
-- NULL = sancion estandar de la liga AllianceHub (comportamiento v1).
-- Valor = sancion privada de esa alianza.
ALTER TABLE public.player_strikes   ADD COLUMN IF NOT EXISTS alliance_id uuid REFERENCES public.alliances(id) ON DELETE CASCADE;
ALTER TABLE public.player_sanctions ADD COLUMN IF NOT EXISTS alliance_id uuid REFERENCES public.alliances(id) ON DELETE CASCADE;
ALTER TABLE public.strike_types     ADD COLUMN IF NOT EXISTS alliance_id uuid REFERENCES public.alliances(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_player_strikes_alliance   ON public.player_strikes(alliance_id);
CREATE INDEX IF NOT EXISTS idx_player_sanctions_alliance ON public.player_sanctions(alliance_id);
CREATE INDEX IF NOT EXISTS idx_strike_types_alliance     ON public.strike_types(alliance_id);

-- Funcion de visibilidad por alcance (SECURITY DEFINER para leer admin_users):
--  - fila global (alliance_id NULL)  -> publica (igual que v1)
--  - fila de alianza                 -> staff plataforma (cualquier rol <> alliance_leader)
--                                       o el lider de ESA alianza
-- Oficiales (jugadores) no pasan por RLS: leen via server v2 (service_role),
-- que valida su condicion en alliance_officers antes de responder.
CREATE OR REPLACE FUNCTION public.can_view_alliance_scope(p_alliance_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p_alliance_id IS NULL
    OR EXISTS (SELECT 1 FROM public.admin_users au
               WHERE au.id = auth.uid() AND au.status = 'active' AND au.role <> 'alliance_leader')
    OR EXISTS (SELECT 1 FROM public.admin_users au
               WHERE au.id = auth.uid() AND au.status = 'active'
                 AND au.role = 'alliance_leader' AND au.alliance_id = p_alliance_id);
$fn$;

-- Reemplazar lectura publica PLANA por lectura con alcance.
-- (v1 no pierde nada: sus filas globales siguen publicas)
DROP POLICY IF EXISTS "Allow public read on player_strikes" ON public.player_strikes;
DROP POLICY IF EXISTS player_strikes_select ON public.player_strikes;
CREATE POLICY player_strikes_select_scoped ON public.player_strikes
  FOR SELECT TO public USING (public.can_view_alliance_scope(alliance_id));

DROP POLICY IF EXISTS player_sanctions_read ON public.player_sanctions;
CREATE POLICY player_sanctions_select_scoped ON public.player_sanctions
  FOR SELECT TO public USING (public.can_view_alliance_scope(alliance_id));

DROP POLICY IF EXISTS "Allow public read on strike_types" ON public.strike_types;
DROP POLICY IF EXISTS strike_types_public_read ON public.strike_types;
CREATE POLICY strike_types_select_scoped ON public.strike_types
  FOR SELECT TO public USING ((is_active IS NULL OR is_active = true)
                              AND public.can_view_alliance_scope(alliance_id));

-- Escritura de sanciones de alianza: SOLO via server v2 (service_role, que
-- valida lider en admin_users u oficial activo en alliance_officers).
-- Las policies de escritura existentes del v1 quedan intactas para filas globales.

-- ---------- 2) TIPOS DE PARTIDA ADMINISTRABLES ----------
-- Alcances: 'global'              -> cualquiera (liga, eventos publicos)
--           'internal_standard'   -> internas de alianzas, medidas por AllianceHub
--           'exclusive'           -> interna de UNA alianza (alliance_id obligatorio)
CREATE TABLE IF NOT EXISTS public.match_types (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  color       text NOT NULL DEFAULT '#9fa8da',
  icon        text,
  scope       text NOT NULL DEFAULT 'global'
              CHECK (scope IN ('global','internal_standard','exclusive')),
  alliance_id uuid REFERENCES public.alliances(id) ON DELETE CASCADE,
  is_active   boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exclusive_requires_alliance
    CHECK (scope <> 'exclusive' OR alliance_id IS NOT NULL)
);

-- Seed: los tipos hardcodeados del v1 (matches.match_type es texto; las
-- partidas existentes quedan validas sin tocar una sola fila).
INSERT INTO public.match_types (id, name, description, scope, order_index) VALUES
  ('internal',    'Interna',              'Partida interna de alianza',            'internal_standard', 1),
  ('duel',        'Duelo',                'Duelo entre alianzas',                  'global',            2),
  ('public_31',   'Publica 31',           'Evento publico estandar',               'global',            3),
  ('public_500',  'Evento 500',           'Evento masivo de plataforma',           'global',            4),
  ('public_quick','Rapida',               'Partida rapida',                        'global',            5),
  ('tournament',  'Torneo',               'Torneo de la liga',                     'global',            6)
ON CONFLICT (id) DO NOTHING;

-- Doble candado para exclusivas: aunque manipulen la API directamente,
-- un matches con tipo exclusivo de otra alianza es rechazado.
-- Tipos desconocidos (legacy) pasan sin bloqueo: v1 nunca se rompe.
CREATE OR REPLACE FUNCTION public.validate_match_type_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE t_scope text; t_alliance uuid;
BEGIN
  SELECT scope, alliance_id INTO t_scope, t_alliance
    FROM public.match_types WHERE id = NEW.match_type AND is_active;
  IF NOT FOUND THEN RETURN NEW; END IF; -- tipo legacy: no bloquear
  IF t_scope = 'exclusive' AND NEW.alliance_id IS DISTINCT FROM t_alliance THEN
    RAISE EXCEPTION 'El tipo de partida % es exclusivo de otra alianza', NEW.match_type;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_validate_match_type_scope ON public.matches;
CREATE TRIGGER trg_validate_match_type_scope
  BEFORE INSERT OR UPDATE OF match_type, alliance_id ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.validate_match_type_scope();

-- Lectura publica (los selectores filtran por alcance a nivel app/server);
-- escritura SOLO staff de plataforma (is_active_admin, patron v1).
ALTER TABLE public.match_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_types_select ON public.match_types
  FOR SELECT TO public USING (is_active = true
    AND (scope <> 'exclusive'
         OR public.can_view_alliance_scope(alliance_id)));
CREATE POLICY match_types_write_admin ON public.match_types
  FOR ALL TO public USING (is_active_admin()) WITH CHECK (is_active_admin());

-- GRANTs explicitos (obligatorios desde el cambio Supabase de oct-2026)
GRANT SELECT ON public.match_types TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_types TO service_role;

-- ---------- 3) MERCADO DE TRANSFERENCIAS: INVITACIONES ----------
-- Acceso 100% via server v2 (service_role). Sin politicas publicas:
-- anon/authenticated no ven nada, el server valida y responde.
CREATE TABLE IF NOT EXISTS public.alliance_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id  uuid NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  player_id    bigint NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  invited_by   uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  message      text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
ALTER TABLE public.alliance_invitations ENABLE ROW LEVEL SECURITY;
-- una invitacion pendiente por (alianza, jugador)
CREATE UNIQUE INDEX IF NOT EXISTS alliance_invitations_one_pending
  ON public.alliance_invitations(alliance_id, player_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS alliance_invitations_player_idx
  ON public.alliance_invitations(player_id) WHERE status = 'pending';

REVOKE ALL ON public.alliance_invitations FROM anon, authenticated;
GRANT ALL ON public.alliance_invitations TO service_role;
