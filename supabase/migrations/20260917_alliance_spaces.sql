-- ============================================================
-- Alianzas 2.0 - "Alliance Space"
-- 100% ADITIVO: ninguna consulta existente cambia de resultado.
--  - alliances.profile: jsonb con default '{}'
--  - rule_sections.alliance_id: NULL = reglamento global (intacto)
--  - alliance_announcements: tabla nueva (tablon de anuncios)
--    alliance_id NULL = anuncio oficial de AllianceHub (plataforma)
-- ============================================================

-- 1) Perfil visual/comunidad de la alianza (una sola columna extensible)
ALTER TABLE alliances
  ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;

-- El lider/admin vinculado actualiza SOLO su alianza (politica aditiva,
-- la politica alliances_update_admin existente sigue intacta)
CREATE POLICY alliances_update_own_profile ON alliances
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM admin_users au
    WHERE au.id = auth.uid()
      AND au.alliance_id = alliances.id
      AND au.role IN ('alliance_leader', 'event_admin', 'superadmin')
  ));

-- 2) Reglamento por alianza: reutiliza rule_sections entero
ALTER TABLE rule_sections
  ADD COLUMN IF NOT EXISTS alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS rule_sections_alliance_idx ON rule_sections(alliance_id);

-- 3) Tablon de anuncios
CREATE TABLE IF NOT EXISTS alliance_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE, -- NULL = anuncio oficial AllianceHub
  title text NOT NULL,
  body text,
  image_url text,
  is_pinned boolean NOT NULL DEFAULT false,
  created_by bigint,           -- players.id de quien publica
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE alliance_announcements ENABLE ROW LEVEL SECURITY;

-- Lectura publica (la pagina de alianza es publica; el feed del jugador filtra en cliente)
CREATE POLICY announcements_read_public ON alliance_announcements
  FOR SELECT TO public USING (true);

-- Escritura publica con validacion a nivel app (lider/oficial de la alianza),
-- mismo patron que alliance_memberships / player_reports / push_subscriptions.
-- El borrado por admin queda cubierto (admin es authenticated, incluido en public).
CREATE POLICY announcements_write_public ON alliance_announcements
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Vista publica: solo anuncios vigentes (expirados quedan fuera automaticamente)
CREATE OR REPLACE VIEW public_alliance_announcements_view AS
SELECT id, alliance_id, title, body, image_url, is_pinned, created_at, expires_at
FROM alliance_announcements
WHERE expires_at > now();

-- GRANTs explicitos (obligatorios desde 30-oct-2026: Supabase ya no otorga
-- acceso API automatico a tablas nuevas del esquema public). En produccion ya
-- existen (tabla creada antes del cambio); estos garantizan entornos nuevos/reset.
grant select, insert, update, delete on public.alliance_announcements to anon, authenticated, service_role;
grant select on public.public_alliance_announcements_view to anon, authenticated, service_role;

-- 4) Imagenes del tablon: subida publica SOLO dentro de announcements/ en public-assets
--    (mismo patron que report_evidence_public_upload)
CREATE POLICY announcements_image_upload ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'public-assets' AND (storage.foldername(name))[1] = 'announcements');
