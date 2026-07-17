# Instrucciones para Supabase: Sistema de Strikes, Baneos y Reglamento

> **Documento para la versión de Kimi con acceso a Supabase.**  
> Ejecutar paso a paso en el SQL Editor de Supabase (projeto `qkccyjegkgjzwoxytnqp`).

---

## 1. Objetivo

Poner en marcha el backend necesario para que funcionen:

- `admin-strikes.js` (crear/revocar strikes y aplicar bans)
- `admin-reports.js` (revisar reportes y resolverlos)
- `admin-sanctions-engine.js` (fórmulas de penalización en JSON)
- `report.js` (envío de reportes con evidencia)
- `login-player.js`, `game.js`, `register/index.html` (bloqueo de baneados/suspendidos)
- `rankings.js` y `player.js` (cálculo de kills efectivas por fórmulas)

---

## 2. Tablas que deben existir

Si ya existen, solo verifica las columnas. Si no existen, crea las tablas con el DDL de abajo.

### 2.1 `players` — columnas nuevas

La tabla `players` ya existe. Agrega estas columnas si faltan:

```sql
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS banned_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

-- Asegurar que el status acepte 'banned' y 'suspended'
-- (Si tenías un CHECK o dominio personalizado, actualízalo)
```

### 2.2 `strike_types`

```sql
CREATE TABLE IF NOT EXISTS public.strike_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE,
    name text NOT NULL,
    description text NOT NULL,
    severity int4 CHECK (severity BETWEEN 1 AND 3) DEFAULT 1,
    legend text,
    is_active bool DEFAULT true,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES public.admin_users(id),
    nullifies_kills bool DEFAULT false,
    formula_id uuid,
    is_preset bool DEFAULT false,
    is_ban bool DEFAULT false,
    ban_duration_hours int4,
    rule_section_id uuid REFERENCES public.rule_sections(id)
);

ALTER TABLE public.strike_types ENABLE ROW LEVEL SECURITY;
```

### 2.3 `player_strikes`

```sql
CREATE TABLE IF NOT EXISTS public.player_strikes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id bigint NOT NULL REFERENCES public.players(id),
    strike_type_id uuid NOT NULL REFERENCES public.strike_types(id),
    match_id uuid REFERENCES public.matches(id),
    reason text NOT NULL,
    applied_by uuid REFERENCES public.admin_users(id),
    applied_at timestamptz DEFAULT now(),
    removed_by uuid,
    removed_at timestamptz,
    removal_reason text,
    notes text,
    rule_section_id uuid REFERENCES public.rule_sections(id),
    report_id uuid REFERENCES public.player_reports(id),
    status text DEFAULT 'active',
    evidence_urls text[] DEFAULT '{}',
    expires_at timestamptz
);

ALTER TABLE public.player_strikes ENABLE ROW LEVEL SECURITY;
```

### 2.4 `player_reports`

```sql
CREATE TABLE IF NOT EXISTS public.player_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid REFERENCES public.matches(id),
    player_id bigint REFERENCES public.players(id),
    player_name text,
    reported_player_id int4 REFERENCES public.players(id),
    reported_player_name text,
    report_type text NOT NULL,
    description text,
    evidence_urls text[] DEFAULT '{}',
    status text DEFAULT 'pending',
    admin_response text,
    strike_applied bool DEFAULT false,
    strike_id uuid REFERENCES public.player_strikes(id),
    created_at timestamptz DEFAULT now(),
    resolved_at timestamptz,
    resolved_by uuid REFERENCES public.admin_users(id),
    rule_section_id uuid REFERENCES public.rule_sections(id)
);

ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;
```

### 2.5 `player_sanctions`

```sql
CREATE TABLE IF NOT EXISTS public.player_sanctions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id bigint NOT NULL REFERENCES public.players(id),
    strike_id uuid REFERENCES public.player_strikes(id),
    strike_type_id uuid REFERENCES public.strike_types(id),
    formula_id uuid,
    kills_before int4 DEFAULT 0,
    points_before int4 DEFAULT 0,
    status_before text,
    kills_after int4 DEFAULT 0,
    points_after int4 DEFAULT 0,
    status_after text,
    penalty_pct numeric DEFAULT 0,
    reputation_delta int4 DEFAULT 0,
    formula_used text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.player_sanctions ENABLE ROW LEVEL SECURITY;
```

---

## 3. Políticas RLS recomendadas

### Función auxiliar: detectar admin activo

Usa esta función para simplificar las políticas de administrador:

```sql
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid()
      AND status = 'active'
  );
$$;
```

### 3.1 `strike_types`

```sql
-- Lectura pública de tipos activos
CREATE POLICY "strike_types_select_public"
ON public.strike_types FOR SELECT
USING (is_active = true);

-- Escritura solo para admins activos
CREATE POLICY "strike_types_write_admin"
ON public.strike_types FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());
```

### 3.2 `player_strikes`

```sql
-- Lectura pública (rankings y perfiles necesitan ver strikes activos)
CREATE POLICY "player_strikes_select_public"
ON public.player_strikes FOR SELECT
USING (status = 'active');

-- Escritura solo para admins activos
CREATE POLICY "player_strikes_write_admin"
ON public.player_strikes FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());
```

### 3.3 `player_reports`

```sql
-- Inserción pública (jugadores anónimos envían reportes)
CREATE POLICY "player_reports_insert_public"
ON public.player_reports FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Lectura pública para listado del admin
CREATE POLICY "player_reports_select_public"
ON public.player_reports FOR SELECT
USING (true);

-- Actualización solo para admins activos
CREATE POLICY "player_reports_update_admin"
ON public.player_reports FOR UPDATE
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());
```

### 3.4 `player_sanctions`

```sql
-- Lectura pública (rankings y perfiles)
CREATE POLICY "player_sanctions_select_public"
ON public.player_sanctions FOR SELECT
USING (true);

-- Escritura solo para admins activos
CREATE POLICY "player_sanctions_write_admin"
ON public.player_sanctions FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());
```

### 3.5 `players` — actualizar status/ban solo admin

```sql
-- SELECT e INSERT ya deberían estar abiertos en tu proyecto.
-- Esta política permite que solo admins actualicen status/banned_until/suspended_until.
CREATE POLICY "players_update_admin_only"
ON public.players FOR UPDATE
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());
```

---

## 4. Datos iniciales (seed) para `strike_types`

El frontend espera tipos de strike con fórmulas JSON en la columna `legend`. Ejecuta:

```sql
INSERT INTO public.strike_types (code, name, description, severity, legend, is_active, is_preset, nullifies_kills, is_ban, ban_duration_hours)
VALUES
  ('strike_1', 'Strike Leve - Advertencia', 'Penalización leve del 10% en kills efectivas', 1, '{"penalty_pct":10,"nullifies_kills":false,"is_ban":false}', true, true, false, false, null),
  ('strike_2', 'Strike Medio - Sanción Temporal', 'Penalización del 30% en kills efectivas', 2, '{"penalty_pct":30,"nullifies_kills":false,"is_ban":false}', true, true, false, false, null),
  ('strike_3', 'Strike Grave - Expulsión Parcial', 'Penalización del 50% en kills efectivas', 3, '{"penalty_pct":50,"nullifies_kills":false,"is_ban":false}', true, true, false, false, null),
  ('ban_temp_7d', 'Ban Temporal 7 días', 'Cuenta bloqueada durante 7 días', 3, '{"penalty_pct":0,"nullifies_kills":false,"is_ban":true,"ban_duration_hours":168}', true, true, false, true, 168),
  ('ban_perm', 'Ban Permanente', 'Cuenta bloqueada permanentemente', 3, '{"penalty_pct":0,"nullifies_kills":false,"is_ban":true,"ban_duration_hours":null}', true, true, false, true, null),
  ('kill_nullifier', 'Nullificador de Kills', 'Anula todas las kills del jugador', 3, '{"penalty_pct":100,"nullifies_kills":true,"is_ban":false}', true, true, true, false, null)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  severity = EXCLUDED.severity,
  legend = EXCLUDED.legend,
  is_active = EXCLUDED.is_active,
  nullifies_kills = EXCLUDED.nullifies_kills,
  is_ban = EXCLUDED.is_ban,
  ban_duration_hours = EXCLUDED.ban_duration_hours;
```

---

## 5. Nota crítica sobre ocultar credenciales a baneados

Actualmente los jugadores usan sesiones anónimas guardadas en `localStorage` (`ah_v2_player_id`, `ah_v2_player_token`). **Supabase RLS no puede identificar a un jugador anónimo por su token personalizado**, por lo que no es posible ocultar `matches.game_id` / `matches.password` únicamente con políticas de fila.

### Opciones recomendadas para endurecer esto:

1. **Edge Function (más sencilla)**  
   Crear `GET /get-match-credentials` que reciba `match_id` + `player_token`, valide el token en la tabla `players` y solo devuelva `game_id`/`password` si el jugador no está baneado/suspendido y está registrado aprobado.

2. **Migrar sesiones de jugador a Supabase Auth**  
   Usar Magic Link / OTP para que cada jugador tenga un `auth.users` real. Entonces RLS puede identificar al jugador y aplicar políticas como:

   ```sql
   CREATE POLICY "matches_hide_credentials_banned"
   ON public.matches FOR SELECT
   USING (
     (game_id IS NULL AND password IS NULL)
     OR NOT EXISTS (
       SELECT 1 FROM public.players
       WHERE id = (auth.jwt() ->> 'player_id')::bigint
         AND (
           status = 'banned'
           OR (status = 'suspended' AND suspended_until > now())
         )
     )
   );
   ```

3. **Dejar el control en frontend + alertar**  
   Mantener la validación actual en `game.js`, `register/index.html` y `login-player.js`, pero documentar que un usuario técnico avanzado podría bypassearla.

> **Recomendación del equipo:** implementar al menos la Edge Function de la opción 1 para proteger las credenciales de partida.

---

## 6. Limpieza automática de bans expirados (opcional)

Puedes crear una función y un cron job en Supabase para limpiar bans vencidos:

```sql
CREATE OR REPLACE FUNCTION public.clear_expired_bans()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.players
  SET status = 'active',
      banned_until = null,
      suspended_until = null,
      suspension_reason = null
  WHERE (status = 'banned' AND banned_until IS NOT NULL AND banned_until <= now())
     OR (status = 'suspended' AND suspended_until IS NOT NULL AND suspended_until <= now());
$$;
```

Luego programa un cron diario en Supabase:

```sql
SELECT cron.schedule('clear-expired-bans', '0 0 * * *', 'SELECT public.clear_expired_bans();');
```

El frontend ya limpia bans expirados al iniciar sesión, pero esto asegura consistencia en BD.

---

## 7. Verificación rápida

Después de ejecutar todo, confirma en Supabase:

1. **SQL Editor:** `SELECT * FROM public.player_strikes LIMIT 1;` debe devolver 200, no 404.
2. **Table Editor:** `strike_types`, `player_strikes`, `player_reports`, `player_sanctions` aparecen y tienen RLS activado.
3. **Auth > Policies:** las políticas de arriba existen.
4. **Frontend admin panel:**
   - Crear un strike tipo `ban_temp_7d` en un jugador de prueba.
   - Ver que `players.status = 'banned'` y `banned_until` se llenó.
   - Con ese jugador, intentar ver una partida: no debe mostrar ID/contraseña.
5. **Reporte:** enviar un reporte desde `report.html`, verlo en `admin/reports.html` y aplicar strike desde ahí.

---

## 8. Si algo falla

- Error `404` en `player_strikes`: la tabla no existe, ejecuta el DDL.
- Error `401` al crear strike: el usuario admin no aparece en `admin_users` con `status = 'active'`.
- Error `403` al insertar reporte: revisa la política INSERT de `player_reports`.
- No se aplica ban: revisa que `strike_types.is_ban = true` y `ban_duration_hours` tenga valor (o null para permanente).

---

## 9. Referencia de columnas usadas por el frontend

| Tabla | Columnas críticas para el frontend |
|-------|-----------------------------------|
| `players` | `id`, `current_username`, `status`, `total_kills`, `total_deaths`, `games_played`, `banned_until`, `suspended_until`, `suspension_reason` |
| `strike_types` | `id`, `code`, `name`, `description`, `severity`, `legend`, `is_active`, `nullifies_kills`, `is_ban`, `ban_duration_hours`, `rule_section_id` |
| `player_strikes` | `id`, `player_id`, `strike_type_id`, `match_id`, `reason`, `notes`, `applied_by`, `status`, `evidence_urls`, `report_id`, `expires_at`, `rule_section_id`, `removed_at`, `removed_by`, `removal_reason` |
| `player_reports` | `id`, `match_id`, `player_id`, `player_name`, `reported_player_id`, `reported_player_name`, `report_type`, `description`, `evidence_urls`, `status`, `admin_response`, `strike_applied`, `strike_id`, `created_at`, `resolved_at`, `resolved_by`, `rule_section_id` |
| `player_sanctions` | `id`, `player_id`, `strike_id`, `strike_type_id`, `penalty_pct`, `kills_before`, `kills_after`, `status_before`, `status_after`, `formula_used`, `created_at` |
| `matches` | `id`, `name`, `status`, `match_type`, `game_id`, `password`, `requires_approval`, `is_private`, `alliance_id`, `created_at` |
| `match_registrations` | `id`, `match_id`, `player_id`, `status`, `registered_at` |

---

## 10. Checklist final

- [ ] DDL ejecutado en Supabase SQL Editor
- [ ] RLS habilitado en las 4 tablas nuevas
- [ ] Políticas creadas
- [ ] Seed de `strike_types` insertado
- [ ] Columnas `banned_until` / `suspended_until` agregadas a `players`
- [ ] Función `is_active_admin()` creada
- [ ] (Opcional) Edge Function para credenciales creada
- [ ] (Opcional) Cron `clear_expired_bans` programado
- [ ] Prueba en navegador de creación de strike y ban exitoso
