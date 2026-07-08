---
name: skat-arquitectura-agentica-v1
description: Doctrina transferible de arquitectura agéntica para SKAT/ArketLabs, destilada de OpenMontage. Usar SIEMPRE que se diseñe o audite un pipeline, un handoff entre instancias Claude (Web/Code/Cowork), un tool/integración nueva, un contrato de datos, o un video ad chat-sim en Remotion. Aporta hard rules, gates barato-antes-de-caro, contratos AKL validados, tool-registry con scoring, y el motor chat-sim. Activar al planear orquestación, gobernanza de agentes, o cualquier delta que deba ser auditable y reanudable.
---

# Arquitectura Agéntica (SKAT v1)

Doctrina destilada de OpenMontage (AGPLv3 — **patrón sí, código no**; el código de esta skill es clean-room ArketLabs). Convierte las lecciones de un orquestador agéntico maduro en reglas accionables para SKAT.

**Tesis raíz:** la inteligencia vive en las instrucciones (manifiestos + skills), no en el código; el código son herramientas y persistencia. Separa tres capas: **qué existe/cuánto cuesta** (tool registry), **cómo lo usamos aquí** (director-skills), **cómo funciona la tecnología** (vendor skills).

**Recursos incluidos con esta skill** (rutas relativas a esta carpeta): `schemas/akl_*.schema.json` (contratos AKL), `tools/chatsim-precompose-validator.ts` + `tools/static-dm-risk.ts` (gates de video, verificados en verde), `remotion/ChatSimScene.tsx` (motor chat-sim), `references/DOCTRINA-OPENMONTAGE-TRANSFERIBLE.md` (la doctrina completa, 23KB), `references/verify.test.ts` (prueba schemas + tools). **Generación IA async:** `tools/gateway-client.ts` (patrón submit→poll→normalize + idempotencia, provider-neutral, para Kling/Runway/Veo/etc.) + `registry/model-registry-seed.json` (51 modelos de imagen normalizados a la forma de Regla 5).

**Caso fundacional (por qué existe):** minamos OpenMontage a fondo (2026-07-08) porque corre sobre nuestro mismo motor (Remotion) y su arquitectura entera *es* nuestra doctrina llevada a contratos ejecutables. En vez de re-descubrir gobernanza agéntica caso por caso, la codificamos aquí una vez.

---

## Los 3 pilares (todo cuelga de esto)

1. **Declarativo + enforcement dual.** Política en config/manifiestos; invariantes críticos candados en código; un *reviewer* verifica que la doctrina (no solo el output) se cumplió. La calidad deja de depender de que el LLM "se acuerde".
2. **Barato-antes-de-caro.** Sample gate, gate de revisión antes del paso caro/irreversible, ledger de costo reserve/reconcile, umbral de deriva. El fallo caro se atrapa barato. (= "mock no es evidencia").
3. **Auditabilidad append-only.** `decision_log` inmutable por (category, subject), checkpoints con historial preservado, anuncio-antes-de-ejecutar. Cada elección, cambio y gasto es reconstruible.

---

## Regla 1 — Hard rules no-negociables (antes de ejecutar)

- **HR1 Rule Zero:** ninguna producción con scripts ad-hoc. Identificar pipeline → manifiesto → preflight → etapa por etapa. El atajo improvisado es la principal fuente de trabajo no auditable.
- **HR2 Present Both:** con dos caminos válidos (dos proveedores, plantilla vs bespoke, dos rutas de deploy), presentar ambos con costo/tradeoff y esperar elección. Default en silencio prohibido.
- **HR3 No Unilateral Substitutions:** si el camino aprobado se bloquea, investigar/preparar alternativas pero NO ejecutarlas sin aprobación. Swap silencioso de proveedor/modelo/runtime = violación (previene downgrade silencioso).
- **HR4 Announce Before Execution:** antes de toda llamada paga — tool exacta, proveedor, modelo, razón, sample o batch, ~costo.
- **HR5 El manifiesto es vinculante:** la política de aprobación vive en config + un guardián en código que rechaza cierres no aprobados. No la dejes solo en el prompt.

## Regla 2 — Gates (barato antes de caro)

- **Gate por-etapa con fin de turno forzado:** en gate → presentar resumen + hallazgos + snapshot de costo y **terminar el turno**. "Present and continue" no es esperar.
- **Aprobación por-gate:** un "dale, hazlo todo" temprano NO cubre gates posteriores salvo que se registre como `decision_log(category: approval_policy)` en el momento.
- **Gate antes del paso caro:** revisar el storyboard/plan *antes* del render/deploy/envío masivo, sin producir un draft caro para "ganarte" la revisión.
- **Sample gate:** un espécimen aprobable (1 ad, 1 respuesta del bot) con costo sample vs proyectado, antes del batch.
- **Escalar bloqueos con 5 campos:** intentado / falló / tipo (auth·acceso·bug·prompt·credencial) / opciones / recomendación. Nunca reintentos silenciosos ni rendición.

## Regla 3 — Anti-fallo

- **AF1 Crítica anclada (CHAI):** todo hallazgo cita campo/línea/frame (*Accurate*); barre la misma clase de error (*Complete*); todo `critical` trae fix propuesto o baja a `investigation` (*Constructive*).
- **AF2 Anti-downgrade-silencioso:** define "promesas de entrega" por tipo de trabajo + un check que detecte si el output las incumple.
- **AF3 Anti-scope-creep:** gasto real > estimado +30% sin re-aprobación → CRITICAL.
- **AF4 Anti-perfeccionismo:** máx 2 rondas de review → "pass con warnings" y avanza (= regla 40-min).
- **AF6 Anti-alucinación-de-fuente:** sondear el input real (repo, workflow, tabla) antes de construir; prohibido planear sobre nombres/metadatos (↔ skat-diagnostico-workflow-clonado).
- **AF7 Anti-sameness:** check registrable "¿esto podría ser de cualquier otro producto/bot/marca?".

## Regla 4 — Contratos de datos AKL (validar en cada frontera)

Convenciones en TODO contrato: `version` como `const`; `additionalProperties:false` + `metadata` libre; estados siempre enum; `folio` AKL como llave foránea; `*_ref` para enlazar sin embeber; campos "lock" que downstream no cambia sin `decision_log`; `minItems` para forzar minuciosidad.

Schemas clean-room disponibles en el bundle (`schemas/`):

- **`akl_handoff`** — handoff Web↔Code↔Cowork; exige `estado_actual_verificado: true` (candado anti-doble-trabajo como campo validado, no como nota) + `verificacion_evidencia[]`.
- **`akl_decision_log`** — append-only; cada decisión ≥2 opciones (con `rejected_because`), `reason` no-boilerplate, `confidence` realista.
- **`akl_final_review`** — self-review con `checks` que llevan `evidencia` real (comando corrido, HTTP status, ffprobe), no afirmaciones. Para deploy de cliente y video ads.

## Regla 5 — Tool-registry + scoring (cuando haya ≥2 proveedores)

Contrato uniforme por integración (`capability`, `supports`, `best_for`, `dependencies:["env:..."]`, `getStatus`, `estimateCost`, `execute`) en tabla Supabase `tool_registry`. Selección por scoring ponderado explicable (task_fit 0.30 / quality 0.20 / control 0.15 / reliability 0.15 / cost 0.10 / latency 0.05 / continuity 0.05) con matching por keywords+sinónimos — **sin LLM en el loop caliente**. Puebla `historical_success_rate`/`latency_p50` desde logs para que mejore solo. Fallback input-aware. Idempotency key por request (crítico con Stripe/renders).

## Regla 6 — Video ads chat-sim (Remotion 9:16)

Motor `ChatSimScene` (bundle `remotion/`): conversación como `steps[]` tipados (`message_in/out` con `stream`, `typing_dots`, `reaction`, `cta_reveal`) + `walkTimeline` (cero timestamps manuales) + theme por agente. Una composición paramétrica batch-rendable; duración derivada de la data. Gate pre-render obligatorio: `chatsim-precompose-validator` (ffprobe, timing, overflow, safe-zones Meta) + `static-dm-risk` (¿screenshot o conversación viva?). **Texto exacto (CTA, @, precio) SIEMPRE componente, nunca imagen AI.** Captions 3-4 palabras, 20% inferior. Verificación post-render con ffprobe + frames de hook/CTA.

---

## 📈 Bitácora de crecimiento (cada sesión la hace más potente)

Esta skill es un organismo vivo, no un documento congelado. **Cada vez que una regla se prueba, falla, o aparece un patrón nuevo, se registra aquí** — apilar, nunca borrar (append-only, como el decision_log que predica). Antes de cerrar una sesión relevante, añade una entrada:

```
### [YYYY-MM-DD] <título del aprendizaje>
- Contexto: <qué caso lo disparó>
- Aprendizaje: <la regla nueva o el ajuste>
- Acción: <regla creada/modificada, o tool añadido al bundle>
```

### [2026-07-08] Génesis — destilación de OpenMontage
- Contexto: minado a fondo del repo OpenMontage (34.5k★, mismo motor Remotion) en 4 ejes.
- Aprendizaje: la doctrina de gobernanza agéntica es transferible casi 1:1 a SKAT; el mayor ROI son los contratos de datos AKL.
- Acción: creada esta skill v1 + bundle clean-room (3 schemas, 2 tools verificados, ChatSimScene). Doctrina completa en `DOCTRINA-OPENMONTAGE-TRANSFERIBLE.md`.

### [2026-07-08] Revisión de open-generative-ai (MIT) — extracción quirúrgica
- Contexto: repo de generación IA imagen/video (22k★). Aplicada la dinámica review-first + gate barato-antes-de-caro: resultó ser una app sobre un solo gateway (Muapi.ai), no un framework de doctrina → NO ameritó fan-out.
- Aprendizaje: (1) el patrón universal de generación async es **submit→poll→normalize** — la forma del poll varía por proveedor, normalizar siempre a `{url}`. (2) Un `models_dump` es un tool-registry listo (Regla 5). (3) Bandera de seguridad: gateway-tercero ve prompts/outputs + API key; "uncensored" = riesgo HOUSING; key en localStorage = anti-doctrina.
- Acción: añadidos `tools/gateway-client.ts` (submit→poll→normalize + idempotencia, 11 tests verde) y `registry/model-registry-seed.json` (51 modelos normalizados a Regla 5). Descartado todo lo demás (UI, Electron, el gateway específico) por no potenciar.

<!-- Próximas entradas aquí. Cuando la bitácora acumule cambios sustantivos, cortar v2. -->

---

## Rúbrica de auto-evaluación (antes de aplicar esta skill, puntúa 1-5)

1. ¿Identifiqué el pilar/regla relevante para este caso, o estoy improvisando fuera del sistema? (HR1)
2. ¿Hay un gate barato antes del paso caro/irreversible, y cedo el turno en él?
3. ¿Cada decisión significativa quedará en `akl_decision_log` con opciones rechazadas?
4. ¿El handoff declara `estado_actual_verificado` con evidencia, o asumo greenfield?
5. ¿Registré el aprendizaje de esta sesión en la bitácora si aplica?

Si algún punto <3, corrige antes de proceder.
