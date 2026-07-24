# Plan refinado — Chat + Duelos 5v5 (Alliance-Hub)

> Rama: `analysis/chat-duels-improvement` (desde main @ 647661b).
> Estado: **PENDIENTE DE APROBACIÓN**. Análisis sobre main + BD real. Nada aplicado.
> Restricción del usuario: no afectar producción; cambios BD solo en lo que ya está roto (chat).
> Fecha: 2026-07-23.

---

# PARTE 1 — CHAT

## 1.1 Diagnóstico: por qué el chat no funciona

**Causa principal (determinista, en código):** en `assets/js/loader.js`, el role `'chat'` carga solo `['assets/js/auth.js','assets/js/base.js']` y **omite SCRIPTS.core**, que incluye el CDN de supabase-js y `config.js` (donde nace `window.supabase`). → `chat.js` llama `window.supabase.auth.getSession()` con `window.supabase === undefined` → TypeError inmediato → pantalla congelada en "Verificando acceso…". Agravante: `auth.js` es un shim DEPRECATED que usa `document.write` (ignorado/destructivo al cargarse dinámicamente).

**Causas secundarias:**
1. **Realtime muerto**: la publicación `supabase_realtime` está **vacía** (0 tablas). `admin/chat.html` depende solo de postgres_changes → nunca llega nada en vivo.
2. **Reportes rotos**: `chat.js` inserta columna `message_preview` que no existe en `chat_reports` (la real es `reported_message_id`).
3. **Jerarquía de roles inconsistente**: `chat.js` define su propia jerarquía (sin co_leader/officer, niveles distintos a `roles-data.js`) → co_leader/officer ven "Acceso Restringido" pese a tener el enlace en su nav.
4. **Canales divergentes**: 3 implementaciones escriben canales distintos en la misma tabla (`admin_global`+`dm:*` en chat.html, `general/anuncios/soporte` en admin/chat.html, `matchId` en game.js).
5. **DMs pseudo-privados pero públicos**: los DMs de chat.js son filas de `chat_messages` con SELECT público → cualquiera con la anon key los lee.
6. `direct_messages` y `chat_reports`: existen pero 0 filas (nunca usados).

**Único flujo que SÍ funciona hoy:** chat de partida en `game.js` (jugadores anon insertan en `channel = matchId`, recarga manual). Hay que protegerlo de cualquier endurecimiento.

## 1.2 Evaluación del plan del usuario

| Propuesta | Veredicto | Comentario |
|---|---|---|
| Canales por tipo con `allowed_roles` | ✅ Aprobada — no existe tabla de canales | Crear `chat_channels` |
| Jerarquía superadmin>admin>líder | ✅ Aprobada | Unificar con `roles-data.js` (superadmin 5 → officer 1) |
| "Solo usuarios autenticados" | ⚠️ Matizar | Jugadores NO tienen Supabase Auth; el chat de partida debe quedar fuera del endurecimiento o ir a Edge Function (fase posterior) |
| DMs en tabla separada | ✅ Ya existe `direct_messages` | Consolidar ahí y darle privacidad real |
| Límite global 5000 con FIFO | ⚠️ Sugerencia: **FIFO por canal** | Un canal ruidoso borraría el historial de los demás; mismo trigger, agrupado por `channel` |
| Trigger PostgreSQL para el borrado | ✅ Correcto | AFTER INSERT, trivial y seguro |
| RLS por rol | ✅ Por fases | Ver 1.4 — hacerlo de golpe rompe el chat de partida (jugadores anon) |

## 1.3 Plan por fases (chat)

**FASE 0 — Resucitar lo roto (sin tocar lo que funciona)**
- `loader.js`: que role 'chat' cargue `SCRIPTS.core` y quitar el shim `auth.js` (cargar los módulos reales).
- `chat.js`: corregir `message_preview` → `reported_message_id`; unificar jerarquía con `roles-data.js` (incluir co_leader/officer).
- BD (seguro, aditivo): `ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages, public.direct_messages;`
- Resultado: chat.html y admin/chat.html vuelven a funcionar sin migraciones de datos.

**FASE 1 — Estructura de canales**
- Nueva tabla `chat_channels`: `id text PK` (permite 'admin_global' y matchIds como texto), `name`, `type` (`general|admin|leader|alliance|match|dm`), `allowed_roles text[]`, `alliance_id uuid NULL`, `created_by uuid`, `is_active bool default true`, `created_at`.
- Seed con los canales actuales (admin_global, alliance_global, general, anuncios, soporte) mapeando sus roles.
- `chat_messages`: añadir índice `(channel, created_at DESC)`; mantener `channel text` por compatibilidad con canales de partida.
- Frontend: consolidar en UNA sola UI de chat (chat.html) leyendo canales desde la tabla (visibles = intersección rol/canal); admin/chat.html pasa a ser la misma UI o redirige. Módulos: `assets/js/chat-channels.js` (canales+permisos), `assets/js/pages/chat.js` (UI).

**FASE 2 — FIFO por canal (trigger)**
```sql
CREATE OR REPLACE FUNCTION public.chat_fifo_prune() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE max_msgs int := 500; -- por canal, configurable en system_config si se desea
BEGIN
  DELETE FROM public.chat_messages WHERE channel = NEW.channel AND id IN (
    SELECT id FROM public.chat_messages WHERE channel = NEW.channel
    ORDER BY created_at DESC, id DESC OFFSET max_msgs
  );
  RETURN NEW;
END $$;
CREATE TRIGGER trg_chat_fifo AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.chat_fifo_prune();
```
- Límite por canal (sugerencia: 500/canal en vez de 5000 global). Si se quiere global además, mismo patrón sin `WHERE channel`.

**FASE 3 — DMs reales + RLS por fases**
- DMs se consolidan en `direct_messages` (ya tiene sender_admin_id, recipient_admin_id, recipient_player_id, read_at): política SELECT solo sender/recipient o `is_admin()`; INSERT solo authenticated. Se eliminan los pseudo-DMs `dm:*` de chat_messages (migración de los pocos que haya, opcional).
- RLS de `chat_messages` por fases:
  - 3a: SELECT restringido por tipo de canal (canales admin/leader → `is_admin()`/rol adecuado; canales `match` → se MANTIENE público de momento para no romper el chat de partida de jugadores).
  - 3b (posterior, con Edge Function `send-chat-message`): cerrar INSERT público y mover el chat de jugadores a la Edge Function con token (como ya prevé el plan de seguridad general).
- Realtime respeta RLS en postgres_changes: verificar tras 3a que cada rol solo recibe lo que puede leer.

## 1.4 Archivos afectados (chat)
| Archivo | Cambio | Riesgo |
|---|---|---|
| `assets/js/loader.js` | Fase 0: role chat carga core | Bajo (solo afecta a chat.html, hoy roto) |
| `assets/js/pages/chat.js` | Fases 0-3 | Medio (reescritura parcial) |
| `assets/js/chat-channels.js` | NUEVO (módulo de canales/permisos) | Nulo |
| `admin/chat.html` + `admin-chat.js` | Unificar/redirigir | Bajo |
| Migraciones BD | chat_channels, índice, trigger FIFO, publicación realtime, RLS fase 3 | Bajo (todo aditivo; el chat de jugadores se preserva) |

---

# PARTE 2 — DUELOS 5v5

## 2.1 Estado real

- `admin/duel-manager.html` + `admin-duel-manager.js`: el líder elige 5 jugadores de su alianza y `createDuel()` crea un `matches` `match_type='duel'` con `alliance_a_id` (propia) y `alliance_b_id` (rival fijada de antemano) + registra a los 5 en `match_registrations` (confirmed). **Funciona, pero nace en `status='draft'` → invisible en game.html** (que exige 'open').
- **0 duelos en la BD** (nunca se completó el flujo). Campo libre: sin migración de datos.
- `alliance_duel_teams`: tabla **huérfana** (0 filas, 0 referencias en el frontend). Columnas: id, alliance_id, match_id (null), player_ids int[], status default 'forming', timestamps.
- El botón "Guardar Equipo" del duel-manager **es un toast vacío** (no persiste nada).
- Ranking: `loadDuels()` lista matches duel desde `public_matches_view` (ya expone A y B); no hay noción de ganador de alianza ni puntos; `match_winners` es por jugador y también está a 0 filas.
- RLS: matches/match_registrations admin-only en escritura; los líderes SON admin_users → encaja sin cambios de RLS.

## 2.2 Evaluación del plan del usuario

| Propuesta | Veredicto | Comentario |
|---|---|---|
| Propuesta de duelo con 5 jugadores | ✅ Ya existe a medias (createDuel) | FALTA: que no sea un match fantasma en draft |
| Lista de "Duelos abiertos" + aceptación | ✅ Aprobada — no existe | Duelo con `alliance_b_id NULL` + estado `awaiting_opponent`; aceptar fija B + registra equipo rival + pasa a `open` |
| `alliance_duel_teams.status` | ⚠️ Columna ya existe | Sugerencia: NO resucitarla como entidad separada; fuente de verdad única en `matches`. Usarla solo como "roster guardado" o eliminar el botón |
| `opponent_team_id`/`match_id` | ⚠️ `match_id` ya existe | No hace falta opponent_team_id si el modelo es matches-centric |
| Puntos por duelos ganados en ranking | ✅ Aprobada — no existe | Nueva columna `matches.winner_alliance_id` + vista de standings; declaración manual por admin al terminar (simple y auditable) |

## 2.3 Plan por fases (duelos)

**FASE 0 — BD mínima (aditiva)**
```sql
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS winner_alliance_id uuid NULL REFERENCES public.alliances(id);
ALTER TABLE public.alliance_duel_teams ADD CONSTRAINT duel_teams_status_check
  CHECK (status IN ('forming','ready','in_progress','finished')); -- si se conserva la tabla
```
- Convención de estados para duelos sobre `matches.status`: `awaiting_opponent → open → in_progress → finished` (documentada; los tipos existentes no cambian).
- Vista nueva `public_duel_standings_view` (alliance_id, name, tag, duelos_jugados, duelos_ganados, puntos=ganados*3) desde matches `match_type='duel' AND status='finished'` + GRANT a anon/authenticated.
- **No modificar** `public_alliance_rankings_view` salvo, en fase posterior, añadir `duel_points` con LEFT JOIN (la actual es INNER JOIN y las alianzas sin resultados desaparecen — ojo si se toca).

**FASE 1 — Flujo líder (extender `admin-duel-manager.js`, misma página, modular)**
- Al crear: opción "duelo abierto" (`alliance_b_id=NULL`, status `awaiting_opponent`) o "desafío dirigido" (como hoy, pero status `awaiting_opponent` hasta aceptación, o `open` si se acuerda fuera).
- Nueva sección "Duelos abiertos": query `match_type='duel' AND status='awaiting_opponent'` desde `public_matches_view`.
- Botón "Aceptar" (líder de otra alianza): UPDATE `alliance_b_id`, status `open` + INSERT de sus 5 jugadores en `match_registrations`. Con la RLS actual (admin authenticated) ya es posible.
- "Guardar Equipo": persistir en `alliance_duel_teams` (resucitándola como roster) o eliminar el botón. Decisión del usuario.

**FASE 2 — Finalización y visualización**
- Declarar ganador: botón en `admin-match-detail` (solo duelos finished) que setee `winner_alliance_id`. Automático por kills agregadas: fase posterior opcional.
- `rankings.js → loadDuels()`: mostrar A vs B, estado, ganador; mini-tabla de standings desde `public_duel_standings_view`.
- `game.js`: corregir bug `game_password`→`password`; mostrar rosters por lado (ya tiene loadRegistrations); resultados entran por el pipeline CSV/API existente sin cambios.

## 2.4 Archivos afectados (duelos)
| Archivo | Cambio | Riesgo |
|---|---|---|
| `assets/js/pages/admin-duel-manager.js` | Fases 1 (estados, abiertos, aceptar, roster) | Medio (página aislada, 0 uso actual) |
| `admin/duel-manager.html` | Secciones nuevas (Tailwind, patrón existente) | Bajo |
| `assets/js/pages/rankings.js` | loadDuels + standings | Bajo |
| `assets/js/pages/game.js` | bug password + rosters | Bajo |
| Migración BD | winner_alliance_id + vista standings (+CHECK) | Bajo (aditivo) |

---

# PARTE 3 — SUGERENCIAS TRANSVERSALES

1. **Orden recomendado**: Chat Fase 0 primero (resucita el chat sin riesgo y es lo que más se nota) → Duelos Fase 0-1 (campo libre, 0 datos) → Chat Fases 1-3 → Duelos Fase 2.
2. **FIFO por canal, no global** (un canal activo no debe borrar el historial de otros).
3. **Una sola jerarquía de roles**: `roles-data.js` como fuente en frontend y una función SQL `role_level(text)` si se necesita en RLS; eliminar la jerarquía paralela de chat.js.
4. **Una sola UI de chat** consumiendo `chat_channels`: menos código, menos divergencia. Los canales de partida (`type='match'`) se crean automáticamente al crear la partida (o se infieren por convención `channel=matchId` sin fila en chat_channels, para no romper lo actual).
5. **No resucitar `alliance_duel_teams` como entidad paralela**: fuente de verdad única en `matches` + `match_registrations` (coherente con rankings, importadores y game.html ya existentes).
6. **Todo con Tailwind** en los modales/secciones nuevas, siguiendo el patrón visual actual de modales del admin (gradiente header + cards), y page-scripts separados por página (nada de lógica inline en HTML).
7. **Cada fase = un commit** en esta rama (o rama `feature/chat-duels` cuando se apruebe), para poder mergear por partes sin bloquear producción.

## Decisiones que necesito de ti
1. Chat: ¿FIFO por canal (sugerido 500/canal) o global 5000 como decía tu plan?
2. Chat de partida (jugadores): ¿lo dejamos público de momento (Fase 3a) y lo migramos a Edge Function después, o lo incluyes en esta iteración?
3. Duelos: ¿`alliance_duel_teams` la usamos como roster guardado o eliminamos el botón "Guardar Equipo"?
4. Duelos abiertos vs dirigidos: ¿ambos flujos o solo dirigido como hoy?
5. Ganador de duelo: ¿manual por admin (sugerido) o automático por kills?
