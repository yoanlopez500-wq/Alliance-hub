# AllianceHub 2.0 — Arquitectura (Big Update)

## Principios

- **REGLA ABSOLUTA**: `main` y produccion de v1 congeladas. Todo el trabajo v2 ocurre en la rama
  `ah-v2/big-update`, bajo la carpeta `v2/`, sin colisionar con ningun archivo de v1.
- **REGLA ABSOLUTA (DB)**: solo migraciones aditivas sobre el mismo proyecto Supabase
  (`qkccyjegkgjzwoxytnqp`). Nunca modificar tablas de produccion; las extensiones v2 usan
  columnas/ tablas nuevas con comportamiento NULL = v1.
- Server Node.js (Fastify) con modulos por feature; web React 18 + Vite + TypeScript con
  componentes reutilizables; RLS como retorno de seguridad detras del server.

## Stack

- `v2/server`: Fastify, plugins por modulo (`modules/*.ts`), `resolveViewer` admin|player,
  service_role solo en servidor.
- `v2/web`: React 18 + Vite + TS. Cliente dual en `lib/api.ts` (`serverApi` autenticado,
  `publicDb` anon para lecturas publicas). Hook `useApi`. Componentes compartidos:
  `Button`, `Field` (Input/TextArea/Select), `Section`, `Badge`, `DataTable`, `Loader`,
  `EmptyState`, `ExpedienteModal`, `Reveal`, `CursorTrail`. `theme.ts` es la unica fuente
  de verdad de color/estilo.

## Modulos del server

- `auth`: login de jugador (RPC `player_login`), `/api/me`.
- `expediente`: expediente publico de jugador + sanciones visibles segun reglas de aislamiento.
- `sanctions`: strikes/sanciones por alianza (valida membresia aprobada + propiedad del tipo).
- `invitations`: mercado de transferencias (invitar, listar, aceptar/rechazar, push).
- `match-types`: CRUD de tipos de partida (superadmin), scopes global/internal_standard/exclusive.
- `spaces`: perfil publico de alianza, imagenes (webp comprimido), anuncios y reglas propios.

## Base de datos (migracion `20261001_big_update`)

- `player_strikes.alliance_id`, `player_sanctions.alliance_id`, `strike_types.alliance_id`
  (NULL = global, comportamiento v1 intacto).
- `can_view_alliance_scope(p_alliance_id)` SECURITY DEFINER + politicas SELECT con scope.
- `match_types` con `scope` CHECK y trigger `trg_validate_match_type_scope`.
- `alliance_invitations` (RLS sin politicas publicas; server-mediated; unica invitacion
  pendiente por alianza+jugador; expira a 7 dias).
- push-notify v14: evento `alliance_invitation` DESPLEGADO (2026-09-25), aditivo.

## Seguridad

- Tokens de jugador verificados via RPC `verify_player_token` en cada request.
- Oficiales = fila activa en `alliance_officers` (jugadores, no auth users): acceso mediado
  por el server.
- Imagenes: base64 -> webp comprimido en el server antes del bucket (mismo criterio que v1).
- Anuncios de alianza: el push lo dispara el trigger existente `trg_alliance_announcement_push`;
  el server v2 NO duplica el envio.

## Optimizacion

Componentes reutilizables + theme unico; objetivo ~50% menos codigo front que el v1.
Auditoria modular completa: 0 colores hardcodeados fuera de `theme.ts` (salvo colores de
marca WhatsApp/Discord/Telegram en AlianzaPage).

## Fase visual (2026-09-25)

Referencia estudiada: fork `yoanlopez500-wq/500X2-TOURNAMENT` (origen
`elkinalejandro30/500X2-TOURNAMENT`, batallonsupremacy.web.app). Tecnicas mapeadas a la
paleta AllianceHub (#0a0e27 / #ff8f00):

| Tecnica del fork | Implementacion v2 |
|---|---|
| CursorTrail (canvas, particulas #d4af37) | `components/CursorTrail.tsx` — particulas #ff8f00, solo pointer:fine |
| ScrollSection (GSAP + ScrollTrigger fade-up) | `components/Reveal.tsx` — IntersectionObserver, sin dependencias |
| Hero slow-zoom (scale 1 -> 1.1) | `.ah-anim-slow-zoom` en el hero de App.tsx |
| Glassmorphism (.glass / .glass-dark) | `.ah-glass` / `.ah-glass-dark` en index.css |
| Glow dorado | `.ah-glow` / `.ah-glow-hover` / `.ah-anim-pulse-glow` en acento naranja |
| Scrollbar personalizada | webkit scrollbar con thumb naranja |
| Gradiente animado | `.ah-anim-gradient-pan` (titulo "2.0" del hero) |

Decision: IntersectionObserver en lugar de GSAP para no inflar el bundle. Se respeta
`prefers-reduced-motion`. La capa visual vive en `web/src/index.css` + `Reveal` +
`CursorTrail`; ninguna pagina redefine animaciones inline.

## Pendiente

- Pruebas end-to-end en local (usuario esta en movil).
- Decision final de cutover de alliancehub.app a v2.
