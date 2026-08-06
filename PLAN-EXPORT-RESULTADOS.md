# PLAN — Exportador de resultados y strikes de partida

**Estado:** PROPUESTA — pendiente de aprobación del usuario. No implementar hasta luz verde.
**Rama:** `feat/export-match-report`
**Fecha:** 2026-08-07

## 1. Objetivo

Botón **Exportar** en la ficha de partida (`admin/match-detail.html`, la vista que usan
admins y líderes) que genere un informe de la partida con contenido **modular a elegir**:

- ✅ **Solo estadísticas** (tabla de resultados: jugador, bajas, muertes, KD, validez)
- ✅ **Solo strikes** (a quién, tipo, razón y notas)
- ✅ **Ambos** (estadísticas + strikes)

## 2. Decisión de formato: texto vs PDF (contexto WhatsApp)

| Formato | Pros | Contras | Veredicto |
|---|---|---|---|
| **Copiar texto** | Nativo de WhatsApp (monoespaciado con ```), 0 dependencias, funciona en móvil, editable antes de enviar, ~2 KB | No es "documento" | **PRINCIPAL** |
| **PDF** | Archivable, imprimible, aspecto formal | jsPDF pesa ~350 KB (contra nuestra filosofía sin build); compartir PDF en WhatsApp es un paso más | **SECUNDARIO, vía print** |

**Recomendación: AMBOS, pero sin librerías.**
1. **Copiar para WhatsApp** — texto formateado con bloque monoespaciado (WhatsApp lo
   renderiza como tabla). Es lo que realmente se usará a diario.
2. **Exportar PDF** — vista de impresión (`window.print()` + CSS `@media print`):
   el navegador guarda como PDF nativamente. **Cero dependencias** (no jsPDF),
   coherente con la app estática. El mismo informe alimenta ambos formatos.

## 3. Diseño modular (patrón del proyecto)

### Nuevo módulo compartido: `assets/js/export-utils.js` → `window.AHExport`
IIFE clásico (como `ranking-score.js`, `invite-code.js`). **No** va en SCRIPTS.core:
se carga solo donde se usa vía `extraScripts` de AHLoader (match-detail; rankings en fase 2).

API:
```
AHExport.buildMatchReport({ match, results, players, strikes, options })
  options = { includeStats: bool, includeStrikes: bool, format: 'text'|'html' }
  -> string (texto WhatsApp) o documento HTML de impresión
AHExport.copyToClipboard(text) -> Promise<bool>   // navigator.clipboard + fallback execCommand
AHExport.printReport(htmlString)                  // ventana de impresión -> "Guardar como PDF"
```

### Datos (todo ya disponible, SIN cambios de BD)
- Resultados: ya cargados en `loadResults()` (`match_results` + validez por registro).
- Strikes: `player_strikes` tiene `reason`, `notes`, `match_id`, `strike_types(name, severity)`,
  `players(current_username)`. Alcance propuesto: **strikes vinculados a ESTA partida**
  (`match_id = id`) + opcionalmente strikes activos de los participantes (checkbox extra, fase 2).
- Partida: nombre, fecha, tipo, estado (ya en `currentMatch`).

### UI en match-detail (sección Resultados)
- Botón `📤 Exportar` junto al selector de orden y "Añadir".
- Modal pequeño (mismo estilo que los modales existentes):
  - Checkbox: `Estadísticas de la partida` (marcado por defecto)
  - Checkbox: `Strikes (con razón y notas)` (desmarcado por defecto)
  - Botón `📋 Copiar texto (WhatsApp)`
  - Botón `🖨️ Exportar PDF`
  - Validación: al menos un checkbox marcado; si no, toast de aviso.
- Respeta el **modo de orden elegido** en el selector de resultados (exporta lo que ves).

### Ejemplo de salida texto (WhatsApp)
~~~
📊 *PARTIDA: Copa Aguilas vs LGA*
🗓️ 07/08/2026 | Tipo: Global | Estado: Finalizada

*RESULTADOS*
```
1. Tlaloc27      288K / 257D  KD 1.12 ✅
2. Ing.Rodo18    190K / 174D  KD 1.09 ✅
3. Sarutobix01   150K / 200D  KD 0.75 ❌ no registrado
```

⚠️ *STRIKES (2)*
• Sarutobix01 — No-show: "No se presentó sin aviso"
  Notas: Segundo strike en 30 días
• Virus dorado — Toxicidad: "Insultos en chat"
~~~

## 4. Defensivo / no romper producción
- Solo aditivo: botón + modal + módulo nuevo. No se toca ningún flujo existente.
- Sin BD, sin Edge Functions, sin RLS. Lectura con las mismas queries ya usadas.
- Si `AHExport` no carga, el botón no aparece (guard) — comportamiento histórico.
- escapeHtml en todo dato de BD que entre al HTML de impresión.
- Service worker: auto-versionado por minuto (fix de caché ya mergeado en #19).

## 5. Plan de tests
- Unitarios del builder: stats solo / strikes solo / ambos / partida sin strikes /
  strikes sin notas / orden respetado / formato WhatsApp (encabezados, conteos).
- Sanitizado HTML en la vista de impresión.
- Reviewer independiente antes de merge. Push vía GitHub MCP con verificación
  byte-exact (jsDelivr @SHA), PR + squash merge, verificación 100% en main.

## 6. Fases
- **Fase 1 (esta PR):** match-detail — modal exportar + AHExport + texto + PDF-print.
- **Fase 2 (futura, otra PR):** mismo módulo en `rankings.html` (exportar ranking global
  con el modo de orden activo) y opción "strikes activos de participantes".

## 7. Estimación de cambios (Fase 1)
| Archivo | Cambio |
|---|---|
| `assets/js/export-utils.js` | NUEVO (~180 líneas) |
| `admin/match-detail.html` | Botón Exportar + modal (~30 líneas) + extraScripts |
| `assets/js/pages/admin-match-detail.js` | Carga de strikes + handlers del modal (~60 líneas) |
| tests | test-export-utils.js (nuevo) |
