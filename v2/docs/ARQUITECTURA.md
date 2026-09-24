# Decisiones de arquitectura — AllianceHub 2.0

## Stack
- Web: React 18 + Vite + TypeScript + react-router. Los "componentes" reemplazan los IIFE con window.* del v1.
- Server: Node.js + Fastify. Asume la logica que hoy vive en edge functions + validaciones a nivel app.
- DB: MISMO proyecto Supabase qkccyjegkgjzwoxytnqp (decision del usuario).

## REGLA ABSOLUTA (base de datos)
- Lectura de tablas de produccion: libre.
- Cualquier CAMBIO solo via migracion ADITIVA en v2/supabase/migrations/:
  columnas nuevas NULLABLE o tablas nuevas. Nada de alterar/borrar lo existente.
- La migracion 20261001_big_update.sql ya aplicada cumple esto: columnas
  alliance_id NULL (= comportamiento v1) + tablas match_types y alliance_invitations nuevas.
- v1 queda intacto: verificado tras aplicar (38 reglas, strikes globales publicos, 4 partidas).

## Seguridad (heredada del v1, reforzada)
- RLS en cada tabla: sanciones de alianza aisladas con can_view_alliance_scope()
  (publico = solo filas globales; staff plataforma = todo; lider = solo su alianza).
- Oficiales (jugadores, token sellado) acceden via server v2 con service_role,
  que valida alliance_officers antes de responder. alliance_invitations es
  100% server-mediated (sin politicas publicas).
- Tipos de partida exclusivos: filtro en selectores + trigger trg_validate_match_type_scope
  (doble candado; tipos legacy desconocidos no se bloquean, v1 jamas se rompe).

## Estado del schema v2 (aplicado 2026-10-01)
1. player_strikes / player_sanctions / strike_types: + alliance_id (NULL = liga).
2. match_types: 6 seeds (los tipos hardcodeados del v1) + CRUD admin futuro.
3. alliance_invitations: mercado de transferencias, unique de 1 pendiente por (alianza, jugador).

## Pendiente (fases siguientes)
- Server: endpoints de sanciones por alianza, expediente, invitaciones, match_types.
- Web: componentes de las 3 features + panel superadmin de match_types.


## PLAN DE OPTIMIZACION MASIVA (modulos + componentes)
Problema del v1: ~15 scripts IIFE con window.* acoplados, logica duplicada
en cada pagina (fetch + render + toast repetidos N veces), sin tipos.

### Server (Node/Fastify) — modular por dominio
- v2/server/src/modules/<dominio>.ts: cada feature es un plugin Fastify
  autocontenido (rutas + reglas). Anadir una feature = 1 archivo + 1 linea
  en index.ts. Nada de editar 8 archivos como en el v1.
- v2/server/src/lib/auth.ts: UN punto de verificacion de identidad
  (admin o jugador). Los guards (canManageAlliance, isPlatformStaff,
  isApprovedMember) se reutilizan en todos los modulos — en el v1 esa
  logica estaba reescrita en cada pagina.
- v2/server/src/lib/supabase.ts: instancia unica service_role.

### Web (React) — componentes reutilizables
Componentes base a construir (fase siguiente, cada uno reemplaza codigo
duplicado del v1):
- <DataTable>     -> tablas de jugadores/strikes/anuncios (v1: ~6 tablas distintas hand-rolled)
- <Badge>         -> badges de tipo/estado/rol (v1: getTypeBadge/getStatusBadge hardcodeados)
- <EmptyState> y <Loader> -> estados de carga/vacio uniformes
- useApi() hook   -> fetch + error + loading en una linea por componente
- <ExpedienteModal> -> expediente de jugador reutilizado en: mercado, perfil, admin
- apiClient.ts    -> cliente tipado del server v2 (reemplaza los window.supabase sueltos)

### Seguridad ganada por diseno
- Toda escritura pasa por el server (validacion central, sin duplicarla en JS del cliente).
- El service_role nunca toca el browser; la anon key solo lee lo publico.
- RLS queda como red de respaldo, no como unica barrera.

### Metricas objetivo del rewrite
- ~50% menos lineas de frontend (componentes vs copia/pega por pagina).
- Tipado end-to-end (TS en web y server): los errores de "columna inexistente"
  se detectan al compilar, no en produccion.
- Cada feature nueva: 1 modulo server + N componentes, sin tocar codigo ajeno.
