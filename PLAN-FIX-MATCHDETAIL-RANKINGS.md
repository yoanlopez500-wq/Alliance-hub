# Análisis y plan de arreglo — match-detail + ranking público

> Rama: `analysis/matchdetail-rankings-bugs` (desde main @ 6133e18).
> Estado: **PENDIENTE DE APROBACIÓN**. No se ha aplicado ningún cambio de código ni de datos.
> Fecha: 2026-07-23. Análisis hecho sobre main + BD real (Supabase qkccyjegkgjzwoxytnqp).

---

## 1. Diagnóstico

### Bug A — Ranking público global vacío

**Causa raíz (confirmada en BD):** la regla de "partidas válidas" (commit 8a376fa, 20-jul) + la adaptación a vistas (e397f66, 21-jul) hacen que el ranking exija un INNER JOIN entre `match_results` y `match_registrations` por (match_id, player_id).

Datos reales:

| Partida | Tipo | csv_imported | Resultados | Registros |
|---|---|---|---|---|
| Torneo de las Águilas | public_31 | true | **10** | **0** |
| LGA asalto 1914 | public_31 | false | 0 | 32 (confirmed) |
| GRAN PARTIDA ENTRE ALIANZAS | internal | false | 0 | 25 |

- Pares resultado∩registro = **0** → `public_rankings_view` devuelve **0 filas** (incluso como postgres; no es RLS ni error JS).
- En game.html, el Torneo SÍ muestra sus 10 resultados pero todos con badge "no registrado"; LGA queda oculta por el gate `csv_imported=false`.
- Antes del 20-jul el ranking agregaba TODOS los resultados; por eso "antes salía".

**Descartadas:** RLS bloqueando anon, error JS, filtros por status.

### Bug B — Funciones admin en match-detail

| Función | Estado real |
|---|---|
| Aprobar/rechazar registros | **Existe y funciona** (modal ✏️ → `saveEditRegistration`) |
| Editar username | **Existe y funciona** (mismo modal, con bug menor de comparación) |
| Registrar jugador manualmente | **Nunca existió** — el botón "➕ Añadir" solo hace upsert en `match_results`, NO crea `match_registrations` (por eso salen como "no registrado") |
| Editar UID (player_id) | **Nunca existió** — además inviable hoy: `players.id` tiene 12 FK referenciándola, todas `ON UPDATE NO ACTION` |
| Botones editar/borrar resultados | **Existen pero con race condition**: `loadMatch()` llama `initAdminRole()` DESPUÉS de `loadResults()`, así que en el primer render `currentAdminRole=null` y la columna Acciones no aparece |

**Conexión entre los bugs:** al no existir el registro manual (ni auto-registro en los importadores CSV/API), los jugadores importados nunca tienen `match_registrations` → la regla de "partidas válidas" los filtra → ranking vacío. **El Bug B (falta de registro) es la causa de fondo del Bug A.**

**Dato adicional:** hay 3 cuentas admin con `status='suspended'` (creadas el 03-jul: un superadmin, un event_admin, un moderator). Si tu cuenta es una de esas, perderías acceso completo al panel (redirect + RLS). Verificar en Fase 0.

---

## 2. Plan de arreglo (por fases, modular, sin romper nada)

### FASE 0 — Verificación (sin cambios)
- [ ] Confirmar que la cuenta del usuario y los admins activos tienen `status='active'` en `admin_users`. Si alguno está `suspended` por error → UPDATE puntual (decisión del usuario).

### FASE 1 — Ranking vuelve a mostrar stats (raíz: registros faltantes)

**1A. Auto-registro en importadores** (código, `assets/js/pages/admin-match-detail.js`):
- En `confirmCSVImport()` y `confirmAPIImport()`: tras cada upsert a `match_results`, hacer upsert a `match_registrations` `{match_id, player_id, nation?, status:'confirmed'}` con `onConflict:'match_id,player_id'` (no pisa notas/estado existente si ya está confirmed).
- RLS actual ya lo permite (`match_registrations_admin_all` con is_admin). Mismo patrón modular ya usado; no se tocan módulos core.
- Efecto: toda importación futura alimenta el ranking automáticamente.

**1B. Backfill de datos existentes** (migración SQL, una sola vez):
```sql
INSERT INTO public.match_registrations (match_id, player_id, status)
SELECT DISTINCT mr.match_id, mr.player_id, 'confirmed'
FROM public.match_results mr
JOIN public.matches m ON m.id = mr.match_id
LEFT JOIN public.match_registrations mreg
  ON mreg.match_id = mr.match_id AND mreg.player_id = mr.player_id
WHERE m.csv_imported = true AND mreg.player_id IS NULL;
```
- Efecto inmediato: los 10 resultados del Torneo pasan a ser válidos → el ranking se puebla sin tocar vistas ni frontend público.

**1C. Alternativa (NO recomendada, por si se prefiere):** relajar las vistas `public_rankings_view`/`public_alliance_rankings_view`/`public_match_results_view` con LEFT JOIN + condición `m.csv_imported OR mreg.player_id IS NOT NULL`, y replicar el criterio en `ranking-utils.js`. Más invasiva y diluye la semántica de "válido".

### FASE 2 — Funciones admin en match-detail

**2A. Fix race condition (1 línea):** en `loadMatch()`, llamar `await initAdminRole()` ANTES de `Promise.all([loadRegistrations(), loadResults()])`.

**2B. Nuevo modal "Añadir jugador a la partida"** (`admin/match-detail.html` + `admin-match-detail.js`):
- Botón junto a la sección Registros; campos: player_id (UID), username (opcional), nation (opcional), status (pending/confirmed).
- Lógica: si el player no existe, crearlo (`{id, current_username, status:'active'}` — patrón ya usado en `confirmAPIImport`); luego INSERT/upsert en `match_registrations`.
- Todo dentro del page-script de la página (modularidad); RLS ya lo permite.

**2C. Fix menor en `saveEditRegistration`:** corregir la comparación `username !== reg.player_id` (string vs número, siempre true) comparando contra el username cacheado; asegurar el update de username también en el fallback de BD.

**2D. Edición de UID — requiere decisión:**
- **Opción 1 (recomendada):** migración SQL que recree las 12 FK de `players.id` con `ON UPDATE CASCADE` + hacer editable el campo UID en el modal de registro SOLO para superadmin (`isSuperadmin()`), con confirmación.
- **Opción 2 (conservadora):** no tocar la PK; documentar flujo manual "crear jugador con UID correcto + mover registros".

### FASE 3 — Verificación
- [ ] Importar CSV/API en partida de prueba → jugadores aparecen como registrados y el ranking público los muestra.
- [ ] Aprobar/rechazar registro, editar username, añadir jugador manual, borrar registro.
- [ ] Botones de acciones de resultados visibles en el primer render.
- [ ] Rankings: tabs jugadores/alianzas con datos; game.html muestra resultados sin badge "no registrado" tras el backfill.
- [ ] Admin suspendido (si aplica) recupera acceso.

---

## 3. Archivos que se tocarían

| Archivo | Cambio | Riesgo |
|---|---|---|
| `assets/js/pages/admin-match-detail.js` | 1A (auto-registro en 2 funciones), 2A (1 línea), 2B (función nueva), 2C (fix), 2D-opc1 (UI superadmin) | Bajo: cambios aditivos en page-script |
| `admin/match-detail.html` | 2B (botón + modal nuevo, patrón de modales existente) | Bajo |
| Migración SQL (Supabase) | 1B (backfill INSERT...SELECT) + 2D-opc1 (FK CASCADE, opcional) | Medio en 2D: requiere recrear FKs; probado en orden correcto |

**No se toca:** rankings.js, player.js, game.js, vistas `public_*`, módulos core (loader, auth-core, db-schema, base), flujo de strikes/sanciones, importador API.

## 4. Riesgos y mitigaciones

- **1B duplicados:** el INSERT usa LEFT JOIN anti-nulos + UNIQUE(match_id, player_id) existe → idempotente.
- **1A pisa estado:** usar upsert con ignoreDuplicates o comprobar existencia, para no sobrescribir un 'rejected' deliberado.
- **2D CASCADE:** recrear FKs requiere DROP+ADD por cada una de las 12; se hará en una sola migración transaccional. Sin esta fase, el UID se mantiene de solo lectura (comportamiento actual).
- **Coherencia admin/público:** `ranking-utils.js` (panel admin) y las vistas (público) aplican la misma regla (registro ∪ importado); con 1A+1B ambos lados se alinean sin tocar su código.
