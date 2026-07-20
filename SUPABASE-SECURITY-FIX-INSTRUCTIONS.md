# Instrucciones para el agente de Supabase — Seguridad + vistas públicas

> **Objetivo:** cerrar las vulnerabilidades del `schema.sql` actualizado **sin romper la funcionalidad pública** (rankings, perfiles, listado de partidas/alianzas).
>
> **Estrategia:** separar lo que debe ser **público** de lo que debe ser **privado**. Para lo público, crear **vistas seguras**; para lo privado, aplicar RLS estricta. Luego el frontend se adapta para usar las vistas donde sea necesario.

---

## 1. Principio general

El frontend necesita datos públicos para:

- Rankings de jugadores y alianzas.
- Perfiles de jugador.
- Listado de partidas públicas y duelos.
- Resultados de partidas (para rankings y perfiles).
- Ganadores de partidas.
- Reglamento.
- Tipos de strikes.

Estos datos **deben seguir siendo legibles de forma controlada**. El resto (tokens, chat, reportes, sanciones, membresías, etc.) **debe estar protegido**.

---

## 2. Vistas públicas que debe crear el agente de Supabase

Crear estas vistas en el schema `public`. El frontend las usará para reemplazar lecturas directas a tablas sensibles.

### 2.1 `public_rankings_view`

Reemplaza lecturas directas a `match_results` + `match_registrations` para rankings.

```sql
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
```

Política: `SELECT` para `public` (anon/authenticated).

```sql
ALTER VIEW public.public_rankings_view OWNER TO postgres;
GRANT SELECT ON public.public_rankings_view TO anon, authenticated;
```

### 2.2 `public_alliance_rankings_view`

Rankings de alianzas basado en kills válidas.

```sql
CREATE OR REPLACE VIEW public.public_alliance_rankings_view AS
SELECT
    a.id AS alliance_id,
    a.name,
    a.tag,
    COUNT(DISTINCT mr.player_id) AS member_count,
    SUM(mr.kills) AS total_kills
FROM public.alliances a
JOIN public.match_results mr ON mr.player_id IN (
    SELECT player_id FROM public.players WHERE current_alliance_id = a.id
)
JOIN public.match_registrations mreg
    ON mreg.match_id = mr.match_id AND mreg.player_id = mr.player_id
JOIN public.matches m ON m.id = mr.match_id
WHERE m.match_type != 'internal'
GROUP BY a.id, a.name, a.tag;

GRANT SELECT ON public.public_alliance_rankings_view TO anon, authenticated;
```

### 2.3 `public_matches_view`

Listado público de partidas **sin credenciales**.

```sql
CREATE OR REPLACE VIEW public.public_matches_view AS
SELECT
    id,
    name,
    match_type,
    status,
    alliance_id,
    alliance_a_id,
    alliance_b_id,
    league_id,
    max_players,
    winners_declared,
    requires_approval,
    is_private,
    created_at
FROM public.matches;

GRANT SELECT ON public.public_matches_view TO anon, authenticated;
```

### 2.4 `public_players_view`

Perfiles públicos de jugadores.

```sql
CREATE OR REPLACE VIEW public.public_players_view AS
SELECT
    id,
    current_username,
    current_alliance_id,
    status,
    total_kills,
    total_deaths,
    games_played,
    last_seen,
    reputation_score
FROM public.players;

GRANT SELECT ON public.public_players_view TO anon, authenticated;
```

> Nota: si `total_kills`, `total_deaths` y `games_played` se recalculan ahora desde `match_results` filtrados, considerar recalcularlos en la vista o mantenerlos como columnas. Esta vista solo las expone.

### 2.5 `public_match_winners_view`

Ganadores de partidas.

```sql
CREATE OR REPLACE VIEW public.public_match_winners_view AS
SELECT
    mw.id,
    mw.match_id,
    mw.player_id,
    mw.position,
    p.current_username
FROM public.match_winners mw
JOIN public.players p ON p.id = mw.player_id;

GRANT SELECT ON public.public_match_winners_view TO anon, authenticated;
```

### 2.6 `public_match_results_view`

Resultados de partidas **solo para jugadores registrados en esa partida** (público en el sentido de que cualquiera puede ver el ranking, pero filtrado por registro).

```sql
CREATE OR REPLACE VIEW public.public_match_results_view AS
SELECT
    mr.id,
    mr.match_id,
    mr.player_id,
    mr.nation,
    mr.kills,
    mr.deaths,
    mr.kd_ratio,
    mr.imported_at
FROM public.match_results mr
JOIN public.match_registrations mreg
    ON mreg.match_id = mr.match_id AND mreg.player_id = mr.player_id;

GRANT SELECT ON public.public_match_results_view TO anon, authenticated;
```

---

## 3. Tablas que deben seguir siendo públicas (lectura)

Estas tablas ya están pensadas para ser públicas. No es necesario crear vistas, pero sí asegurar que no se filtren datos sensibles:

- `alliances` → SELECT público (ya lo es). Verificar que no se expongan campos internos.
- `rule_sections` → SELECT solo `is_active = true` (ya lo es).
- `strike_types` → SELECT público de activos (ya lo es).
- `match_winners` → SELECT público (ya lo es, o reemplazar por vista).
- `match_nullified_kills` → SELECT público para cálculo de rankings; si se prefiere, mover a vista.

---

## 4. Tablas que deben ser privadas y restringidas con RLS

Aplicar RLS estricta. El frontend dejará de leerlas directamente en los lugares públicos y usará las vistas anteriores.

### 4.1 Corregir `is_authenticated_admin()` — CRÍTICO

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

### 4.2 `player_tokens` — privada

Eliminar políticas públicas. Solo el jugador propietario o admin.

```sql
DROP POLICY IF EXISTS "player_tokens_delete" ON public.player_tokens;
DROP POLICY IF EXISTS "player_tokens_insert" ON public.player_tokens;
DROP POLICY IF EXISTS "player_tokens_select" ON public.player_tokens;
DROP POLICY IF EXISTS "player_tokens_update" ON public.player_tokens;

CREATE POLICY "player_tokens_own_or_admin"
ON public.player_tokens FOR ALL TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
)
WITH CHECK (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);
```

> Requiere Fase de autenticación de jugadores (claim `player_id` en JWT).

### 4.3 `alliance_memberships` — privada

```sql
DROP POLICY IF EXISTS "alliance_memberships_delete" ON public.alliance_memberships;
DROP POLICY IF EXISTS "alliance_memberships_insert" ON public.alliance_memberships;
DROP POLICY IF EXISTS "alliance_memberships_select" ON public.alliance_memberships;
DROP POLICY IF EXISTS "alliance_memberships_update" ON public.alliance_memberships;

CREATE POLICY "alliance_memberships_select"
ON public.alliance_memberships FOR SELECT TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
    OR EXISTS (
        SELECT 1 FROM public.admin_users au
        JOIN public.alliances a ON a.id = alliance_memberships.alliance_id
        WHERE au.id = auth.uid()
          AND a.leader_id = (auth.jwt() ->> 'player_id')::bigint
    )
);

CREATE POLICY "alliance_memberships_write_leaders_or_admin"
ON public.alliance_memberships FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_users au
        JOIN public.alliances a ON a.id = alliance_memberships.alliance_id
        WHERE au.id = auth.uid()
          AND (a.leader_id = (auth.jwt() ->> 'player_id')::bigint OR au.role IN ('co_leader','officer'))
    )
    OR is_admin()
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.admin_users au
        JOIN public.alliances a ON a.id = alliance_memberships.alliance_id
        WHERE au.id = auth.uid()
          AND (a.leader_id = (auth.jwt() ->> 'player_id')::bigint OR au.role IN ('co_leader','officer'))
    )
    OR is_admin()
);
```

### 4.4 `chat_messages` — privada

```sql
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert_player" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_public_read" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;

CREATE POLICY "chat_messages_select_participants"
ON public.chat_messages FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.match_registrations mr
        WHERE mr.match_id = chat_messages.channel
          AND mr.player_id = (auth.jwt() ->> 'player_id')::bigint
          AND mr.status IN ('confirmed','approved')
    )
    OR is_admin()
);

CREATE POLICY "chat_messages_insert_participants"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.match_registrations mr
        WHERE mr.match_id = chat_messages.channel
          AND mr.player_id = (auth.jwt() ->> 'player_id')::bigint
          AND mr.status IN ('confirmed','approved')
    )
    OR is_admin()
);
```

### 4.5 `direct_messages` — privada

```sql
DROP POLICY IF EXISTS "direct_messages_admin_access" ON public.direct_messages;
DROP POLICY IF EXISTS "direct_messages_insert" ON public.direct_messages;
DROP POLICY IF EXISTS "direct_messages_select" ON public.direct_messages;

CREATE POLICY "direct_messages_select_parties"
ON public.direct_messages FOR SELECT TO authenticated
USING (
    sender_admin_id = auth.uid()
    OR recipient_admin_id = auth.uid()
    OR recipient_player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);

CREATE POLICY "direct_messages_insert_parties"
ON public.direct_messages FOR INSERT TO authenticated
WITH CHECK (
    sender_admin_id = auth.uid()
    OR (sender_admin_id IS NULL AND (auth.jwt() ->> 'player_id')::bigint IS NOT NULL)
);
```

### 4.6 `match_registrations` — lectura/admin privada

```sql
DROP POLICY IF EXISTS "Allow public read on match_registrations" ON public.match_registrations;
DROP POLICY IF EXISTS "match_registrations_admin_all" ON public.match_registrations;
DROP POLICY IF EXISTS "match_registrations_delete_admin" ON public.match_registrations;
DROP POLICY IF EXISTS "match_registrations_insert_player" ON public.match_registrations;
DROP POLICY IF EXISTS "match_registrations_update_admin" ON public.match_registrations;
DROP POLICY IF EXISTS "match_registrations_update_player" ON public.match_registrations;

CREATE POLICY "match_registrations_select_own_or_admin"
ON public.match_registrations FOR SELECT TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);

CREATE POLICY "match_registrations_insert_player"
ON public.match_registrations FOR INSERT TO authenticated
WITH CHECK (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    AND is_valid_player(player_id)
);

CREATE POLICY "match_registrations_update_player"
ON public.match_registrations FOR UPDATE TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
)
WITH CHECK (
    player_id = (auth.jwt() ->> 'player_id')::bigint
);

CREATE POLICY "match_registrations_delete_player"
ON public.match_registrations FOR DELETE TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);

CREATE POLICY "match_registrations_admin_all"
ON public.match_registrations AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

### 4.7 `match_results` — INSERT/UPDATE/DELETE solo admin

```sql
DROP POLICY IF EXISTS "match_results_insert" ON public.match_results;

CREATE POLICY "match_results_insert_admin"
ON public.match_results AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_admin());
```

La lectura pública se mantiene a través de la vista `public_match_results_view`.

### 4.8 `matches` — INSERT/UPDATE/DELETE solo admin/líder

```sql
DROP POLICY IF EXISTS "matches_insert" ON public.matches;

CREATE POLICY "matches_insert_admin_or_leader"
ON public.matches AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
          AND role = 'alliance_leader'
          AND status = 'active'
          AND (alliance_id = matches.alliance_id OR alliance_id = matches.alliance_a_id)
    )
);
```

### 4.9 `players` — INSERT/UPDATE privado

```sql
DROP POLICY IF EXISTS "players_insert" ON public.players;

CREATE POLICY "players_insert_admin"
ON public.players AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_admin());

CREATE POLICY "players_update_own_or_admin"
ON public.players AS PERMISSIVE FOR UPDATE TO authenticated
USING (
    id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
)
WITH CHECK (
    id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);
```

La lectura pública se mantiene a través de `public_players_view`.

### 4.10 `admin_users` — proteger

```sql
DROP POLICY IF EXISTS "admin_users_insert" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_select" ON public.admin_users;

CREATE POLICY "admin_users_select_admin"
ON public.admin_users AS PERMISSIVE FOR SELECT TO authenticated
USING (is_admin());

CREATE POLICY "admin_users_insert_superadmin"
ON public.admin_users AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_superadmin());
```

### 4.11 `admin_invites` — corregir

```sql
DROP POLICY IF EXISTS "admin_invites_admin_only" ON public.admin_invites;
DROP POLICY IF EXISTS "admin_invites_anon_select_own" ON public.admin_invites;
DROP POLICY IF EXISTS "admin_invites_insert_admin" ON public.admin_invites;

CREATE POLICY "admin_invites_admin_all"
ON public.admin_invites AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_invites_anon_select_own"
ON public.admin_invites AS PERMISSIVE FOR SELECT TO anon
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    AND used = false
    AND expires_at > now()
);
```

> Nota: `anon` no tiene JWT con `player_id`. Esta política probablemente no funcione para anónimos. Si el flujo de invitación de líder requiere que el jugador esté autenticado, cambiar `TO anon` por `TO authenticated`.

### 4.12 `player_reports`, `player_strikes`, `player_sanctions` — privadas

```sql
-- player_reports
DROP POLICY IF EXISTS "player_reports_insert_player" ON public.player_reports;
DROP POLICY IF EXISTS "player_reports_insert_public" ON public.player_reports;
DROP POLICY IF EXISTS "player_reports_select_own" ON public.player_reports;
DROP POLICY IF EXISTS "player_reports_update_admin" ON public.player_reports;

CREATE POLICY "player_reports_select_own_or_admin"
ON public.player_reports AS PERMISSIVE FOR SELECT TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR reported_player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);

CREATE POLICY "player_reports_insert"
ON public.player_reports AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);

CREATE POLICY "player_reports_update_admin"
ON public.player_reports AS PERMISSIVE FOR UPDATE TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- player_strikes
DROP POLICY IF EXISTS "Allow public read on player_strikes" ON public.player_strikes;
DROP POLICY IF EXISTS "player_strikes_delete" ON public.player_strikes;
DROP POLICY IF EXISTS "player_strikes_insert" ON public.player_strikes;
DROP POLICY IF EXISTS "player_strikes_select" ON public.player_strikes;
DROP POLICY IF EXISTS "player_strikes_update" ON public.player_strikes;

CREATE POLICY "player_strikes_admin"
ON public.player_strikes AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "player_strikes_select_own"
ON public.player_strikes AS PERMISSIVE FOR SELECT TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);

-- player_sanctions
DROP POLICY IF EXISTS "player_sanctions_read" ON public.player_sanctions;
DROP POLICY IF EXISTS "player_sanctions_write_admin" ON public.player_sanctions;

CREATE POLICY "player_sanctions_select_own_or_admin"
ON public.player_sanctions AS PERMISSIVE FOR SELECT TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);

CREATE POLICY "player_sanctions_write_admin"
ON public.player_sanctions AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

### 4.13 `rule_sections`, `rule_section_history` — escritura admin

```sql
DROP POLICY IF EXISTS "rule_sections_read" ON public.rule_sections;
DROP POLICY IF EXISTS "rule_sections_write" ON public.rule_sections;
DROP POLICY IF EXISTS "rule_section_history_read" ON public.rule_section_history;
DROP POLICY IF EXISTS "rule_section_history_write" ON public.rule_section_history;

CREATE POLICY "rule_sections_read"
ON public.rule_sections AS PERMISSIVE FOR SELECT TO public
USING (is_active = true);

CREATE POLICY "rule_sections_write_admin"
ON public.rule_sections AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "rule_section_history_read"
ON public.rule_section_history AS PERMISSIVE FOR SELECT TO public
USING (true);

CREATE POLICY "rule_section_history_write_admin"
ON public.rule_section_history AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

### 4.14 `chat_reports` — admin

```sql
DROP POLICY IF EXISTS "chat_reports_admin_only" ON public.chat_reports;
DROP POLICY IF EXISTS "chat_reports_select" ON public.chat_reports;

CREATE POLICY "chat_reports_admin_only"
ON public.chat_reports AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

### 4.15 `push_subscriptions` — propio o admin

```sql
DROP POLICY IF EXISTS "push_subscriptions_admin_only" ON public.push_subscriptions;

CREATE POLICY "push_subscriptions_select_own_or_admin"
ON public.push_subscriptions AS PERMISSIVE FOR SELECT TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);

CREATE POLICY "push_subscriptions_write_own_or_admin"
ON public.push_subscriptions AS PERMISSIVE FOR ALL TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
)
WITH CHECK (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR is_admin()
);
```

---

## 5. Tablas con RLS deshabilitado

Habilitar RLS y crear políticas:

```sql
ALTER TABLE public.alliance_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_transfer_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alliance_officers_select_members"
ON public.alliance_officers FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.alliance_memberships
        WHERE alliance_id = alliance_officers.alliance_id
          AND player_id = (auth.jwt() ->> 'player_id')::bigint
          AND status = 'approved'
    )
    OR is_admin()
);

CREATE POLICY "alliance_officers_write_leaders"
ON public.alliance_officers FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.alliances a
        WHERE a.id = alliance_officers.alliance_id
          AND a.leader_id = (auth.jwt() ->> 'player_id')::bigint
    )
    OR is_admin()
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.alliances a
        WHERE a.id = alliance_officers.alliance_id
          AND a.leader_id = (auth.jwt() ->> 'player_id')::bigint
    )
    OR is_admin()
);

CREATE POLICY "leader_transfer_log_admin"
ON public.leader_transfer_log FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "training_progress_select_own_or_admin"
ON public.training_progress FOR SELECT TO authenticated
USING (
    player_id = (auth.jwt() ->> 'player_id')::bigint
    OR admin_id = auth.uid()
    OR is_admin()
);

CREATE POLICY "training_progress_write_admin"
ON public.training_progress FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

---

## 6. Funciones a corregir

### 6.1 `is_authenticated_admin()`

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

### 6.2 `create_invite_code()`

```sql
CREATE OR REPLACE FUNCTION public.create_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    code text;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Solo administradores pueden crear códigos de invitación';
    END IF;
    -- lógica de generación de código
END;
$$;
```

### 6.3 `generate_transfer_code()` / `claim_transfer_code()`

Mover a Edge Functions que validen el token de jugador. No exponer a público.

---

## 7. Adaptaciones necesarias en el frontend (agente JS)

Una vez que el agente de Supabase crea las vistas y ajusta las políticas, el frontend debe actualizarse en estos puntos:

### 7.1 Rankings públicos

**Archivos:** `assets/js/pages/rankings.js`, `assets/js/pages/admin-rankings.js`

Reemplazar consultas complejas a `match_results` + `match_registrations` por:

```js
// Antes
window.supabase.from('match_results').select('player_id, kills, deaths, match_id, matches!inner(match_type)')

// Después
window.supabase.from('public_rankings_view').select('*')
```

Para rankings de alianzas, usar `public_alliance_rankings_view`.

### 7.2 Perfiles de jugador

**Archivo:** `assets/js/pages/player.js`

Reemplazar lectura de `players` por `public_players_view`:

```js
// Antes
window.supabase.from('players').select('*').eq('id', playerId).single()

// Después
window.supabase.from('public_players_view').select('*').eq('id', playerId).single()
```

Y reemplazar lectura de `match_results` por `public_match_results_view`.

### 7.3 Listado de partidas

**Archivos:** `assets/js/pages/game.js`, `assets/js/pages/leader-dashboard.js`, `assets/js/pages/alliance-panel.js`

Reemplazar lectura de `matches` por `public_matches_view` en listados públicos. En el panel de admin, seguir usando `matches` para edición.

### 7.4 Ganadores de partidas

**Archivo:** `assets/js/pages/game.js`

Reemplazar `match_winners` por `public_match_winners_view`.

### 7.5 Resultados de partidas públicos

**Archivo:** `assets/js/pages/game.js` (loadResults)

Usar `public_match_results_view` en lugar de `match_results`.

### 7.6 Jugadores en general

**Archivos:** `assets/js/pages/admin-players.js`, `assets/js/pages/admin-duel-manager.js`, `assets/js/pages/leader-dashboard.js`

Para lectura de username/alianza en contextos donde no se necesitan datos privados, usar `public_players_view`.

### 7.7 Autenticación de jugadores

**Archivos:** `assets/js/auth-core.js`, `assets/js/base.js`

Es necesario vincular jugadores a Supabase Auth. Sugerencia:

1. Al crear jugador/login, llamar `supabase.auth.signInAnonymously()` o `signInWithPassword`.
2. Luego `supabase.auth.updateUser({ data: { player_id: playerId } })`.
3. Asegurar que el JWT contenga el claim `player_id`.
4. Actualizar `generatePlayerToken` para guardar `user_id` en `player_tokens` si se mantiene la tabla.

Sin este cambio, las políticas RLS que usan `(auth.jwt() ->> 'player_id')` no funcionarán.

---

## 8. Orden de implementación

1. **Crear vistas públicas** (sección 2).
2. **Corregir `is_authenticated_admin()`** (sección 6.1).
3. **Restringir tablas privadas** (sección 4), empezando por las críticas: `player_tokens`, `alliance_memberships`, `admin_users`, `chat_messages`, `direct_messages`.
4. **Habilitar RLS en tablas faltantes** (sección 5).
5. **Actualizar frontend** para usar vistas (sección 7).
6. **Migrar autenticación de jugadores** a Supabase Auth (sección 7.7).
7. **Probar flujos críticos:** login, rankings, registro a partida, chat, panel de admin.

---

## 9. Validación

1. Con `curl` y solo la `anon key`, intentar leer tablas privadas:
   ```bash
   curl "https://qkccyjegkgjzwoxytnqp.supabase.co/rest/v1/player_tokens?select=*" \
     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
   ```
   Debe retornar `[]` o `401`/`403`.

2. Intentar leer vistas públicas:
   ```bash
   curl "https://qkccyjegkgjzwoxytnqp.supabase.co/rest/v1/public_rankings_view?select=*" \
     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
   ```
   Debe retornar datos.

3. Verificar que el frontend sigue mostrando rankings y perfiles.

4. Verificar que admins pueden seguir gestionando partidas, jugadores, strikes y reglas.

---

## 10. Nota importante sobre el modelo de autenticación

Sin migrar la autenticación de jugadores a Supabase Auth, las políticas que usan `auth.jwt() ->> 'player_id'` **no funcionarán**. Por eso el frontend debe actualizarse coordinadamente. Si se necesita una solución intermedia, las operaciones sensibles de jugadores pueden moverse a **Edge Functions** que validen el token de `player_tokens` manualmente, sin depender de RLS por `auth.uid()`.
