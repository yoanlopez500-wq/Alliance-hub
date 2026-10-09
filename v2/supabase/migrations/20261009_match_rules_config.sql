-- Configuracion de reglamento por partida (aditiva, defaults seguros)
-- Aplicada el 2026-10-09 via MCP apply_migration.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS use_global_rules boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rules_alliance_id uuid REFERENCES public.alliances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_rules_text text;

COMMENT ON COLUMN public.matches.use_global_rules IS 'Incluir el reglamento general de AllianceHub (rule_sections globales) al aceptar';
COMMENT ON COLUMN public.matches.rules_alliance_id IS 'Alianza cuyo reglamento privado aplica a esta partida (ademas del global si use_global_rules)';
COMMENT ON COLUMN public.matches.custom_rules_text IS 'Reglas exclusivas de la partida, texto libre mostrado al final del documento de reglas';
