# Notificaciones push Batallon

Extensión de `supabase/functions/push-notify` para partidas `category='batallon'`.

## Eventos

- `new_match` (webhook INSERT en matches, ya existente): si la partida es batallón,
  título `⚔ Nueva partida del Batallon: {name}` y aviso de inscripción por WhatsApp.
- `status_change` (webhook UPDATE en matches, ya existente — debe estar configurado
  en el dashboard, ver `AUDIT-PUSH-NOTIFICATIONS.md`): si es batallón y pasa a
  `in_progress`, los inscritos reciben `⚔ {name} ha comenzado`.
- `batallon_reminder` (nuevo, invocado por pg_cron): body
  `{ "event": "batallon_reminder", "slot": "morning"|"afternoon", "match_id"? }`.
  Busca partidas batallón `status='open'` (o solo la indicada por `match_id`) y envía
  recordatorio a suscriptores con `player_id` que NO tengan registro en esa partida
  (cualquier status frena el recordatorio). Dedupe por día+slot:
  `push_notification_log.event = batallon_reminder:YYYY-MM-DD:{slot}`.

## Cron

`20260827_batallon_push_cron.sql` programa dos jobs diarios (hora Honduras UTC-6):
8:00 (`0 14 * * *` UTC, slot morning) y 15:00 (`0 21 * * *` UTC, slot afternoon).
El `x-hook-secret` se lee de `public.push_config` en tiempo de ejecución (no hardcodeado).

## Verificación

```sql
select * from cron.job;  -- deben aparecer batallon-reminder-morning / -afternoon
```

Dry-run manual (no envía, solo cuenta destinatarios):

```bash
curl -X POST https://qkccyjegkgjzwoxytnqp.supabase.co/functions/v1/push-notify \
  -H "Content-Type: application/json" \
  -H "x-hook-secret: $HOOK_SECRET" \
  -d '{"event":"batallon_reminder","slot":"morning","dry_run":true}'
```
