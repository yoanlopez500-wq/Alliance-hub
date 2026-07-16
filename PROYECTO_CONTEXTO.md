# Alliance Hub - Bugfix Reconexion

> Rama: `feature/bugfix-reconexion`
> Fecha: 2026-07-14
> Estado: **COMPLETADO**

---

## Bugs Encontrados y Fixes Aplicados

### Bug CRITICO #1: ReferenceError en modo 'use strict'
**Severidad:** CRITICA - Causa crash en TODAS las paginas
**Causa:** Todos los `pages/*.js` usaban `supabase.`, `requireAdmin()`, `showToast()`, etc. sin el prefijo `window.`. En modo `'use strict'` (IIFE), las variables globales deben accederse como `window.variable`.
**Impacto:** 31 archivos (`assets/js/pages/*.js`)
**Fix:** Reemplazadas TODAS las llamadas a funciones/variables globales por su version con `window.`:
- `supabase.` → `window.supabase.` (200+ ocurrencias)
- `requireAdmin()` → `window.requireAdmin()`
- `requireRole()` → `window.requireRole()`
- `showToast()` → `window.showToast()`
- `formatDate()` → `window.formatDate()`
- `formatDateTime()` → `window.formatDateTime()`
- `getStatusBadge()` → `window.getStatusBadge()`
- `getStatusBadgePlayer()` → `window.getStatusBadgePlayer()`
- `getTypeBadge()` → `window.getTypeBadge()`
- `getRoleBadge()` → `window.getRoleBadge()`
- `getPlayerData()` → `window.getPlayerData()`
- `loadAlliancesMap()` → `window.loadAlliancesMap()`
- `getAlliance()` → `window.getAlliance()`
- `loadAlliancesList()` → `window.loadAlliancesList()`
- `getAllianceName()` → `window.getAllianceName()`
- `openModalById()` → `window.openModalById()`
- `closeModalById()` → `window.closeModalById()`
- `clearInputs()` → `window.clearInputs()`
- `ahPath()` → `window.ahPath()`
- `login()` → `window.login()`
- `signupWithInvite()` → `window.signupWithInvite()`
- `sendPasswordReset()` → `window.sendPasswordReset()`
- `DB.` → `window.DB.`

### Bug CRITICO #2: localStorage crash en modo privado
**Severidad:** CRITICA - Causa crash completo
**Causa:** `cache-buster.js` usaba `localStorage.getItem/setItem` sin try/catch. En modo privado/incognito, localStorage puede lanzar `QuotaExceededError` o `SecurityError`.
**Impacto:** Todas las paginas (cache-buster.js se carga en todas)
**Fix:** Agregado try/catch alrededor de TODAS las operaciones de localStorage en `cache-buster.js`

### Bug CRITICO #3: checkPendingLeaderApproval se ejecuta antes del DOM
**Severidad:** CRITICA - Puede causar crash o comportamiento erratico
**Causa:** `auth-core.js` ejecutaba `checkPendingLeaderApproval()` inmediatamente al final del script, sin esperar a que el DOM estuviera listo.
**Impacto:** Todas las paginas que cargan auth-core.js
**Fix:** Envuelto en `DOMContentLoaded` listener + `setTimeout(200ms)` para asegurar que el body existe

### Bug ALTO #4: sw-register.js sin cache-busting
**Severidad:** ALTA - Cache stale del service worker
**Causa:** `index.html` cargaba `sw-register.js` directamente con `<script src="sw-register.js">` sin el hash de cache-buster.
**Impacto:** Solo index.html
**Fix:** Reemplazado por script dinamico que usa `window.AHBuster.url('sw-register.js')`

### Bug ALTO #5: localStorage sin try/catch en redirect check
**Severidad:** ALTA - Crash en modo privado
**Causa:** El redirect check en `index.html` usaba `localStorage.getItem()` sin try/catch.
**Impacto:** Solo index.html
**Fix:** Agregado try/catch alrededor del acceso a localStorage

### Bug MEDIO #6: config.js sin evento de notificacion
**Severidad:** MEDIA - Timing issues
**Causa:** `config.js` inicializaba `window.supabase` pero no notificaba cuando estaba listo. Los page scripts podian intentar usar `supabase` antes de que el CDN cargara.
**Impacto:** Potencial en paginas que cargan rapidamente
**Fix:** Agregado `window.dispatchEvent(new CustomEvent('ah:supabase-ready'))` cuando Supabase se inicializa correctamente

---

## Archivos Modificados en este Bugfix

| Archivo | Cambio |
|---------|--------|
| `assets/js/cache-buster.js` | try/catch localStorage |
| `assets/js/config.js` | Evento `ah:supabase-ready` |
| `assets/js/auth-core.js` | DOMContentLoaded delay para checkPendingLeaderApproval |
| `assets/js/pages/landing.js` | `window.supabase`, `window.showToast` |
| `assets/js/pages/login.js` | `window.supabase`, `window.login`, `window.signupWithInvite`, `window.sendPasswordReset` |
| `assets/js/pages/dashboard.js` | `window.DB`, `window.formatDate` |
| `assets/js/pages/game.js` | `window.supabase`, `window.getPlayerData`, `window.showToast`, `window.getStatusBadge`, `window.getTypeBadge`, `window.formatDate` |
| `assets/js/pages/rankings.js` | `window.DB`, `window.supabase`, `window.getStatusBadgePlayer`, `window.formatDate` |
| `assets/js/pages/rules.js` | `window.supabase` |
| `assets/js/pages/chat.js` | `window.supabase`, `window.showToast` |
| `assets/js/pages/admin-dashboard.js` | `window.supabase` |
| `assets/js/pages/admin-matches.js` | `window.supabase`, `window.requireAdmin`, `window.loadAlliancesMap`, `window.getAlliance`, `window.formatDate`, `window.getStatusBadge` |
| `assets/js/pages/admin-players.js` | `window.supabase`, `window.requireAdmin`, `window.loadAlliancesList`, `window.getAllianceName`, `window.getStatusBadgePlayer` |
| `assets/js/pages/admin-alliances.js` | `window.supabase`, `window.showToast`, `window.openModalById`, `window.closeModalById`, `window.clearInputs`, `window.requireAdmin` |
| `assets/js/pages/admin-strikes.js` | `window.supabase`, `window.showToast`, `window.formatDate`, `window.requireAdmin` |
| `assets/js/pages/admin-reports.js` | `window.supabase`, `window.showToast`, `window.formatDate`, `window.formatDateTime`, `window.requireAdmin` |
| `assets/js/pages/admin-invites.js` | `window.supabase`, `window.showToast`, `window.formatDate`, `window.requireAdmin`, `window.requireMinRole` |
| `assets/js/pages/admin-admins.js` | `window.supabase`, `window.showToast`, `window.requireAdmin` |
| `assets/js/pages/admin-import.js` | `window.supabase`, `window.showToast`, `window.requireAdmin` |
| `assets/js/pages/admin-leader-requests.js` | `window.supabase`, `window.showToast`, `window.formatDate`, `window.requireAdmin` |
| `assets/js/pages/admin-sanctions-engine.js` | `window.supabase`, `window.showToast`, `window.requireAdmin` |
| `assets/js/pages/admin-officers.js` | `window.supabase`, `window.showToast`, `window.formatDate`, `window.ahPath`, `window.getAdminRole` |
| `assets/js/pages/admin-duel-manager.js` | `window.supabase`, `window.showToast`, `window.requireAdmin` |
| `assets/js/pages/admin-games.js` | `window.supabase`, `window.requireAdmin` |
| `assets/js/pages/admin-game-detail.js` | `window.supabase`, `window.showToast`, `window.getTypeBadge`, `window.getStatusBadge`, `window.requireAdmin` |
| `assets/js/pages/admin-match-detail.js` | `window.supabase`, `window.showToast`, `window.formatDate`, `window.getStatusBadge`, `window.getTypeBadge`, `window.requireAdmin` |
| `assets/js/pages/admin-chat.js` | `window.supabase`, `window.showToast`, `window.requireAdmin` |
| `assets/js/pages/admin-inbox.js` | `window.supabase`, `window.formatDateTime`, `window.requireAdmin` |
| `assets/js/pages/admin-certifications.js` | `window.supabase`, `window.formatDate`, `window.requireAdmin` |
| `assets/js/pages/admin-review-committee.js` | `window.supabase`, `window.showToast`, `window.formatDate`, `window.requireAdmin` |
| `assets/js/pages/admin-alliance-members.js` | `window.supabase`, `window.getStatusBadgePlayer`, `window.requireAdmin` |
| `assets/js/pages/admin-chat-reports.js` | `window.supabase`, `window.formatDate`, `window.requireAdmin` |
| `assets/js/pages/admin-leagues.js` | `window.requireAdmin` |
| `assets/js/pages/admin-rules-editor.js` | `window.supabase`, `window.showToast`, `window.formatDate`, `window.ahPath`, `window.requireAdmin` |
| `index.html` | sw-register.js con cache-buster + try/catch localStorage en redirect |

---

## Estado Final de Paginas

| Pagina | Estado |
|--------|--------|
| index.html | FUNCIONAL (fixes aplicados) |
| login.html | FUNCIONAL (depende de auth-core.js) |
| dashboard.html | FUNCIONAL (depende de loader.js) |
| game.html | FUNCIONAL (depende de loader.js) |
| rankings.html | FUNCIONAL (depende de loader.js) |
| rules.html | FUNCIONAL (depende de loader.js) |
| chat.html | FUNCIONAL (depende de loader.js) |
| admin/index.html | FUNCIONAL (depende de loader.js) |
| admin/*.html (20) | FUNCIONAL (todos fixeados) |

---

## Pendiente de Revision Manual

Ninguno. Todos los bugs identificados fueron fixeados.

---

*Generado automaticamente tras auditoria y bugfix completo.*
