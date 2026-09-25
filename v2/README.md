# AllianceHub 2.0 — Big Update

Reescritura del nucleo de AllianceHub con Node.js (backend) + React (componentes).

## Regla absoluta
- `main` y produccion (alliancehub.app) NO se tocan. Todo el trabajo ocurre en la rama
  `ah-v2/big-update` y el futuro merge sera via pull request desde esa rama.
- El v1 sigue sirviendose desde `main` en GitHub Pages sin cambios.

## Estado: alfa funcional
- **Server Fastify** (`v2/server`): 6 modulos (auth, expediente, sanctions, invitations,
  match-types, spaces), `resolveViewer` dual (admin Bearer / jugador `Player id:token`),
  CORS, health check (`/api/health`), validacion de env al arrancar. Compila limpio (tsc).
- **Web React** (`v2/web`): 9 pantallas (login, jugadores/mercado, directorio de alianzas,
  perfil publico de alianza, sanciones, mi espacio, tipos de partida, invitaciones),
  componentes compartidos (Button, Field, Section, Badge, DataTable, Loader, EmptyState,
  ExpedienteModal, Reveal, CursorTrail), `theme.ts` unico, capa visual con animaciones
  (fade-up, slow-zoom, glow, glassmorphism, estela de cursor). Compila limpio (tsc + vite).

## Quickstart (local)
```bash
cd v2
npm install                 # workspaces web + server (fuera de /mnt: no soporta symlinks)
cp server/.env.example server/.env   # rellena SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
cp web/.env.example web/.env         # rellena VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (+ VITE_API_URL en prod)
npm run dev:server          # API en :3001
npm run dev:web             # web en :5173 (proxy /api -> :3001)
```

## Features del Big Update
1. **Sanciones aisladas por alianza** (RLS + scope NULL=global): solo la alianza que las
   puso + admins las ven; excepcion de expediente completo en transferencias.
2. **Mercado de transferencias**: directorio de jugadores -> expediente -> invitar ->
   notificacion destacada -> aceptar/rechazar (con push real, edge function v14).
3. **Tipos de partida administrables** por superadmin: scope global / interna-estandar / exclusiva.
4. **Espacio de alianza**: perfil publico, imagenes comprimidas a WebP, tablon con push,
   reglamento propio.
5. **Directorio publico de alianzas** y perfiles publicos navegables.

## Pendiente (requiere decision/usuario)
- Pruebas end-to-end en local (usuario en movil hasta ahora).
- Cutover de alliancehub.app a v2 (dominio, hosting del server, PWA).
- PWA/service worker del v2 (el v1 tiene SW propio que se queda congelado).
