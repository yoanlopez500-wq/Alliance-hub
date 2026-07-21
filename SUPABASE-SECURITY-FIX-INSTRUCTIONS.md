# Instrucciones para el agente de Supabase — Seguridad

> **Objetivo:** cerrar las vulnerabilidades del `schema.sql` actualizado **sin romper la funcionalidad existente** y **sin cambiar el modelo de autenticación de jugadores**.
>
> **Modelo de autenticación que se MANTIENE:**
> - **Admins** → Supabase Auth (`auth.users`). Se validan con `is_admin()` / `is_superadmin()`.
> - **Jugadores** → `localStorage` con `player_id` + `token`. **No migrar a Supabase Auth.** El token se valida contra `player_tokens`.
>
> **Estrategia:**
> - Para datos públicos (rankings, perfiles, listados) se mantienen vistas o SELECT público.
> - Para operaciones de jugadores (registro, chat, mensajes, etc.) se usan **Edge Functions** o **RPCs `SECURITY DEFINER`** que validen el token manualmente. **No se puede usar RLS con `auth.uid()` porque los jugadores no usan Supabase Auth.**
> - Para operaciones de admin se usa RLS con `is_admin()` / `is_superadmin()`.

---

## 1. Cambios CRÍTICOS que se aplican YA

### 1.1 Corregir `is_authenticated_admin()`

**Problema:** actualmente solo verifica `auth.role() = 'authenticated'`, es decir, cualquier usuario con sesión de Supabase pasa como admin. Se usa en políticas críticas.

**SQL:**

```sql
CREATE OR REPLACE FUNCTION public.is_authenticated_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN is_admin() AND auth.role() = 'authenticated';
END;
$$;
```

**Impacto:** usuarios autenticados que no estén en `admin_users` con `status='active'` dejarán de poder hacer operaciones de admin. Los admins reales seguirán funcionando.

---

### 1.2 `admin_users` — evitar auto-registro como admin

**Problema:** `admin_users_insert` permite `INSERT TO authenticated WITH CHECK (is_authenticated())`, por lo que cualquier usuario que se registre en Supabase Auth puede insertarse como admin.

**SQL:**

```sql
DROP POLICY IF EXISTS "admin_users_insert" ON public.admin_users;

CREATE POLICY "admin_users_insert_superadmin"
ON public.admin_users AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_superadmin());
```

**Consecuencia:** el flujo de registro de admin con invite (`signupWithInvite` en `auth-core.js`) dejará de funcionar si el frontend inserta `admin_users` directamente. **La creación de `admin_users` debe moverse a una Edge Function o a un trigger en `auth.users` AFTER INSERT** que valide el código de invitación y cree el registro con `SECURITY DEFINER`.

Hasta que se implemente esa Edge Function, dejar esta política como `is_authenticated()` es un riesgo aceptado solo si el flujo de invite es el único camino para crear admins. **Se recomienda implementar la Edge Function lo antes posible.**

---

### 1.3 `admin_users` — no exponer datos a anónimos

```sql
DROP POLICY IF EXISTS "admin_users_select" ON public.admin_users;

CREATE POLICY "admin_users_select_admin"
ON public.admin_users AS PERMISSIVE FOR SELECT TO authenticated
USING (is_admin());
```

---

### 1.4 `match_registrations` — corregir política admin

**Problema:** `match_registrations_admin_all` usa `is_authenticated_admin()` (que estaba roto).

```sql
DROP POLICY IF EXISTS "match_registrations_admin_all" ON public.match_registrations;

CREATE POLICY "match_registrations_admin_all"
ON public.match_registrations AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

> **Nota:** las operaciones de jugadores (registro/desregistro) NO deben hacerse por RLS directo. Deben ir a una Edge Function que valide el token. Ver sección 3.

---

### 1.5 `chat_reports` — corregir política admin

```sql
DROP POLICY IF EXISTS "chat_reports_admin_only" ON public.chat_reports;

CREATE POLICY "chat_reports_admin_only"
ON public.chat_reports AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

---

### 1.6 `rule_sections`, `rule_section_history` — escritura solo admin

```sql
DROP POLICY IF EXISTS "rule_sections_write" ON public.rule_sections;

CREATE POLICY "rule_sections_write_admin"
ON public.rule_sections AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "rule_section_history_write" ON public.rule_section_history;

CREATE POLICY "rule_section_history_write_admin"
ON public.rule_section_history AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

---

### 1.7 `player_sanctions` — escritura solo admin

```sql
DROP POLICY IF EXISTS "player_sanctions_write_admin" ON public.player_sanctions;

CREATE POLICY "player_sanctions_write_admin"
ON public.player_sanctions AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

---

### 1.8 `match_results` — INSERT/UPDATE/DELETE solo admin

```sql
DROP POLICY IF EXISTS "match_results_insert" ON public.match_results;

CREATE POLICY "match_results_insert"
ON public.match_results AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_admin());
```

---

### 1.9 `matches` — INSERT/UPDATE/DELETE solo admin

```sql
DROP POLICY IF EXISTS "matches_insert" ON public.matches;

CREATE POLICY "matches_insert_admin"
ON public.matches AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_admin());
```

> Si se quiere que `alliance_leader` también cree partidas, la política debe verificar que el admin sea `alliance_leader` y que la partida pertenezca a su alianza. El frontend ya envía `created_by` y `alliance_id`, así que es posible ampliarla. Pero por seguridad, mantener solo admin es lo más seguro hasta validar el flujo.

---

### 1.10 `players` — INSERT/UPDATE solo admin

```sql
DROP POLICY IF EXISTS "players_insert" ON public.players;

CREATE POLICY "players_insert_admin"
ON public.players AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_admin());

CREATE POLICY "players_update_admin"
ON public.players AS PERMISSIVE FOR UPDATE TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

> **Impacto:** el login de jugadores y la creación de jugadores desde `login-player.js` y `auth-core.js` dejarán de funcionar si se aplican directamente. **Ver sección 3: estas operaciones deben moverse a Edge Functions.**

---

### 1.11 `alliance_leader_requests` — solo propio/admin

```sql
DROP POLICY IF EXISTS "alliance_leader_requests_select" ON public.alliance_leader_requests;
DROP POLICY IF EXISTS "alliance_leader_requests_insert" ON public.alliance_leader_requests;

CREATE POLICY "alliance_leader_requests_select_admin"
ON public.alliance_leader_requests AS PERMISSIVE FOR SELECT TO authenticated
USING (is_admin());

CREATE POLICY "alliance_leader_requests_insert_admin"
ON public.alliance_leader_requests AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_admin());
```

> El formulario público de solicitud de liderazgo (`apply-leader.js`) deberá enviar a una Edge Function, no insertar directamente.

---

### 1.12 `admin_invites` — corregir

```sql
DROP POLICY IF EXISTS "admin_invites_admin_only" ON public.admin_invites;
DROP POLICY IF EXISTS "admin_invites_anon_select_own" ON public.admin_invites;
DROP POLICY IF EXISTS "admin_invites_insert_admin" ON public.admin_invites;

CREATE POLICY "admin_invites_admin_all"
ON public.admin_invites AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

---

### 1.13 `player_reports`, `player_strikes`, `player_sanctions` — admin

```sql
-- player_reports
DROP POLICY IF EXISTS "player_reports_insert_player" ON public.player_reports;
DROP POLICY IF EXISTS "player_reports_insert_public" ON public.player_reports;
DROP POLICY IF EXISTS "player_reports_select_own" ON public.player_reports;
DROP POLICY IF EXISTS "player_reports_update_admin" ON public.player_reports;

CREATE POLICY "player_reports_admin_all"
ON public.player_reports AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- player_strikes
DROP POLICY IF EXISTS "Allow public read on player_strikes" ON public.player_strikes;
DROP POLICY IF EXISTS "player_strikes_delete" ON public.player_strikes;
DROP POLICY IF EXISTS "player_strikes_insert" ON public.player_strikes;
DROP POLICY IF EXISTS "player_strikes_select" ON public.player_strikes;
DROP POLICY IF EXISTS "player_strikes_update" ON public.player_strikes;

CREATE POLICY "player_strikes_admin_all"
ON public.player_strikes AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- player_sanctions
DROP POLICY IF EXISTS "player_sanctions_read" ON public.player_sanctions;

CREATE POLICY "player_sanctions_admin_all"
ON public.player_sanctions AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

---

### 1.14 `push_subscriptions` — admin o propio vía Edge Function

```sql
DROP POLICY IF EXISTS "push_subscriptions_admin_only" ON public.push_subscriptions;

CREATE POLICY "push_subscriptions_admin_all"
ON public.push_subscriptions AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

> Las suscripciones de jugadores deben gestionarse a través de una Edge Function. Ver sección 3.

---

### 1.15 `alliance_duel_teams` — solo admin

```sql
DROP POLICY IF EXISTS "duel_teams_public_read" ON public.alliance_duel_teams;
DROP POLICY IF EXISTS "duel_teams_write" ON public.alliance_duel_teams;

CREATE POLICY "duel_teams_admin_all"
ON public.alliance_duel_teams AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

> La creación de equipos de duelo desde `admin-duel-manager.js` la hacen admins, así que esto no rompe funcionalidad.

---

## 2. Tablas con RLS deshabilitado

El dump muestra que estas tablas no tienen RLS:

- `alliance_officers`
- `leader_transfer_log`
- `training_progress`

**SQL para habilitar RLS:**

```sql
ALTER TABLE public.alliance_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_transfer_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;
```

**Políticas mínimas:**

```sql
-- alliance_officers: admin
CREATE POLICY "alliance_officers_admin_all"
ON public.alliance_officers FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- leader_transfer_log: admin
CREATE POLICY "leader_transfer_log_admin_all"
ON public.leader_transfer_log FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- training_progress: admin
CREATE POLICY "training_progress_admin_all"
ON public.training_progress FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

> Nota: `alliance_officers` también se gestiona desde el frontend de líder (`admin-officers.js`). Si el líder es admin en `admin_users`, esto funciona. Si no, se necesita una política adicional o una Edge Function.

---

## 3. Edge Functions requeridas para operaciones de jugadores

Como los jugadores **no usan Supabase Auth**, las operaciones de jugadores deben validarse mediante el token de `player_tokens` en una Edge Function. El frontend enviará `player_id` y `token` en el body o header, y la función hará el trabajo con privilegios elevados.

### Edge Functions necesarias

| Función | Operación | Tablas que toca |
|---|---|---|
| `register-for-match` | Registrar jugador en partida | `match_registrations` |
| `unregister-from-match` | Desregistrar jugador | `match_registrations` |
| `send-chat-message` | Enviar mensaje en chat de partida | `chat_messages` |
| `send-direct-message` | Enviar mensaje privado | `direct_messages` |
| `subscribe-push` | Registrar suscripción push | `push_subscriptions` |
| `create-player` | Crear/actualizar jugador y token | `players`, `player_tokens` |
| `request-leader` | Enviar solicitud de liderazgo | `alliance_leader_requests` |
| `request-alliance-membership` | Unirse a alianza | `alliance_memberships` |
| `cancel-alliance-membership` | Cancelar solicitud de alianza | `alliance_memberships` |

### Plantilla mínima de Edge Function (Deno)

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const { player_id, token, match_id } = await req.json();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // Validar token
  const { data: tokenRow } = await supabase
    .from('player_tokens')
    .select('token')
    .eq('player_id', player_id)
    .eq('token', token)
    .maybeSingle();

  if (!tokenRow) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Validar que el jugador esté activo
  const { data: player } = await supabase
    .from('players')
    .select('status')
    .eq('id', player_id)
    .single();

  if (!player || player.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Player not active' }), { status: 403 });
  }

  // Ejecutar operación
  const { error } = await supabase
    .from('match_registrations')
    .insert({ match_id, player_id, status: 'pending' });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
```

> **Importante:** las Edge Functions usan `SERVICE_ROLE_KEY` y **saltan RLS**. Por eso es crítico validar el token y la lógica de negocio dentro de la función.

---

## 4. Vistas públicas para rankings y perfiles

Para mantener el sitio público funcionando, crear estas vistas:

```sql
-- Rankings de jugadores
CREATE OR REPLACE VIEW public.public_rankings_view AS
SELECT
    mr.player_id,
    p.current_username,
    p.current_alliance_id,
    a.name AS alliance_name,
    a.tag AS alliance_tag,
    SUM(mr.kills) AS total_kills,
    SUM(mr.deaths) AS total_deaths,
    COUNT(*) AS games_played
FROM public.match_results mr
JOIN public.match_registrations mreg
    ON mreg.match_id = mr.match_id AND mreg.player_id = mr.player_id
JOIN public.matches m ON m.id = mr.match_id
JOIN public.players p ON p.id = mr.player_id
LEFT JOIN public.alliances a ON a.id = p.current_alliance_id
WHERE m.match_type != 'internal'
GROUP BY mr.player_id, p.current_username, p.current_alliance_id, a.name, a.tag;

GRANT SELECT ON public.public_rankings_view TO anon, authenticated;

-- Rankings de alianzas
CREATE OR REPLACE VIEW public.public_alliance_rankings_view AS
SELECT
    a.id AS alliance_id,
    a.name,
    a.tag,
    COUNT(DISTINCT mr.player_id) AS member_count,
    SUM(mr.kills) AS total_kills
FROM public.alliances a
JOIN public.players p ON p.current_alliance_id = a.id
JOIN public.match_results mr ON mr.player_id = p.id
JOIN public.match_registrations mreg
    ON mreg.match_id = mr.match_id AND mreg.player_id = mr.player_id
JOIN public.matches m ON m.id = mr.match_id
WHERE m.match_type != 'internal'
GROUP BY a.id, a.name, a.tag;

GRANT SELECT ON public.public_alliance_rankings_view TO anon, authenticated;

-- Partidas públicas (sin credenciales)
CREATE OR REPLACE VIEW public.public_matches_view AS
SELECT
    id, name, match_type, status, alliance_id, alliance_a_id, alliance_b_id,
    league_id, max_players, winners_declared, requires_approval, is_private, created_at
FROM public.matches;

GRANT SELECT ON public.public_matches_view TO anon, authenticated;

-- Perfiles públicos de jugadores
CREATE OR REPLACE VIEW public.public_players_view AS
SELECT
    id, current_username, current_alliance_id, status,
    total_kills, total_deaths, games_played, last_seen, reputation_score
FROM public.players;

GRANT SELECT ON public.public_players_view TO anon, authenticated;

-- Ganadores de partidas
CREATE OR REPLACE VIEW public.public_match_winners_view AS
SELECT
    mw.id, mw.match_id, mw.player_id, mw.position, p.current_username
FROM public.match_winners mw
JOIN public.players p ON p.id = mw.player_id;

GRANT SELECT ON public.public_match_winners_view TO anon, authenticated;

-- Resultados de partidas filtrados por registro
CREATE OR REPLACE VIEW public.public_match_results_view AS
SELECT
    mr.id, mr.match_id, mr.player_id, mr.nation, mr.kills, mr.deaths, mr.kd_ratio, mr.imported_at
FROM public.match_results mr
JOIN public.match_registrations mreg
    ON mreg.match_id = mr.match_id AND mreg.player_id = mr.player_id;

GRANT SELECT ON public.public_match_results_view TO anon, authenticated;
```

---

## 5. Adaptaciones del frontend (agente JS)

Una vez que el agente de Supabase implemente lo anterior, el frontend debe actualizarse:

### 5.1 Rankings

En `rankings.js`, `admin-rankings.js`, `leader-dashboard.js`, `player.js`, `admin-players.js`, `admin-duel-manager.js`:

Reemplazar consultas directas a `match_results` + `match_registrations` por `public_rankings_view`.

```js
// Antes
window.supabase.from('match_results').select('...')

// Después
window.supabase.from('public_rankings_view').select('*')
```

### 5.2 Perfiles públicos

En `player.js`, `game.js`, `admin-players.js`:

```js
window.supabase.from('public_players_view').select('*').eq('id', playerId).single()
```

### 5.3 Listado de partidas

En `game.js`, `leader-dashboard.js`, `alliance-panel.js`, `dashboard.js`, `landing.js`:

```js
window.supabase.from('public_matches_view').select('*')
```

### 5.4 Ganadores

En `game.js`:

```js
window.supabase.from('public_match_winners_view').select('*').eq('match_id', matchId)
```

### 5.5 Resultados públicos

En `game.js`:

```js
window.supabase.from('public_match_results_view').select('*').eq('match_id', matchId)
```

### 5.6 Operaciones de jugadores → Edge Functions

En `auth-core.js`, `base.js`, `game.js`, `alliance-panel.js`, `apply-leader.js`, `login-player.js`:

Reemplazar inserciones/actualizaciones directas en tablas privadas por llamadas a Edge Functions:

```js
// Ejemplo: registro en partida
await fetch('/functions/v1/register-for-match', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    player_id: playerData.playerId,
    token: playerData.token,
    match_id: matchId
  })
});
```

### 5.7 Operaciones de admin

Las operaciones de admin (panel, partidas, strikes, reglas) siguen usando las tablas directamente con Supabase Auth. No cambian, salvo que el agente de Supabase haya restringido alguna tabla a solo admin (lo cual es correcto).

---

## 6. Orden de implementación

1. **Crear vistas públicas** (sección 4).
2. **Corregir `is_authenticated_admin()`** (sección 1.1).
3. **Aplicar políticas de admin** (sección 1.2 a 1.15).
4. **Habilitar RLS en tablas faltantes** (sección 2).
5. **Actualizar frontend** para usar vistas (sección 5.1 a 5.5).
6. **Crear Edge Functions** para operaciones de jugadores (sección 3 y 5.6).
7. **Probar flujos críticos:**
    - Login de admin
    - Panel de admin
    - Rankings públicos
    - Perfil de jugador
    - Registro en partida (vía Edge Function)
    - Chat de partida (vía Edge Function)

---

## 7. Validación

1. Con `curl` y solo la `anon key`, intentar leer tablas privadas:
   ```bash
   curl "https://qkccyjegkgjzwoxytnqp.supabase.co/rest/v1/admin_users?select=*" \
     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
   ```
   Debe retornar `[]` o `401`/`403`.

2. Intentar leer vistas públicas:
   ```bash
   curl "https://qkccyjegkgjzwoxytnqp.supabase.co/rest/v1/public_rankings_view?select=*" \
     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
   ```
   Debe retornar datos.

3. Verificar que un jugador autenticado con token pueda registrarse en una partida a través de la Edge Function.

4. Verificar que un admin pueda crear partidas, importar resultados y aplicar strikes.

---

## 8. Nota final sobre el modelo de jugadores

**No se modifica el modelo de autenticación de jugadores.** Los jugadores siguen usando `player_id` + `token` en `localStorage`. La seguridad de estas operaciones se delega a Edge Functions que validan el token contra `player_tokens` y ejecutan operaciones con `SERVICE_ROLE_KEY`. Las tablas privadas se cierran completamente a escritura pública.
