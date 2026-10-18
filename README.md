# AllianceHub

Plataforma de torneos, rankings y alianzas de Supremacy 1914 (PWA).
Despliegue: https://alliancehub.app (GitHub Pages, dominio propio).

## Estructura

- `v2/web` — Aplicacion actual: React 18 + TypeScript + Vite + Supabase.
  El workflow `.github/workflows/deploy-v2.yml` construye y publica
  `v2/web/dist` en GitHub Pages (unico contenido servido).
- `v2/supabase` — Migraciones SQL y edge functions de la base de datos.
- La v1 (SPA JavaScript vanilla) fue retirada del repositorio tras la
  reconstruccion exitosa; su historial sigue disponible en git.

## Seguridad

- Autorizacion server-side via Row Level Security (Supabase). El cliente
  nunca es la frontera de seguridad.
- El storage publico valida tamano (15 MB) y tipo de archivo via trigger
  `storage_upload_guard` (ver migracion 20261018).
- La anon key es publica por diseno; el acceso lo gobiernan las politicas RLS.
