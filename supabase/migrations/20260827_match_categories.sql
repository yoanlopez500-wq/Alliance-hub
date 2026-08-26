BEGIN;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'alliance_hub';
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_category_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_category_check CHECK (category IN ('alliance_hub','batallon'));

DELETE FROM public.match_registrations a
USING public.match_registrations b
WHERE a.match_id = b.match_id AND a.player_id = b.player_id AND a.registered_at > b.registered_at;

ALTER TABLE public.match_registrations DROP CONSTRAINT IF EXISTS match_registrations_match_player_unique;
ALTER TABLE public.match_registrations ADD CONSTRAINT match_registrations_match_player_unique UNIQUE (match_id, player_id);

UPDATE public.matches SET category='batallon' WHERE id='ebb17f23-5be8-4179-8dfa-a49afd18a0b3';

-- CRITICO: la vista DEBE conservar sus filtros WHERE originales (sin ellos se
-- filtrarian partidas internas/privadas/borradores al listado publico).
-- category va AL FINAL (CREATE OR REPLACE solo permite anexar columnas).
CREATE OR REPLACE VIEW public.public_matches_view AS
SELECT id, name, match_type, status, alliance_id, alliance_a_id, alliance_b_id, league_id,
       max_players, winners_declared, requires_approval, is_private, created_at, category
FROM public.matches
WHERE status <> ALL (ARRAY['draft'::text,'finished'::text,'archived'::text])
  AND match_type <> 'internal'::text
  AND is_private = false;

GRANT SELECT ON public.public_matches_view TO anon, authenticated;
COMMIT;
