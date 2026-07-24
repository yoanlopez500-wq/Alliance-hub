# Plan refinado — Chat + Duelos 5v5 (Alliance-Hub)

> Rama: `analysis/chat-duels-improvement`. Estado: **IMPLEMENTADO** (pendiente de merge a main).
> Última actualización: 2026-07-23.

## DECISIONES APROBADAS POR EL USUARIO
1. **FIFO GLOBAL de 5000 mensajes** (no por canal).
2. **Chat solo para usuarios autenticados con rol** (superadmin, event_admin, moderator, alliance_leader, co_leader, officer). **Sin chat de jugadores**: la sección de chat de game.html/game.js se eliminó y la RLS de chat_messages cierra el acceso anon.
3. **Fuente de verdad única en `matches`** — `alliance_duel_teams` no se usa; botón "Guardar Equipo" eliminado.
4. **Duelos abiertos Y dirigidos** (abierto: alliance_b_id NULL; dirigido: solo la alianza retada puede aceptar).
5. **Ganador automático por kills** agregadas por bando (trigger en match_results; empate → NULL).

## IMPLEMENTADO — Base de datos (migraciones aplicadas en qkccyjegkgjzwoxytnqp)
- `chat_channels` (tabla nueva, 5 canales seed, RLS: read admin / write superadmin).
- `chat_messages`: RLS solo authenticated+is_admin(); id con IDENTITY (bug corregido: los INSERT sin id fallaban); trigger FIFO global 5000 (eliminado trigger viejo de 30/canal); índices; en publicación realtime.
- `direct_messages`: RLS privada (select/insert/update según remitente/destinatario/admin); en publicación realtime.
- `matches.winner_alliance_id` + funciones `recompute_duel_winner`/`trg_recompute_duel_winner` + trigger (probado: gana A, cambia a B al editar kills, empate → NULL).
- Vista `public_duel_standings_view` (jugados/ganados/perdidos/empatados/puntos) con GRANT anon.

## IMPLEMENTADO — Frontend (commits hasta 11ed6e7)
- `loader.js`: role chat carga core (bug que rompía el chat); shim auth.js eliminado.
- `chat-channels.js` (nuevo): canales+permisos por rol.
- `chat.js`: canales desde BD, realtime, reportes corregidos, DMs reales en direct_messages, jerarquía unificada (co_leader/officer incluidos).
- `admin/chat.html` → redirige a chat.html (implementación divergente eliminada).
- `game.js`/`game.html`: chat de jugadores eliminado; fix match.password.
- `admin-duel-manager.js/html`: duelos abiertos + dirigidos, lista de abiertos, aceptar (con guardias anti-secuestro y anti-duplicado), mis duelos con ganador; botón Guardar Equipo eliminado.
- `rankings.js`: tab Duelos con lista + tabla de standings.

## Hallazgos de la revisión aplicados
- C1 (crítico): duelos dirigidos ya no son secuestrables (filtro alliance_b_id null o = mi alianza + guardia en acceptDuel).
- M1: guardia anti doble-init (evita duelos duplicados por doble click de listeners).

## Menores conocidos (no bloqueantes)
- M3: canales con alliance_id no filtran por alianza del usuario aún (RLS los protege: solo admins).
- M4: escape de comillas en atributos onclick de chat.js.
- M6: badge 'awaiting_opponent' sin estilo en game.html (texto crudo).
- Mejora futura: alianzas sin resultados no aparecen en public_alliance_rankings_view (INNER JOIN) — pasar a LEFT JOIN si se quiere.

---

# Plan original (análisis completo)

## PARTE 1 — CHAT (diagnóstico)
El chat estaba roto por: loader.js sin core para role chat (window.supabase undefined) + shim auth.js con document.write; publicación realtime vacía; reportes con columna inexistente; 3 implementaciones divergentes; DMs pseudo-privados públicos; id de chat_messages sin autoincremento. Resuelto todo arriba.

## PARTE 2 — DUELOS (diagnóstico)
0 duelos históricos; createDuel nacía en draft invisible; alliance_duel_teams huérfana; sin ganador ni puntos. Resuelto con la máquina de estados awaiting_opponent→open→in_progress→finished, winner_alliance_id automático y standings.
