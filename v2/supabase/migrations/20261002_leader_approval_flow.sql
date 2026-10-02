-- ============================================================
-- Flujo de aprobacion de lider: el trigger pasa a ser la unica
-- fuente de verdad (la pagina solo marca 'approved').
-- Idempotente y completo: alianza (por tag, fallback por nombre),
-- vinculo del jugador y membresia de lider (upsert). El trigger
-- anterior dejaba la membresia fuera -> lideres sin fila en su
-- propia alianza (caso real: EL MICTLAN).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_alliance_on_leader_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alliance_id uuid;
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    -- 1) Alianza: la etiqueta es la clave; si ya existe (por tag o por
    --    nombre) se reutiliza y NO se toca su leader_id actual.
    SELECT id INTO v_alliance_id FROM alliances
      WHERE tag = UPPER(NEW.alliance_tag) LIMIT 1;
    IF v_alliance_id IS NULL THEN
      SELECT id INTO v_alliance_id FROM alliances
        WHERE name = NEW.alliance_name LIMIT 1;
    END IF;
    IF v_alliance_id IS NULL THEN
      INSERT INTO alliances (name, tag, leader_id, status)
      VALUES (NEW.alliance_name, UPPER(NEW.alliance_tag), NEW.player_id, 'active')
      ON CONFLICT (tag) DO NOTHING
      RETURNING id INTO v_alliance_id;
    END IF;
    -- Carrera concurrente: otro worker pudo insertar mientras tanto
    IF v_alliance_id IS NULL THEN
      SELECT id INTO v_alliance_id FROM alliances
        WHERE tag = UPPER(NEW.alliance_tag) LIMIT 1;
    END IF;

    IF v_alliance_id IS NOT NULL THEN
      -- 2) Jugador vinculado a su alianza
      UPDATE players SET current_alliance_id = v_alliance_id
        WHERE id = NEW.player_id;

      -- 3) Membresia de lider (idempotente): cubre aprobaciones hechas
      --    fuera del boton de la pagina y cuentas heredadas.
      INSERT INTO alliance_memberships (player_id, alliance_id, role, status, requested_by)
      VALUES (NEW.player_id, v_alliance_id, 'leader', 'approved', 'leader')
      ON CONFLICT (player_id, alliance_id)
      DO UPDATE SET role = 'leader', status = 'approved';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Reparacion de datos: EL MICTLAN (EMMDS) tenia lider sin membresia.
INSERT INTO alliance_memberships (player_id, alliance_id, role, status, requested_by)
VALUES (68997911, 'ba354368-cd54-4738-95a9-424028fa7492', 'leader', 'approved', 'leader')
ON CONFLICT (player_id, alliance_id)
DO UPDATE SET role = 'leader', status = 'approved';
