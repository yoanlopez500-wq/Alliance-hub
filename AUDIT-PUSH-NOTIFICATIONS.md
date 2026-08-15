# Auditoría del sistema de notificaciones push — Alliance Hub

Fecha: 2026-08-15 · Rama: `audit/push-notifications` · Estado: **SOLO ANÁLISIS Y PLAN (sin implementación)**

---

## 1. Resumen ejecutivo

La infraestructura push **existe y está bien diseñada en papel** (clave VAPID pública, Service Worker con handlers `push`/`notificationclick`, Edge Function `push-notify` v7 ACTIVE, tablas `push_subscriptions` y `push_notification_log` con RLS), pero **en producción el sistema está muerto de punta a punta** por 5 fallos independientes. Cualquiera de ellos por sí solo basta para que nadie reciba nada:

| # | Fallo | Efecto |
|---|-------|--------|
| F1 | No existe ningún botón/switch en la UI para activar notificaciones | El usuario nunca puede dar permiso de forma fiable |
| F2 | El Service Worker solo se registra en `index.html` y `chat.html` | En el resto de páginas `serviceWorker.ready` hace timeout (5s) y la suscripción falla en silencio |
| F3 | `AHPush.subscribe()` se llama fuera de un gesto de usuario (tras awaits de red) | Chrome bloquea/ignora `Notification.requestPermission` |
| F4 | **Nada invoca la Edge Function `push-notify`**: ni webhooks de BD, ni triggers, ni código | Aunque hubiera suscripciones, nunca se enviaría nada |
| F5 | El envío real en `push-notify` devuelve **500 no controlado** (crash en `webpush.setVapidDetails`) → secrets VAPID mal configurados en la función | Aunque se invocara, el envío falla |

**Evidencia en BD (verificado 2026-08-15):**
- `push_subscriptions`: **0 filas** (nadie se ha suscrito jamás).
- `push_notification_log`: **0 filas** (nunca se ha enviado nada).
- Políticas RLS: `INSERT`/`DELETE` públicos OK; **sin SELECT para anon** (la UI no puede consultar el estado); `ALL` para authenticated (admins).

**Pruebas en vivo contra `push-notify`:**
- `dry_run` con `x-hook-secret` válido → **200 OK** (`{"dry_run":true,"recipients":0,...}`) → la función arranca, accede a la BD y el secret funciona.
- Sin secret → **401** correcto.
- Envío real (con suscripción de prueba falsa e incluso con 0 destinatarios, evento ocurrido también a las 02:05 antes de esta auditoría) → **500 "Internal Server Error"** (texto plano = excepción no capturada). La función tiene checks propios que devolverían JSON `{"error":"missing env VAPID_PRIVATE_KEY"}`; al no ver ese JSON, el crash ocurre en `webpush.setVapidDetails(...)` → **los secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` de la función están ausentes en runtime, vacíos o con formato inválido**.

---

## 2. Detalle de hallazgos

### F1 — Sin UI para activar/desactivar (el "botón" no existe)
- `assets/js/push-manager.js` (`window.AHPush`) es un módulo pasivo correcto, pero solo se invoca en 2 sitios:
  - `assets/js/pages/login-player.js:76` → `AHPush.ensureSubscribed(...)`: **silencioso por diseño** — solo actúa si el permiso YA estaba concedido. Nunca pide permiso → nadie nuevo entra.
  - `assets/js/pages/register-index.js:168-170` → `AHPush.subscribe(playerActual)` tras registrarse en una partida.
- No hay ningún botón "Activar notificaciones" ni switch on/off en ninguna página (grep completo del repo). La "lista de personas con permiso" que se espera ver está vacía porque la tabla está vacía (F1+F2+F3).

### F2 — Service Worker no registrado en la mayoría de páginas
- El registro del SW vive en `sw-register.js`, incluido **solo en `index.html` y `chat.html`**.
- `push-manager.js` espera `navigator.serviceWorker.ready` con timeout de 5s. Si el usuario entra directo a `register/`, `login-player.html`, `game.html`, etc. y nunca pasó por `index.html` en ese navegador → no hay SW activo → `subscribe()` falla en silencio (catch con `console.warn`).

### F3 — Prompt de permiso fuera de gesto de usuario
- En `register-index.js`, `subscribe()` se ejecuta después de varios `await` (upsert del registro). Chrome exige engagement/gesto para mostrar el prompt de notificaciones; fuera de gesto puede auto-denegar o no mostrar nada. Además, si el usuario denegó una vez, no hay UI para recuperarlo.

### F4 — Nadie llama a `push-notify`
- Grep completo del repo: **0 referencias** a `push-notify` en el frontend (correcto: el secret no puede ir en el navegador).
- `supabase_functions.hooks` no existe → **no hay Database Webhooks** configurados.
- No hay triggers Postgres que la llamen (ni `pg_net`).
- Resultado: ni "nueva partida" (para jugadores con login no registrados) ni "cambio de estado" (para registrados) se disparan jamás.

### F5 — Secrets VAPID de la función rotos
- El código de `push-notify` v7 es correcto (auth por `x-hook-secret`, dedupe post-envío, borrado de endpoints 404/410, `dry_run`), pero el envío real crashea con 500 no controlado en `setVapidDetails` → verificar/regenerar los secrets `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (la pública debe ser idéntica a la de `assets/js/config.js`) y `VAPID_SUBJECT`.
- Secundario: `HOOK_SECRET` está hardcodeado en el código fuente de la función. Debe pasar a env (`PUSH_HOOK_SECRET`) para poder rotarlo sin redeploy.

### F6 — Menores
- Anon no tiene SELECT sobre `push_subscriptions`: la UI no puede mostrar "estás suscrito" desde la BD (alternativa: leer `registration.pushManager.getSubscription()` del navegador — recomendado — o política SELECT por endpoint).
- `subscribe()` inserta sin `.select()` (correcto por RLS) pero traga errores: sin telemetría no nos enteramos de fallos.
- `auth-core.js` contiene helpers push legacy duplicados (`subscribeToPushNotifications`, upsert onConflict) que no se usan → deuda/confusión.

---

## 3. Plan de arreglo e implantación (por fases, cada una verificable)

### Fase 0 — Configuración Supabase (prerequisito, ~15 min)
1. Regenerar par VAPID (`npx web-push generate-vapid-keys`) o recuperar la privada correspondiente a la pública actual de `config.js`. Si no se tiene la privada, **generar par nuevo y actualizar `config.js`**.
2. Dashboard → Edge Functions → Secrets:
   - `VAPID_PUBLIC_KEY` = pública (87 chars base64url, igual que `config.js`)
   - `VAPID_PRIVATE_KEY` = privada
   - `VAPID_SUBJECT` = `mailto:` real del admin
   - `PUSH_HOOK_SECRET` = secreto nuevo aleatorio
3. Verificación: `curl` con `dry_run` (200) + suscripción real de prueba → respuesta `{"success":true,"sent":1,...}`. Eliminar la suscripción de prueba.

### Fase 1 — Frontend: que la gente pueda suscribirse (código)
1. **SW global**: mover la inclusión de `sw-register.js` a `loader.js` (core) para que el SW se registre en TODAS las páginas (admin/register incluidos, cuidando BASE path).
2. **Componente de notificaciones** (nuevo `assets/js/components/push-toggle.js`):
   - Botón/banner "🔔 Activar notificaciones" visible tras login de jugador y en `register/index.html` ANTES de completar el registro.
   - **Switch on/off** en el perfil del jugador (`player.html` o dashboard): refleja estado real combinando `Notification.permission` + `registration.pushManager.getSubscription()`; ON → `AHPush.subscribe(player)` dentro del click (gesto ✔); OFF → `unsubscribeFromPush()` real (ya existe en `pwa-utils.js`).
   - Estados: no soportado / denegado (instrucciones para re-habilitar en el navegador) / activado / desactivado.
3. `AHPush.subscribe` se invoca **solo desde gestos de usuario** (click), nunca tras awaits.
4. **Vinculación**: en `login-player.js`, si existe suscripción del navegador con `player_id` distinto/nulo, hacer UPDATE por endpoint para asociarla al jugador logueado (necesita política UPDATE por endpoint o hacerlo vía DELETE+INSERT, que ya está permitido).
5. Limpieza: eliminar helpers push legacy de `auth-core.js` o hacerlos delegar en `AHPush`.

### Fase 2 — Backend: que se disparen los envíos
**Opción A (recomendada) — Database Webhooks (Dashboard, sin código):**
1. Webhook 1: tabla `matches`, evento **INSERT** (filtro `status = 'open'`) → POST a `.../functions/v1/push-notify` con header `x-hook-secret: <PUSH_HOOK_SECRET>` y body `{"match_id": "{{ record.id }}", "event": "new_match"}`.
   - Cobertura del requisito "avisar a los que tienen player login aunque no estén en la partida": la función ya envía `new_match` a todas las suscripciones de la alianza (o a todas si la partida es global). ✔
2. Webhook 2: tabla `matches`, evento **UPDATE** de `status` → body `{"match_id": "{{ record.id }}", "event": "status_change"}` → la función ya filtra a inscritos `confirmed/approved`. ✔
3. El dedupe de `push_notification_log` evita duplicados por reintentos del webhook. ✔

**Opción B (si se prefiere SQL)**: triggers con `pg_net` + secret en Vault. Más control, más mantenimiento. No recomendada salvo necesidad.

**Modificación de la función** (redeploy v8):
- Leer `PUSH_HOOK_SECRET` de env en vez del hardcode.
- Envolver `setVapidDetails`/envío en try/catch global que devuelva JSON de error (nunca 500 plano).
- Log estructurado de cada envío (`console.log` con match_id/event/sent/failed) para auditoría vía logs.

### Fase 3 — QA end-to-end (con limpieza)
1. Usuario de prueba AUDIT-PUSH: login → activar switch → verificar fila en `push_subscriptions`.
2. Crear partida de prueba → webhook → notificación recibida en el navegador (verificación real).
3. Cambiar estado de la partida → segunda notificación solo a inscritos.
4. Switch OFF → fila eliminada → sin más notificaciones.
5. Verificar `push_notification_log` (dedupe) y borrado de endpoints muertos (404/410).
6. **Limpieza total** de datos AUDIT-PUSH (suscripciones, logs, partida, registros, usuario).

### Orden de despliegue propuesto
1. PR-A (config + función v8 + fase 0) → verificación con curl.
2. PR-B (frontend fase 1) → merge → los usuarios ya pueden suscribirse.
3. Activar webhooks (fase 2) → QA fase 3.
*Motivo del orden: no activar webhooks antes de que la función envíe bien (F5) ni antes de que existan suscriptores.*

### Riesgos / notas
- iOS Safari: push web solo en PWA instalada (iOS ≥16.4). El banner debe explicarlo ("Añadir a pantalla de inicio").
- Cambiar el par VAPID invalida suscripciones antiguas → irrelevante hoy (0 filas) pero documentado por si acaso.
- El `tag` de la notificación (`match-{id}-{event}`) evita spam de duplicados en el navegador. ✔
- Partidas "finished" antiguas: no crear webhooks retroactivos; solo eventos nuevos.
