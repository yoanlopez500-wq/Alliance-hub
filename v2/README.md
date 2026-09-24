# AllianceHub 2.0 — Big Update

Rewrite del nucleo de AllianceHub con Node.js (backend) + React (componentes).

## Regla absoluta
- `main` y produccion (alliancehub.app) NO se tocan. Todo el trabajo ocurre en la rama `ah-v2/big-update`.
- El v1 sigue sirviendose desde `main` en GitHub Pages sin cambios.

## Estructura
- `v2/web` — Frontend React + Vite + TypeScript (componentes, reemplaza los IIFE con window.* del v1)
- `v2/server` — Backend Node.js (Fastify) + supabase-js: API propia, auth de sesiones, push, webhooks
- `v2/docs` — Decisiones de arquitectura y plan de migracion

## Features del Big Update (decididas)
1. Sanciones/strikes por alianza: visibles solo para la alianza que las puso + admins/superadmin. Excepcion: expediente completo de un jugador en transferencia (lider receptor ve globales + de la alianza previa).
2. Mercado de transferencias: panel Jugadores -> expediente publico -> Invitar -> notificacion destacada en la seccion Alianzas del jugador -> perfil publico de la alianza -> aceptar/rechazar.
3. Tipos de partida administrables desde superadmin: alcances global / interna-estandar (medida por AllianceHub) / exclusiva (una alianza).

## Estado
Scaffold inicial. Stack: React + Vite + TS (web), Fastify (server), Supabase (DB, proyecto nuevo en desarrollo).
