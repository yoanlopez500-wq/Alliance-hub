# Alliance Hub - Plan de Migracion Tecnica

> Rama: `feature/refactor-arquitectura`
> Fecha: 2026-07-14
> Version del analisis: 1.0

---

## 1. DIAGNOSTICO: Problemas Identificados

### 1.1 CSS: Anti-patterns con Tailwind
| Problema | Severidad | Archivos afectados |
|----------|-----------|-------------------|
| Bloque `<style>` con `body{...}` duplicado | CRITICO | 8+ HTML |
| `theme.js` inyecta clases CSS hibridas (.bg-ah-bg) | CRITICO | Todos los HTML |
| `rankings.html` redefine clases ah-* en `<style>` | CRITICO | rankings.html |
| Animaciones CSS duplicadas (fadeIn, msgIn, pulse) | ALTO | index.html, chat.html, multiples |
| Colores hardcodeados en inline styles | ALTO | Todos los HTML |
| Estilos modal duplicados | MEDIO | game.html, admin/* |

### 1.2 JS: Inline en HTML
| Archivo | Lineas JS inline | Funciones principales |
|---------|-----------------|----------------------|
| `chat.html` | ~400 | init, loadAdmins, switchChan, sendMessage, renderMsgs |
| `game.html` | ~250 | loadMatch, loadWinners, loadChat, loadRegistrations, loadResults |
| `rankings.html` | ~200 | loadRankings, loadAlliances, loadDuels, loadStrikes, effectiveKills |
| `index.html` | ~100 | loadStats, loadLandingRules, loadLandingPrecedents, waitForSupabase |
| `rules.html` | ~80 | loadRules, loadPrecedents, renderSection |
| `dashboard.html` | ~60 | loadMatches, loadAlliancesMap, getAlliance |
| `login.html` | ~50 | showTab, form handlers, autoLoginAdmin |
| `admin/index.html` | ~30 | Auth check DOMContentLoaded |

### 1.3 Funciones Duplicadas entre Modulos
| Funcion | Ubicacion 1 | Ubicacion 2 | Accion |
|---------|-------------|-------------|--------|
| `getPlayerData` | base.js | nav-engine.js (como getPlayerDataNav) | Consolidar en base.js, eliminar duplicado |
| `hasPlayerSession` | auth-core.js | nav-engine.js | Consolidar en base.js |
| `registerForMatch` | base.js | auth-core.js | Eliminar de auth-core.js |
| `unregisterFromMatch` | base.js | auth-core.js | Eliminar de auth-core.js |
| `getPlayerMatches` | base.js | auth-core.js | Eliminar de auth-core.js |
| `generatePlayerToken` | base.js | auth-core.js | Eliminar de auth-core.js |
| `verifyPlayerToken` | base.js | auth-core.js | Eliminar de auth-core.js |
| `verifyPlayerLogin` | base.js | auth-core.js | Eliminar de auth-core.js |
| `subscribeToPushNotifications` | base.js | auth-core.js | Eliminar de auth-core.js |
| `unsubscribePush` | base.js | auth-core.js | Eliminar de auth-core.js |
| `urlBase64ToUint8Array` | base.js | auth-core.js | Eliminar de auth-core.js |

### 1.4 Cache-Busting
| Problema | Impacto |
|----------|---------|
| `?v=27` y `?v=28` coexisten | Cache inconsistente |
| VERSION = "28" | Solo un numero, no hash |
| bump.sh usa sed | Fragil, puede romper URLs |
| Sin automatizacion | Requiere intervencion manual |

---

## 2. PLAN DE EJECUCION

### Fase 1: Infraestructura (Cimientos)

#### Tarea 1.1: Cache-Buster Automatico
- **Archivo nuevo:** `assets/js/cache-buster.js`
- **Funcion:** Genera un hash unico por deploy usando un timestamp almacenado en una variable global
- **Mecanismo:** `window.__AH_BUILD_ID` se genera una sola vez por carga de pagina. Todos los scripts usan esta variable para append `?h=<hash>`
- **Reemplaza:** El sistema manual `?v=XX` y bump.sh

#### Tarea 1.2: CSS Theme Unificado
- **Archivo nuevo:** `assets/css/theme.css`
- **Contenido:**
  - CSS Variables del tema dark (colores Alliance Hub)
  - Clases utilitarias personalizadas (.bg-ah-bg, .text-ah-text, etc.) como capa sobre Tailwind
  - Animaciones centralizadas (fadeIn, slideUp, msgIn, pulse, typing-dot)
  - Estilos de scrollbar
  - Estilos de modal
  - Reset de formularios para tema oscuro
- **Elimina:** Bloques `<style>` duplicados de todos los HTML
- **Reemplaza:** Las inyecciones CSS de theme.js

#### Tarea 1.3: Loader de Scripts Centralizado
- **Archivo nuevo:** `assets/js/loader.js`
- **Funcion:** Carga los scripts core en el orden correcto, usando el cache-buster automatico
- **Elimina:** Las 8-12 etiquetas `<script src="...">` duplicadas en cada HTML
- **Uso:** Cada HTML solo carga `loader.js` y luego su pagina especifica

---

### Fase 2: Extraccion de JS (Pagina por pagina)

#### Tarea 2.1: index.html → landing.js
- **Archivo nuevo:** `assets/js/pages/landing.js`
- **Extrae:** waitForSupabase, loadStats, loadLandingRules, loadLandingPrecedents
- **Verificacion:** Las funciones se ejecutan igual tras DOMContentLoaded

#### Tarea 2.2: login.html → login.js
- **Archivo nuevo:** `assets/js/pages/login.js`
- **Extrae:** showTab, autoLoginAdmin, form handlers

#### Tarea 2.3: dashboard.html → dashboard.js
- **Archivo nuevo:** `assets/js/pages/dashboard.js`
- **Extrae:** loadAlliancesMap, getAlliance, loadMatches

#### Tarea 2.4: game.html → game.js
- **Archivo nuevo:** `assets/js/pages/game.js`
- **Extrae:** loadMatch, loadWinners, loadChat, sendChatMessage, loadRegistrations, loadResults, goToRegister

#### Tarea 2.5: rankings.html → rankings.js
- **Archivo nuevo:** `assets/js/pages/rankings.js`
- **Extrae:** loadData, loadRankings, loadAlliances, loadDuels, loadStrikes, loadSanctions, effectiveKills, getPenaltyPct, showTab

#### Tarea 2.6: rules.html → rules.js
- **Archivo nuevo:** `assets/js/pages/rules.js`
- **Extrae:** loadRules, loadPrecedents, renderSection

#### Tarea 2.7: chat.html → chat.js
- **Archivo nuevo:** `assets/js/pages/chat.js`
- **Extrae:** TODO el sistema de chat (~400 lineas)

#### Tarea 2.8: admin/index.html → admin-dashboard.js
- **Archivo nuevo:** `assets/js/pages/admin-dashboard.js`
- **Extrae:** Auth check DOMContentLoaded

---

### Fase 3: Limpieza de CSS en HTML

#### Tarea 3.1: Eliminar bloques `<style>` duplicados
- Reemplazar el bloque `body{...}` por clases Tailwind: `class="bg-ah-bg text-ah-text font-sans"`
- Usar el theme.css centralizado

#### Tarea 3.2: Convertir inline styles a clases Tailwind
- Reemplazar `style="color:#ff6f00"` → `class="text-orange-500"`
- Reemplazar `style="background:#0a0e27"` → `class="bg-ah-bg"`
- Reemplazar `style="border:1px solid #1a237e"` → `class="border border-indigo-900"`

#### Tarea 3.3: Limpiar theme.js
- Eliminar la inyeccion de `<style>` dinamica
- theme.js solo maneja el toggle dark/light + clase .dark
- Todos los estilos se mueven a theme.css

---

### Fase 4: Deduplicacion

#### Tarea 4.1: Consolidar funciones en base.js
- base.js es el single source of truth para utilidades
- auth-core.js solo contiene funciones exclusivas de auth (login, logout, roles, permisos)

#### Tarea 4.2: Actualizar nav-engine.js
- Usar `getPlayerData()` de base.js en lugar de `getPlayerDataNav()`
- Usar `hasPlayerSession()` de base.js/auth-core.js

#### Tarea 4.3: Limpiar auth-core.js
- Eliminar todas las funciones que ya existen en base.js
- Verificar que auth-core.js sigue exportando todo lo necesario

---

### Fase 5: Actualizar HTML finales

Cada HTML actualizado sigue este template:
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Titulo - Alliance Hub</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="assets/css/theme.css">
  <script src="assets/js/cache-buster.js"></script>
  <script src="assets/js/loader.js"></script>
</head>
<body class="bg-ah-bg text-ah-text font-sans" data-role="...">
  <!-- Contenido limpio, sin JS inline -->
  <script src="assets/js/pages/pagina.js"></script>
</body>
</html>
```

---

### Fase 6: Verificacion y PR

- Revisar que todos los HTML cargan correctamente
- Verificar que las funciones globales siguen expuestas
- Crear PR desde `feature/refactor-arquitectura` hacia `main`
- Redactar reporte de cambios

---

## 3. CRONOGRAMA ESTIMADO

| Fase | Tareas | Estimado |
|------|--------|----------|
| Fase 1: Infraestructura | 3 tareas | Rapido |
| Fase 2: Extraccion JS | 8 paginas | Moderado |
| Fase 3: Limpieza CSS | 3 tareas | Rapido |
| Fase 4: Deduplicacion | 3 tareas | Moderado |
| Fase 5: HTML finales | 8+ paginas | Rapido |
| Fase 6: PR | 1 tarea | Rapido |

---

## 4. CRITERIOS DE ACEPTACION

- [ ] Ningun HTML contiene bloques `<script>` con logica (solo carga de scripts externos)
- [ ] Ningun HTML contiene bloques `<style>` (excepto theme.css via `<link>`)
- [ ] El cache-buster funciona automaticamente sin intervencion manual
- [ ] No hay funciones duplicadas entre base.js y auth-core.js
- [ ] Todos los colores usan clases Tailwind o CSS variables (no hardcodeados)
- [ ] La funcionalidad original se preserva (mismas funciones expuestas globalmente)
