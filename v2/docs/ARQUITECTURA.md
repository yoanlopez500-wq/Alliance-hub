# Decisiones de arquitectura — AllianceHub 2.0

## Stack
- Web: React 18 + Vite + TypeScript + react-router. Los "componentes" reemplazan los IIFE con window.* del v1.
- Server: Node.js + Fastify. Asume la logica que hoy vive en edge functions + validaciones a nivel app.
- DB: Supabase (Postgres + RLS + Auth). PROYECTO NUEVO en desarrollo; el proyecto del v1 queda solo para produccion.

## Seguridad (heredada del v1, reforzada)
- RLS en cada tabla: sanciones de alianza aisladas con join a admin_users (patron probado en v1).
- service_role SOLO en server/. El browser nunca lo ve; las keys anon se usan solo para lecturas publicas.
- Tipos de partida exclusivos: validacion en dropdown Y trigger BEFORE INSERT (doble candado).

## Migracion de datos (cutover)
1. Schema v2 se aplica al proyecto nuevo.
2. Dump de datos del proyecto v1 -> restore en proyecto nuevo (jugadores, partidas, resultados, strikes globales).
3. Strikes de alianza y tipos de partida nuevos nacen en v2, sin migracion.
4. alliancehub.app apunta al build de v2 cuando el usuario lo autorice.

## Pendiente de decision
- Proyecto Supabase nuevo: se crea desde el MCP de supabase o lo crea el usuario.
