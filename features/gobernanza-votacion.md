# FEATURE FUTURA — Sistema de Gobernanza: Votación y Aprobación de Reformas al Reglamento

> **Estado: DOCUMENTADO, NO IMPLEMENTADO.** Este documento es el diseño de referencia para cuando se decida construir. Nada de lo descrito aquí existe aún en producción.

**Fecha del diseño:** 2026-08-15
**Contexto:** Alliance-Hub (Supremacy 1914) — gestión de alianzas, partidas, rankings, reglamento y sanciones.

---

## 1. Propósito

Dar al comité organizador un mecanismo **formal, auditable y notificado** para proponer, debatir formalmente y aprobar/rechazar cambios al reglamento y resoluciones de la comunidad.

Principio rector: **la deliberación informal vive en WhatsApp; la app es el boletín oficial.** No se compite con WhatsApp — se complementa con lo que WhatsApp no puede dar: votos ligados a identidad verificada, quorum verificable, historial permanente y notificación automática.

## 2. Actores y quién vota

La representación es **orgánica**: el líder de una alianza en el juego real es la voz de su alianza. No hay elecciones internas en la app.

| Actor | Rol en la app | Poder en gobernanza |
|---|---|---|
| Jugador base | sesión de jugador (no-auth) | **No vota en la app.** Opina en su alianza / WhatsApp |
| Líder de alianza | `alliance_leader` (auth) | 1 voto por alianza en propuestas del comité |
| Árbitro | `moderator` (auth) | Voz, sin voto (aplica el reglamento, no lo escribe) |
| Admin de eventos | `event_admin` (auth) | 1 voto |
| Superadmin | `superadmin` (auth) | 1 voto + rompe empates + custodia técnica |

**Ventaja clave:** todos los votantes son cuentas Supabase Auth reales → suplantación imposible, integridad total sin construir nada extra.

## 3. Ciclo de vida de una propuesta

```
1. Debate informal (WhatsApp del comité)
2. Un líder/admin formaliza la propuesta en la app
        → push "Nueva propuesta" a todos los votantes
3. Ventana de votación (configurable, p.ej. 72h)
        → voto: a_favor / en_contra / abstencion (1 por votante, modificable hasta el cierre)
4. Cierre automático (por fecha) o manual (superadmin)
        → cálculo: quorum + mayoría
5. Resultado publicado (aprobada / rechazada / sin quorum)
        → push "Resolución publicada" a votantes y jugadores afectados
6. Si es reforma de reglamento y fue aprobada:
        → se enlaza con la edición correspondiente en rule_sections
        → rule_section_history registra el cambio (ya existe)
```

## 4. Esquema de base de datos propuesto

```sql
-- Propuestas del comité
CREATE TABLE public.governance_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,                 -- sanitizar <> (trigger existente)
  body          text NOT NULL,                 -- descripcion de la reforma
  proposal_type text NOT NULL DEFAULT 'rule_change'
                CHECK (proposal_type IN ('rule_change','resolution','policy','other')),
  rule_section_id uuid REFERENCES public.rule_sections(id),  -- NULL si no es reforma
  proposed_by   uuid NOT NULL REFERENCES public.admin_users(id),
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','approved','rejected','no_quorum','cancelled')),
  voting_opens_at  timestamptz NOT NULL DEFAULT now(),
  voting_closes_at timestamptz NOT NULL,
  quorum_pct    int NOT NULL DEFAULT 50,       -- % minimo de votantes que deben participar
  approval_pct  int NOT NULL DEFAULT 50,       -- % de a_favor sobre votos emitidos (sin abstenciones)
  result_snapshot jsonb,                       -- conteos finales al cerrar (auditable)
  closed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Votos (1 por votante por propuesta)
CREATE TABLE public.governance_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.governance_proposals(id) ON DELETE CASCADE,
  voter_id    uuid NOT NULL REFERENCES public.admin_users(id),
  vote        text NOT NULL CHECK (vote IN ('a_favor','en_contra','abstencion')),
  comment     text,                            -- justificacion opcional (sanitizar)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, voter_id)               -- un voto por votante
);
```

### Seguridad (RLS)

- `governance_proposals`: SELECT público (transparencia = legitimidad; los resultados los puede ver cualquiera). INSERT/UPDATE solo auth con rol votante (`alliance_leader`, `event_admin`, `superadmin`) o superadmin para cierre/cancelación.
- `governance_votes`: SELECT público (voto nominal, no secreto — decisión de diseño deliberada: en comités pequeños la publicidad del voto disuade traiciones; si se quiere voto secreto, cambiar a SELECT solo-admin y mostrar solo conteos). INSERT/UPDATE solo el propio votante (`auth.uid() = voter_id`) y solo mientras la propuesta está `open` y antes de `voting_closes_at` (forzar con `WITH CHECK` + función `is_proposal_open(proposal_id)`).
- Reusar el trigger `ah_strip_angle_brackets` en `title`, `body`, `comment` (anti-XSS en origen, patrón ya establecido).

## 5. Funciones y lógica de servidor

- `close_proposal(p_proposal_id)` — security definer, solo superadmin (o llamada por un cron de Supabase al llegar `voting_closes_at`): cuenta votos, evalúa quorum y mayoría, escribe `status` + `result_snapshot` + `closed_at`, dispara push `governance_result`.
- Trigger `BEFORE INSERT/UPDATE` en `governance_votes`: rechaza votos fuera de ventana o sobre propuestas cerradas (defensa en servidor, no solo RLS).
- Trigger en `governance_proposals` INSERT → `notify_push(id, 'governance_new')`; en cierre → `notify_push(id, 'governance_result')`.

## 6. Eventos push (extensión del sistema existente)

| Evento | Destinatarios | Contenido |
|---|---|---|
| `governance_new` | todos los votantes (roles con voto) | título de la propuesta + fecha de cierre |
| `governance_result` | votantes + jugadores si es `rule_change` | resultado + resumen |
| `governance_closing_soon` (opcional) | votantes que no han votado | recordatorio 12-24h antes del cierre (requiere cron) |

Se integran en la edge function `push-notify` siguiendo el patrón de los 11 eventos actuales (dedupe por `push_notification_log`, tag `ah-governance-*`).

## 7. Página(s) propuestas

- `governance.html` (pública/lectura): lista de propuestas, estado, conteos, historial de resoluciones. **La transparencia pública es una feature, no un detalle.**
- `admin/governance.html` (comité): crear propuesta, votar, cerrar (superadmin), ver quién falta por votar.
- Entrada en el menú del comité; badge con propuestas abiertas (patrón de notificaciones in-app existente).

## 8. Interconexión con los sistemas existentes

| Sistema | Conexión |
|---|---|
| **Reglamento** (`rule_sections`, `rule_section_history`) | Una `rule_change` aprobada enlaza a la sección; la edición posterior queda en el historial versionado ya existente. La resolución cita la propuesta que la autorizó |
| **Precedentes** (`rule_precedents`) | Las resoluciones del comité pueden promoverse a precedentes (misma mecánica que hoy) |
| **Roles** (`admin_users`, `ROLE_HIERARCHY`) | Define quién propone y quién vota; no requiere roles nuevos |
| **Push** (`push-notify`, triggers) | 2-3 eventos nuevos con el patrón existente |
| **Notificaciones in-app / inbox** | mismas resoluciones aparecen en el panel |
| **Anti-XSS** (`ah_strip_angle_brackets`) | sanitización en origen de todo texto del módulo |

## 9. Coste de datos (por qué NO es un problema)

- Voto: ~200 bytes. 100,000 votos ≈ 20MB.
- Propuesta con resolución: ~2KB. 1,000 propuestas ≈ 2MB.
- **Toda la gobernanza de años cabe en <5% del límite de 500MB.** Lo que pesa (imágenes de evidencia) vive en Storage (1GB aparte) y este módulo no lo usa.

## 10. Qué NO construir (decisiones explícitas)

- ❌ Chat/foro de deliberación — WhatsApp ya lo hace mejor; construirlo es costo de desarrollo y moderación para una versión peor.
- ❌ Elecciones de representantes — la representación es orgánica (líder real del juego = voz de la alianza).
- ❌ Voto de jugadores base — sin auth real sería suplantable; si algún día se quiere un termómetro de opinión, hacerlo como encuesta no vinculante y claramente etiquetada.
- ❌ Blockchain/verificación externa — overkill; el audit trail interno + voto nominal público es suficiente a esta escala.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Líder inactivo no vota | quorum_pct configurable + push recordatorio + panel "quién falta" |
| Empate | superadmin rompe empate (documentado en reglamento) |
| Propuesta spam | solo roles con voto pueden proponer; superadmin puede cancelar |
| Voto cambiado a última hora | permitido hasta cierre (diseño); `updated_at` queda registrado |
| Alianzas nuevas entran al comité | al crear su cuenta de líder ya pueden votar; sin migraciones |

## 12. Roadmap

1. **Fase 0 (hecho)**: este documento + sección del reglamento que defina qué decide cada rol.
2. **Fase 1**: 2 tablas + RLS + página del comité (crear/votar/cerrar) + push `governance_new`/`governance_result`.
3. **Fase 2**: página pública de resoluciones + enlace propuesta ↔ reforma de reglamento.
4. **Fase 3 (opcional)**: recordatorio `governance_closing_soon` con cron, encuestas no vinculantes para jugadores.

---

*Fin del documento. No aplicar nada de esto hasta decisión explícita del superadmin.*
