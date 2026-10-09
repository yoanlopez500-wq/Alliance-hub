-- División modular del reglamento global: secciones largas partidas en
-- cláusulas independientes. NADA se elimina: las secciones originales quedan
-- is_active=false (preservadas) y su texto se reparte verbatim en las nuevas.
-- order_index temporal = orden_orig*10 + pos; luego reenumeración 0..N.
-- Limpieza menor de títulos con artefactos y comillas finales sueltas.

BEGIN;

-- A) Prohibición de Colusión Técnica (orig order 2) -> 3 secciones
INSERT INTO public.rule_sections (title, content, order_index, is_active) VALUES
('Colusión Técnica: Definición y Elementos', $js$# 2.2.2. Prohibición de Colusión Técnica

Definición: Se considera "Colusión Técnica" cualquier acuerdo previo, coordinación o acción deliberada entre jugadores ajena al motor del juego que resulte en la transferencia de territorio, recursos o ventaja estratégica sin combate real ni resistencia militar.

Elementos constitutivos de Colusión Técnica:

| Elemento | Descripción | Ejemplo |
|----------|-------------|---------|
| Abandono intencional | Un jugador abandona la partida de forma coordinada para beneficiar a otro | España abandonó y suicidó tropas para que GB conquistara sin resistencia |
| Suicidio de tropas | Un jugador destruye intencionalmente sus propias tropas para debilitar su defensa | España atacó a Francia con tropas débiles, luego dejó fronteras vacías para GB |
| Conquista sin combate | Transferencia de territorio con 0 bajas o resistencia nula por parte del defensor | GB conquistó toda España con 0 bajas en el conflicto directo |
| Acuerdo externo | Coordinación fuera del motor del juego para desbalancear | No se requiere probar el chat externo si los hechos demuestran el resultado |$js$, 20, true),
('Lo que NO es Colusión Técnica', $js$## LO QUE NO ES COLUSIÓN TÉCNICA:
- No atacar a un vecino (estrategia defensiva legítima).
- Guerra de baja intensidad o fronteras estáticas por fortificación mutua.
- Priorizar enemigos (concentrar fuerzas en un frente).
- "Oportunismo" o supervivencia conjunta contra amenaza común.
- Traición diplomática con combate real y bajas.$js$, 21, true),
('Conductas Legales y Sanción por Colusión', $js$## Distingue de conductas LEGALES:

| Conducta | ¿Es colusión? | ¿Por qué? |
|----------|---------------|-----------|
| Traición diplomática + conquista con combate | NO | Hay resistencia, hay bajas, es parte del juego |
| Carroñeo (aprovecharse de un jugador derrotado) | NO | El jugador derrotado sigue defendiéndose o colapsó por estrategia, no por acuerdo |
| Comercio de recursos entre jugadores activos | NO | Bienes ya producidos, no transferencia de territorio |
| Abandono legítimo sin regalo de territorio | NO | El jugador deja el mapa, pero no coordina quién se beneficia |

Sanción: Strike por colusión técnica + invalidación de kills obtenidos por conquista sin combate + período de ajuste sin expansión (14 días).$js$, 22, true);

-- C) Tipos de Eventos (orig order 2) -> 3 secciones
INSERT INTO public.rule_sections (title, content, order_index, is_active) VALUES
('Eventos: Torneo Oficial AllianceHub', $js$# 2.4. Tipos de Eventos

## 2.4.1. Torneo Oficial AllianceHub
- Válido para rankings y estadísticas oficiales de la plataforma.
- El Reglamento AllianceHub es **INMUTABLE** para el organizador.
- Árbitro designado por el Comité.
- Sanciones según precedentes de AllianceHub.
- El organizador puede añadir **REGLAS ADICIONALES** siempre que **NO CHOQUEN** con este reglamento.$js$, 23, true),
('Eventos: Interna de Alianza (Evento Privado)', $js$## 2.4.2. Interna de Alianza (Evento Privado)
- **NO** válido para ranking oficial de AllianceHub.
- El organizador tiene **LIBERTAD TOTAL** de reglas.
- AllianceHub presta infraestructura (página, registro) pero **NO** autoridad arbitral.
- Sin árbitro oficial salvo que se solicite y se apruebe separadamente.
- Las reglas del organizador prevalecen; AllianceHub **NO** interviene en disputas.$js$, 24, true),
('Eventos: Conflicto de Intereses', $js$## 2.4.3. Conflicto de Intereses
Si una regla del organizador **CHOQUE** con el Reglamento AllianceHub en un evento **OFICIAL**:
- **GANA** el Reglamento AllianceHub.
- El organizador **NO** puede modificar, suspender ni ignorar reglas de la plataforma.
- Si el organizador no acepta esto, su evento se reclasifica como **INTERNA**.$js$, 25, true);

-- E) Unidades especiales (orig order 2) -> definición + procedimiento 24h
INSERT INTO public.rule_sections (title, content, order_index, is_active) VALUES
('¿Qué se consideran unidades especiales?', $js$Unidades especiales se refiere a cualquier unidad que no sea accesible a todo el mundo al mismo tiempo y en igualdad de condiciones. Esto incluye heroes y unidades premiun como las unidades de asalto y stormtroopers$js$, 26, true),
('Inutilización de Unidades Prohibidas (24h)', $js$Si un jugador despliega una unidad prohibida por error, debe INUTILIZARLA en un plazo de 24 horas desde la notificación. 'Inutilizar' significa: disolver la unidad, retirarla a territorio propio sin combate, o dejarla inactiva fuera de zonas de conflicto. 'Neutralizar' significa: remover la unidad del campo de batalla sin causar daño a terceros. El incumplimiento resulta en strike por unidad prohibida en combate.$js$, 27, true);

-- D) Derecho de Admisión (orig order 4) -> principios + eventos no afiliados
INSERT INTO public.rule_sections (title, content, order_index, is_active) VALUES
('Derecho de Admisión: Principios', $js$# 4.2. Derecho de Admisión

AllianceHub es un **PRIVILEGIO**, no un derecho. La administración se reserva el derecho de excluir a cualquier jugador sin obligación de explicación detallada.

## Principios:
- Se aplica por conducta negativa, patrón de deslegitimación del sistema, usurpación de roles o conducta antisocial recurrente.
- **NO** requiere una infracción específica tipificada en el reglamento.
- **NO** es negociable públicamente.
- El jugador puede solicitar revisión al Comité con evidencia de cambio de conducta.$js$, 40, true),
('Derecho de Admisión: Eventos No Afiliados', $js$## 4.2.1. Eventos No Afiliados
Un jugador con Derecho de Admisión aplicado puede seguir participando en:
- Partidas públicas de Supremacy 1914.
- Internas de su propia alianza.
- Eventos **NO** afiliados a AllianceHub.

**NO** puede participar en:
- Torneos oficiales AllianceHub.
- Eventos con ranking oficial de la plataforma.$js$, 41, true);

-- F) Cambios al Reglamento (orig order 6) -> cambios + precedentes
INSERT INTO public.rule_sections (title, content, order_index, is_active) VALUES
('Cambios al Reglamento', $js$# 6.1. Cambios al Reglamento

Durante la Fase MVP, el Comité se reserva el derecho de modificar, actualizar o añadir nuevas cláusulas.

- Los cambios se notifican por **TODOS** los canales oficiales.
- Los cambios **NO** aplican retroactivamente a partidas en curso.
- Si un cambio afecta una partida en curso, aplica solo a la **SIGUIENTE** partida.
- El uso continuo de la plataforma por parte del usuario constituye aceptación de dichas modificaciones.$js$, 60, true),
('Precedentes como Fuente de Derecho', $js$## 6.1.1. Precedentes como Fuente de Derecho
Las Determinaciones del Árbitro en casos concretos generan **PRECEDENTES**.
- Los precedentes vinculan al Árbitro en casos futuros similares (principio de igualdad de trato).
- Solo el Comité puede modificar o anular un precedente mediante **Resolución**.$js$, 61, true);

-- B) Autoría y Cooperación en Colusión (orig order 8) -> causante + beneficiario
INSERT INTO public.rule_sections (title, content, order_index, is_active) VALUES
('Colusión: Causante (Sabotaje de Partida)', $js$En la Colusion Tecnica (2.2.2) se distinguen dos roles con responsabilidad diferenciada:

**a) CAUSANTE (Sabotaje de Partida):** el jugador que abandona de forma coordinada, suicida sus tropas o vacia deliberadamente sus defensas para que otro capture su territorio sin resistencia. El acto mismo demuestra la intencion: nadie "por accidente" lanza sus tropas al mar y abandona.

Sancion del CAUSANTE: strike grave + suspension de plataforma de 3 meses (o Derecho de Admision segun el dano). La sancion es a nivel PLATAFORMA (perfil, rankings, eventos futuros), no solo en la partida afectada, precisamente porque el causante suele abandonar la partida donde cometio la infraccion.$js$, 80, true),
('Colusión: Beneficiario y Co-autoría', $js$**b) BENEFICIARIO:** quien captura el territorio entregado. Sancion base: penalizacion del 10% + invalidacion de kills obtenidos sin combate + periodo de ajuste. El beneficiario PUEDE ser inocente: la mera captura de territorio sin resistencia NO prueba complicidad. Solo escala a CO-AUTOR (misma sancion que el causante) si existe prueba de coordinacion previa (chats, patron repetido, confesion).

Ambas sanciones son apelables ante el Comite con evidencia (Art. 4.1).$js$, 81, true);

-- Desactivar las originales (preservadas, no eliminadas)
UPDATE public.rule_sections SET is_active = false WHERE id IN (
  '5193f479-c86e-481c-a346-bbcea9e0d8bd', -- Prohibición de Colusión Técnica
  '827a9c0b-2508-4abe-af21-5f0f1fd3037f', -- Tipos de Eventos
  'afad951c-f32d-400a-934a-26cf54ac5c3a', -- ¿Que se consideran unidades especiales?
  '75436dc8-bc30-4946-9d2d-6f62e3db3745', -- Derecho de Admisión
  '473e5163-c75e-49ee-812b-dde2e1ebd7a1', -- Cambios al Reglamento
  'dca61818-178a-40a4-a210-e3ba2bf0de13'  -- Autoria y Cooperacion
);

-- Limpieza de títulos con artefactos y comillas finales sueltas
UPDATE public.rule_sections SET title = 'Protocolo de notificación multi-canal' WHERE id = 'cace71f1-7165-4c3d-be53-c30a30c087b7';
UPDATE public.rule_sections SET content = left(content, -1) WHERE id = 'cace71f1-7165-4c3d-be53-c30a30c087b7' AND right(content, 1) = '"';
UPDATE public.rule_sections SET title = 'Procedimiento para unidades prohibidas desplegadas' WHERE id = '4b08d24a-b8a4-4d17-8c1e-cf6f01e95887';
UPDATE public.rule_sections SET content = left(content, -1) WHERE id = '4b08d24a-b8a4-4d17-8c1e-cf6f01e95887' AND right(content, 1) = '"';

-- Reenumeración determinista de las secciones activas 0..N
WITH s AS (
  SELECT id, row_number() OVER (ORDER BY order_index, created_at, id) - 1 AS rn
  FROM public.rule_sections
  WHERE alliance_id IS NULL AND is_active
)
UPDATE public.rule_sections r SET order_index = s.rn FROM s WHERE r.id = s.id;

COMMIT;
