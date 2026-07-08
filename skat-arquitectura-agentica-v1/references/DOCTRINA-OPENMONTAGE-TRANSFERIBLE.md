# Doctrina OpenMontage → SKAT / ArketLabs

**Qué es esto:** destilación completa de la arquitectura transferible de OpenMontage (`github.com/calesthio/OpenMontage`, ~34.5k ★, AGPLv3), minada en profundidad sobre cuatro ejes — gobernanza agéntica, arquitectura de pipelines/director-skills, tool-registry multi-proveedor, y contratos de datos. Objetivo: subir la potencia de SKAT como orquestador y del sistema de video ads.

**Regla de licencia (leer primero):** OpenMontage es **AGPLv3** (copyleft de red). Ningún archivo `.py`/`.tsx` suyo entra a repos ArketLabs. Esto son **patrones y arquitectura** (ideas, no fuente) — la disciplina de contratos de datos, gobernanza y scoring no es propietaria. El código clean-room que acompaña esta doctrina (`tools/`, `schemas/`, `remotion/`) es implementación original, reescrita desde cero, sin herencia AGPL. **Patrón sí, código no.**

**Fecha:** 2026-07-08 · SKAT v4.1

---

## 0. La tesis de fondo (idea #0)

> **La inteligencia vive en las instrucciones (YAML + markdown), no en el código. El código son solo herramientas y persistencia.**

OpenMontage separa tres capas explícitas, y esa separación es lo primero que SKAT debe adoptar:

1. **Qué existe / cuánto cuesta** → *tool registry* (metadata declarativa por integración).
2. **Cómo lo usamos aquí** → *skills de proyecto* (director-skills por etapa, doctrina de cliente).
3. **Cómo funciona la tecnología** → *skills de vendor* (cómo se usa Remotion, Meta API, Gemini).

Tú ya tienes la capa 2 y 3 embrionarias (tus `skat-*` skills). Lo que te falta y más potencia agrega es la **capa 1 formalizada** (registro de tools con contrato uniforme) y el **enforcement dual** (§1).

---

## 1. Los tres pilares transferibles

Todo lo demás cuelga de estos tres:

**Pilar A — Declarativo + enforcement dual.** La política vive en manifiestos/config; los invariantes críticos se candan en código; y un *reviewer* verifica que la doctrina (no solo el output) se cumplió. La calidad deja de depender de que el LLM "se acuerde" y pasa a depender de que el artifact pase el contrato. Tú ya tienes candados en código (`skat-candado-anti-doble-trabajo`); falta el reviewer estructurado y los contratos validados.

**Pilar B — Barato-antes-de-caro en cada eje.** Sample gates, gate de storyboard antes del render, ledger de costo reserve/reconcile, umbral de deriva de presupuesto. Todo diseñado para que el fallo caro se atrape barato. Es tu lección *"mock no es evidencia / prod rechazó 5 veces"* convertida en arquitectura.

**Pilar C — Auditabilidad append-only.** `decision_log` inmutable por `(category, subject)`, checkpoints con historial preservado, anuncio-antes-de-ejecutar. Cada elección, cambio y gasto es reconstruible después. Es tu convención de folios `AKL-*` llevada a contrato de datos.

---

## 2. Gobernanza agéntica — hard rules (de AGENT_GUIDE.md + skills/meta)

Reglas no-negociables que imponen a los agentes, con el fallo que previene cada una y su aplicación a SKAT.

| # | Regla | Fallo que previene | Aplicación SKAT |
|---|---|---|---|
| HR1 | **Rule Zero: todo pasa por un pipeline.** Ninguna producción con scripts ad-hoc; identificar pipeline → leer manifiesto → preflight → etapa por etapa. | Agente que improvisa código y se salta gates/calidad/auditoría. | Claude Code/Cowork no tocan Remotion/Supabase/Meta sin un manifiesto de flujo declarado. El atajo improvisado = principal fuente de trabajo no auditable. |
| HR2 | **Present Both Runtimes.** Con dos caminos válidos, presentar ambos con tradeoff y esperar elección; default en silencio prohibido. | Agente colapsa decisiones abiertas en su preferencia sin que el humano vea la alternativa. | Dos proveedores TTS, plantilla vs bespoke, dos rutas de deploy → listar ambos con costo/tradeoff, nunca defaultear callado. |
| HR3 | **No Unilateral Substitutions.** Si el camino aprobado se bloquea, investigar/preparar alternativas pero NO ejecutarlas sin aprobación. Swap silencioso = violación. | **Downgrade silencioso** (video con movimiento → slideshow sin avisar). | Si el proveedor aprobado falla, el agente para y propone; jamás sustituye modelo/servicio por su cuenta. |
| HR4 | **Announce Before Execution.** Antes de toda llamada paga: tool exacta, proveedor, modelo, razón, y si es sample o batch. | Usuario tiene que inferir a posteriori qué se ejecutó y con qué costo. | Pre-anuncio "voy a llamar X, ~$Y, modo sample" antes de gastar (Gemini, render, Meta boost). |
| HR5 | **El manifiesto es vinculante; no se re-juzga.** `human_approval_default` por etapa es la única autoridad; el escritor de checkpoints lanza GATE VIOLATION si se cierra sin aprobación. | Política de aprobación confiada a la buena voluntad del LLM. | Política en config declarativa + guardián en código que rechaza cierres sin aprobación. No la dejes solo en el prompt. |
| HR6 | **Workspace canónico.** Todo output a `projects/<id>/` con `output_path` explícito; assets en temp/raíz son invisibles y violan el contrato. | Trabajo huérfano e inauditable. | Cada corrida = carpeta canónica; nada fuera cuenta como entregable. Encaja con tu convención de carpetas por repo. |

---

## 3. Modelo de gobernanza — gates y checkpoints

- **G1 — Máquina de estados con artifact canónico por etapa.** Cada etapa produce UN JSON validado contra schema, que es el contrato de entrada de la siguiente. Handoffs deterministas. → SKAT: artifacts canónicos versionados entre fases (brief→build→deploy) validados en cada frontera Web↔Code↔Cowork.
- **G2 — Gate de aprobación por-etapa con fin de turno forzado.** En etapa gateada: checkpoint `awaiting_human`, presentar resumen + hallazgos + snapshot de costo, y **terminar el turno**. "Present and continue" no es esperar. → SKAT: en un gate, el agente entrega y cede control; no encadena la siguiente fase en el mismo mensaje.
- **G3 — Aprobación por-gate, sin pre-autorización implícita.** Un "dale, hazlo todo" temprano NO cubre gates posteriores, salvo que se registre como entrada `decision_log` (`category: approval_policy`) en el momento. → SKAT: aprobaciones amplias solo valen si quedan logueadas; si no, para en cada gate.
- **G4 — Gate de assets antes de renderizar.** Se revisa el storyboard escena-por-escena (filmstrip) con gasto acumulado + costo proyectado, **sin renderizar un draft** (renderizar para ganarte la revisión salta el gate). Un asset malo atrapado aquí evita un re-render caro. → SKAT: gate barato de revisión *antes* del paso caro/irreversible (deploy, render final, envío masivo).
- **G5 — Sample gate antes de batch.** Generar un espécimen corto (clip 10-15s, 1 variante de ad, 1 respuesta del bot), mostrar costo del sample vs proyectado del total, aprobar/revisar/abortar. → SKAT: siempre un espécimen aprobable antes de generar los 20 restantes.
- **G6 — Escalar bloqueos con estructura fija de 5 campos:** (1) qué se intentó, (2) qué falló, (3) tipo de fallo (auth/acceso-proveedor/bug/calidad-de-prompt), (4) opciones, (5) recomendación con razón. → SKAT: plantilla de escalación en vez de reintentos silenciosos o rendición. Encaja con tu regla 40-min.

---

## 4. Patrones anti-fallo (el corazón del "hazte más potente")

- **AF1 — Crítica anclada (reglas CHAI).** Todo hallazgo cita campo/línea/frame concreto (*Accurate*); si hallas un error, barre la misma clase antes de volver (*Complete*); todo `critical` carga su fix propuesto o se degrada a `investigation` (*Constructive*). → SKAT: el auto-review cita evidencia (nodo n8n legacy, línea de código, campo Supabase); prohíbe la crítica vaga.
- **AF2 — Anti-downgrade-silencioso.** Define "promesas de entrega" no-negociables por tipo de trabajo y un check automático que detecte si el output las incumple (motion-led exige ≥70% movimiento real; slides no cuentan). → SKAT: aplícalo a video ads (la "promesa" del chat-sim animado) y a deploys (la promesa de "sistema real, no mock").
- **AF3 — Anti-scope-creep con umbral de costo.** Gasto real > estimado en +30% sin re-aprobación → CRITICAL. → SKAT: umbral de deriva sobre el costo aprobado que dispara re-aprobación automática.
- **AF4 — Anti-perfeccionismo: máx 2 rondas.** Reviewer advisory, nunca bloqueo infinito; tras 2 rondas → "pass con warnings" y avanza. *"El perfeccionismo mata pipelines."* → SKAT: tope duro de iteraciones de auto-corrección. Encaja con tu regla 40-min (>40min sin fix = parálisis).
- **AF5 — Anti-saltarse-gates: doble candado.** El gate no depende de que el LLM se porte bien: código rechaza el cierre no aprobado + reviewer verifica que la doctrina se cumplió. → SKAT: ya lo haces con candados; añade el reviewer como segunda capa.
- **AF6 — Anti-alucinación-de-fuente.** Antes de construir sobre input del cliente (workflow clonado, doc, dataset), sondearlo de verdad; prohibido planear sobre nombres/metadatos. → SKAT: alinea directo con `skat-diagnostico-workflow-clonado` — el schema `akl_source_review` (§7) lo codifica como dato obligatorio.
- **AF7 — Anti-sameness (distinción obligatoria).** Un check registrable: "¿este entregable podría ser de cualquier otro producto?" / "¿reusa un look que ya hice?" La ausencia del registro es CRITICAL. → SKAT: check anti-genérico para ads/agentes ("¿esto suena a cualquier bot / cualquier marca?").

---

## 5. Meta-patrones que suben la potencia del orquestador

- **M1 — Resume-from-failure vía checkpoints intra-etapa.** Al entrar a una etapa: checkpoint `in_progress` (señal de "vivo, no colgado"); en loops largos refrescar `partial_progress` con `completed_ids` tras cada unidad. Crash en escena 4 → reanuda en 4. → SKAT: deploy multi-cliente y generación batch de ads reanudables donde fallaron.
- **M2 — Self-review estructurado antes de todo checkpoint**, que inspecciona el artefacto *ejecutado* (workflow corriendo, video renderizado), no solo el plan. → SKAT: un reviewer meta reutilizable en cada frontera.
- **M3 — Capability-extension con guardrails.** En vez de "nunca escribas scripts": clasificar el gap (one-off / recurrente / proveedor faltante / conocimiento faltante); scripts ad-hoc solo si son idempotentes, producen artefacto en workspace, se loguean como `capability_extension`, no llaman APIs sin aprobación, y nunca modifican tools existentes (crear wrappers). → SKAT: carril legítimo para que Code cree capacidad nueva bajo reglas, en vez de improvisar fuera del sistema.
- **M4 — Skill-creation dinámica.** Cuando un patrón *reusable* se repite, promoverlo a skill con estructura fija (When to Use / Process numerado / rúbrica de auto-scoring / pitfalls); NO para one-offs. *"Enseñar a pensar, no solo a hacer."* → SKAT: el orquestador acumula doctrina en vez de re-descubrirla — crece tu librería `skat-*`.
- **M5 — Onboarding guiado por descubrimiento real.** Sondear qué conectores/credenciales tiene el cliente y ofrecer solo caminos ejecutables *ahora*, con upgrades opcionales; nunca prometer lo que el entorno no soporta; nunca hardcodear nombres de proveedor (leerlos del registro). → SKAT: onboarding ARCIA Discovery que detecta el "tier" real del cliente.
- **M6 — Preflight con rollup human-ready + warnings verbatim.** Mostrar "X de Y configurado" por capacidad y surfacear las advertencias de entorno **tal cual** — "un tool disponible que en realidad no resuelve es el bug de fallo-silencioso más peligroso". → SKAT: preflight que expone el envelope real de capacidades sin maquillarlo.
- **M7 — Taste-profile portátil con diales numéricos.** `design_read` (una frase específica, no "moderno/limpio") + diales 1-10 (variación visual / intensidad de motion / densidad de info) + `anti_patterns` + `quality_gates`, que viaja por todas las etapas y el reviewer verifica downstream. → SKAT: perfil de gusto por campaña/agente que se propaga al prompt de generación y es verificable.

---

## 6. Tool-registry y scoring multi-proveedor

**6.1 — Contrato uniforme de tool.** Toda integración declara metadata estática: identidad (`name`, `version`, `tier`, `stability`, `provider`, `capability`), naturaleza (`execution_mode`, `determinism`, `runtime`), `dependencies` con prefijos tipados (`env:META_ACCESS_TOKEN`, `cmd:ffmpeg`), capacidades semánticas (`capabilities`, `supports:{}`, `best_for:[]`, `not_good_for:[]`, `input_schema`), resiliencia (`fallback_tools`, `resume_support`, `idempotency_key_fields`), hints de calidad (`quality_score`, `historical_success_rate`, `latency_p50`), y costo (`estimate_cost`, `dry_run`). Un `get_info()` serializa todo a un dict uniforme; el único método obligatorio es `execute() → ToolResult`. Cada tool tiene `get_status()` que se "apaga solo" si falta su credencial.
→ **SKAT:** tabla Supabase `tool_registry` con este contrato serializado; wrappers TS uniformes sobre Meta/Gemini/Stripe/proveedores de imagen-video. El agente recibe el catálogo y llama por nombre — cero `if provider=="meta"` hardcodeado.

**6.2 — Selección por scoring ponderado explicable.** Reemplaza "primer proveedor disponible" por score 0–1 en 7 dimensiones con pesos fijos: `task_fit` 0.30 (overlap de keywords `best_for`↔intent, con clusters de sinónimos y *overlap coefficient*, no Jaccard), `output_quality` 0.20, `control` 0.15 (features en `supports`), `reliability` 0.15, `cost_efficiency` 0.10, `latency` 0.05, `continuity` 0.05 (premia proveedor ya lockeado). Un `explain()` devuelve las 3 dimensiones que más aportaron. Override de preferencia con guardarraíl: se honra `preferred_provider` solo si su score no cae >0.15 bajo el líder.
→ **SKAT:** cuando haya ≥2 proveedores para una capability. Puebla `historical_success_rate`/`latency_p50` desde tus logs de ejecución para que el scoring mejore solo. El matching por keywords+sinónimos rankea **sin un LLM en el loop caliente** (barato, determinista, auditable).

**6.3 — Registry con auto-discovery + fallback input-aware.** El filesystem/tabla *es* el registro; agregar proveedor = crear su módulo, cero cambios en el selector. Consultas: `get_by_capability`, `get_available`, `find_fallback`. La cadena de fallback es *input-aware*: para operaciones que requieren movimiento se elimina el fallback solo-imagen aunque esté disponible.
→ **SKAT:** agrupa integraciones por capability (`image_generation`, `video_generation`, `ad_publish`, `payment`, `llm`); `getProviderMenu()` le dice al agente/cliente "Meta ✅, Stripe ✅, video-X ❌ (falta key)". El patrón `setup_offers` (qué env var falta) es perfecto para onboarding.

**6.4 — Idempotencia + instrumentación transparente.** `idempotency_key()` = hash de campos declarados → cachear/deduplicar generaciones caras (crítico con Stripe y renders). Cada `execute()` se auto-envuelve con emisión de eventos start/finish/error sin que el autor escriba logging.
→ **SKAT:** clave idempotente por request para no re-generar/re-cobrar; decorador que emite eventos a Supabase para el ticker de actividad en tiempo real.

---

## 7. Contratos de datos (la adopción de mayor ROI y menor esfuerzo)

**La disciplina clave:** el schema no es validación de datos, es **codificación de estándares de proceso**. `minItems`, `const:true`, enums de estado y campos-lock convierten "buenas prácticas del agente" en invariantes que la máquina rechaza si se violan.

**Convenciones a estandarizar en TODOS los contratos AKL:**
- `version` como `const` (fuerza migración explícita, no mezcla silenciosa de versiones).
- `additionalProperties:false` en todo objeto de contrato + un `metadata`/`notas` libre como escape hatch. Si un LLM inventa un campo, la validación falla en el borde de la etapa en vez de propagar basura.
- Estados SIEMPRE enum, nunca string libre.
- `folio` (`AKL-*`) como llave foránea presente en cada artifact para trazar la cadena completa.
- Campos `*_ref` (path/ID) para enlazar artifacts entre instancias sin embeber — Web pasa un ref que Code resuelve.
- Campos "lock" (`cliente_id`, `entorno`, `credencial_set`) que una instancia downstream no puede cambiar sin entrada en `akl_decision_log`.
- `minItems` donde quieras forzar minuciosidad (≥1 chequeo verificado, ≥N pasos de checklist).

**Contratos AKL propuestos** (schemas clean-room incluidos en `schemas/`):

1. **`akl_handoff`** — contrato de handoff entre instancias Claude. Required: `version` (const), `folio`, `from_instance`/`to_instance` (enum web/code/cowork), `status` (enum completed/blocked/awaiting_human/in_progress), `timestamp`, `artifacts` (mapa abierto), y **`estado_actual_verificado` (booleano obligatorio)** — tu candado anti-doble-trabajo como campo validado, no como nota. Ningún handoff se emite sin declarar que se leyó el estado vivo.
2. **`akl_decision_log`** — audit-trail append-only. Cada decisión con `options_considered[]` (incluidas rechazadas + `rejected_because`), `selected`, `reason` (no-boilerplate: "best option" no es razón), `confidence` (0-1 realista; todo a 1.0 = flag), `category` (enum tuyo). Resuelve tu "perder 100h debuggeando lógica cuando era credencial": el log fuerza registrar que se descartó la hipótesis-credencial con razón.
3. **`akl_final_review`** — self-review con evidencia obligatoria antes de declarar listo. `status` enum (pass/revise/fail) + `checks` REQUERIDOS. Para deploy de cliente: `airtable_o_supabase_schema_valid`, `credenciales_verificadas`, `webhook_responde`, `env_vars_presentes`. Prueba que el agente *ejecutó* los chequeos en vez de afirmarlos. `recommended_action` enum (entregar/fix/block).
4. **`akl_cost_ledger`** — estimate→reserve→reconcile por operación, con `budget_verdict` enum y gate de aprobación. Útil si facturas consumo LLM/API a clientes.

---

## 8. Video ads chat-sim — la mina de oro técnica

**El robo #1:** OpenMontage ya resolvió el patrón chat-sim en `ScreenshotScene.tsx` + `TerminalScene.tsx`, y su `SCENE_TYPES.md` incluso nombra `ChatTranscript`/`SlackThread` como los siguientes componentes previstos. La mecánica (reimplementada clean-room en `remotion/ChatSimScene.tsx`):

- **Motor de conversación como `steps[]` temporizado con `walkTimeline`.** Cada step es una primitiva tipada (`message_in`, `message_out` con `stream:true` para reveal palabra-por-palabra, `typing_dots`, `reaction`, `read_receipt`, `pause`, `cta_reveal`). Un solo recorrido asigna a cada step su ventana de frames desde durations por-step; **cero timestamps manuales**. Steps "blocking" avanzan el reloj; no-blocking (badges, highlights) se solapan. Generar un ad = escribir la lista de mensajes con sus pausas.
- **Una composición paramétrica + dispatch por tipo + `calculateMetadata`.** UN solo `<Composition ChatSimReel>` (1080×1920, 30fps) manejado 100% por props JSON; la duración se deriva de la data. Batch-rendable: MILA/LOLA/ARCIA y cada test A/B = un JSON de props distinto sobre el mismo binario.
- **Theme system por marca/agente.** `ThemeConfig` central (accent, fondo, highlight de caption, fuentes) inyectado como prop; `resolveTheme` acepta nombre o objeto custom. Re-brandear un reel entero = cambiar un prop `theme`. *"Prevents every video looking like dark fintech."*
- **Sistema de capas.** (0) fondo, (1) burbujas como steps temporizados, (2) overlays de branding/CTA/badge en lista separada con `placement`, (3) captions grandes, (4) audio (SFX de notificación por mensaje + música con ducking). Overlays NUNCA mezclados con las capas de escena.
- **Props flat + cheat-sheet.** Todas las props al top-level del cut (no anidadas bajo `props`); mantén un `CHAT_SCENE_TYPES.md` que mapee cada tipo de step → campos, para que un agente genere props válidas sin leer el TSX.

**Constraints Remotion que te van a morder (documentados para no repetir el dolor):**
- Prohibido CSS animations/transitions y clases `animate-*` de Tailwind (no renderizan frame-a-frame). Todo movimiento con `useCurrentFrame()` + `interpolate()`/`spring()`.
- Siempre `extrapolateLeft/Right: 'clamp'` en `interpolate`.
- `useVideoConfig().durationInFrames` es la duración de la COMPOSICIÓN, no del `<Sequence>` — footgun #1. Pasa `sceneDurationSeconds` como prop y calcula dentro.
- Node 18+; renderizar en serie (cada render abre un Chromium).

**Reglas de calidad probadas (zero-key vertical):**
- Cadencia de burbujas ~1.5–3s; `typing_dots` ~1.2s obligatorio antes de cada respuesta del agente (vende "IA que responde al instante"); hook que detiene scroll en los primeros 2s; CTA con hold ≥4s.
- Un solo "background family" por reel (evita flashes).
- **Texto exacto NUNCA por imagen generada.** CTA, @ del negocio, teléfono, precio, claim de oferta = componente Remotion, nunca pixel AI (alucinan texto). Crítico para ads.
- Captions vertical: 3-4 palabras por cue, en el 20% inferior, nunca sobre la cara. Meta se ve en mute → captions casi obligatorios. Timestamps word-level vía WhisperX → formato `{word,startMs,endMs}`, NO SRT cuando renderizas en Remotion.
- **Verificación post-render obligatoria:** `ffprobe` (¿stream de audio? ¿1080×1920 exacto? ¿fps? ¿duración?) + extraer frames del hook y del CTA + (si hay voz) transcribir el MP4 y comparar contra el guion (<80% palabras = audio cortado). Nunca entregar un reel sin esto.

**La cadena de artifacts reducida para reels:**
`brief` (agente, objetivo Click-to-Message, gancho, duración 15-30s) → `guion_conversacional` (turnos user/agent con timing) → `scene_plan` (mapeo de turnos a beats + overlays) → `asset_manifest` (avatar, TTS opcional, música) → `edit_decisions` (los `steps[]` + captions + audio) → render. El valor: cada etapa reanudable, revisable, aprobable por separado; **cambiar el guion no re-genera los assets.**

---

## 9. Ruta de adopción (de menor a mayor esfuerzo)

**Fase 0 — Hoy, sin código (solo prompt/doctrina):**
1. Inyecta las **reglas CHAI** (AF1) y el **protocolo de gates** (§3) como secciones de prompt en tu doctrina de agentes y en `skat-video-ads-chat-sim-v1`.
2. Adopta la **plantilla de escalación de 5 campos** (G6) y el **tope de 2 rondas** (AF4).

**Fase 1 — Contratos de datos (máximo ROI/esfuerzo):**
3. Define los 4 schemas `akl_*` (§7, incluidos en `schemas/`). Empieza por `akl_handoff` (codifica tu candado anti-doble-trabajo) y `akl_final_review` (deploy de cliente con evidencia).
4. Valida los handoffs Web↔Code↔Cowork contra schema en cada frontera.

**Fase 2 — Tools de video (clean-room, incluidos en `tools/`):**
5. Integra el **pre-compose validator** (`tools/chatsim-precompose-validator.ts`) — ffprobe + checks de timing/overflow/safe-zones antes de renderizar.
6. Integra el **static-DM risk scorer** (`tools/static-dm-risk.ts`) como gate pre-render.
7. Construye el **`ChatSimScene`** (`remotion/ChatSimScene.tsx`) como motor de tus reels.

**Fase 3 — Orquestación (mayor esfuerzo, mayor palanca):**
8. Tabla `tool_registry` + scoring ponderado (§6) cuando tengas ≥2 proveedores por capability.
9. `cost_ledger` estimate/reserve/reconcile (§6.3 + `akl_cost_ledger`) si facturas consumo a clientes.

Todo reescrito desde cero. **OpenMontage es el mapa, no la mina.**

---

*Doctrina destilada — SKAT / ArketLabs · patrón sí, código no · 2026-07-08*
