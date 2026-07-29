# Plan — Sistema de notificaciones push PWA

> Rama: `feature/push-notifications`. Estado: EN IMPLEMENTACIÓN.

## Objetivo
Restaurar el sistema de notificaciones nativas del PWA: avisar cuando (1) aparece una partida pública nueva, (2) aparece una partida de tu alianza, (3) cambia el estado de una partida en la que estás registrado.

## Diagnóstico previo (investigación 2026-07-27)
Sobreviven: VAPID public key (config.js), Edge Function push-notify v4 (con bugs), tabla push_subscriptions (vacía), handler push del Service Worker, helpers de pwa-utils.
Perdido/roto: subscribeToPush, nadie invoca la función, schema 'v2' en la función, payload sin cifrar, tabla queue inexistente, RLS admin-only impide suscripciones de jugadores.

## Diseño

### Eventos y destinatarios (calculados SIEMPRE server-side)
| Evento | Disparo | Destinatarios |
|---|---|---|
| `new_match` | INSERT match status='open', match_type<>'internal' | Todos los suscriptores; si match.alliance_id → solo suscriptores de esa alianza |
| `status_change` | UPDATE matches.status (no-internal) | Suscriptores con match_registrations en esa partida |

### Componentes
1. **`assets/js/push-manager.js`** (nuevo, global `window.AHPush`, pasivo): subscribe(player), unsubscribe, isSubscribed, ensureSubscribed (silencioso si permiso ya concedido). Sin side-effects al cargar → seguro incluirlo en loader core (SW cachea scripts con NetworkFirst → sin riesgo de caché stale).
2. **Hooks**: login-player.js (ensureSubscribed tras login) y game.js (subscribe tras registrarse a partida).
3. **BD**: políticas anon INSERT/DELETE en push_subscriptions (SELECT sigue admin); tabla `push_notification_log(match_id,event,sent_at)` dedupe; función trigger `notify_match_push()` + trigger AFTER INSERT OR UPDATE OF status ON matches → `net.http_post` a la Edge Function (pg_net 0.20.3 ✅). Todo envuelto en EXCEPTION para que un fallo de red NUNCA rompa escrituras de matches.
4. **`supabase/functions/push-notify/index.ts`** (reescrita, ahora versionada en repo): POST-only + header `x-hook-secret`; schema public; cifrado Web Push real (npm:web-push, fallback implementación manual aes128gcm); destinatarios server-side; dedupe vía push_notification_log; `dry_run:true` devuelve recuento sin enviar; borra endpoints 404/410.

### Seguridad
- Hook secreto compartido función↔trigger (spam requiere conocerlo + dedupe limita daño; match_ids falsos no tienen destinatarios).
- Jugadores anon solo pueden INSERT/DELETE suscripciones; SELECT sigue siendo admin.
- verify_jwt=false (la llama pg_net desde la BD).

### Pruebas antes del merge
- Trigger testeado en transacción con ROLLBACK (pg_net encola en tabla transaccional → no sale nada real).
- RLS anon verificada con SET ROLE.
- dry_run de la función tras deploy (prueba también que los secrets VAPID existen).
- node --check + revisión independiente del frontend.
