# SKAT × OpenMontage — bundle de potenciación

Activos destilados de OpenMontage (AGPLv3) reescritos clean-room para ArketLabs. **Patrón sí, código no**: ningún archivo aquí copia fuente de OpenMontage; son implementaciones originales de sus patrones.

## Contenido

```
DOCTRINA-OPENMONTAGE-TRANSFERIBLE.md   ← el activo central: toda la doctrina transferible
schemas/
  akl_handoff.schema.json              ← handoff Web↔Code↔Cowork con candado anti-doble-trabajo obligatorio
  akl_decision_log.schema.json         ← audit-trail append-only de decisiones
  akl_final_review.schema.json         ← self-review con evidencia antes de declarar listo
tools/
  chatsim-precompose-validator.ts      ← validación pre-render (ffprobe, timing, overflow, safe-zones Meta)
  static-dm-risk.ts                    ← scorer "¿parece screenshot o conversación viva?" (gate pre-render)
remotion/
  ChatSimScene.tsx                     ← motor chat-sim: steps[] tipados + walkTimeline + theme por marca
```

## Cómo usarlo

1. **Lee la doctrina** — es el mapa completo (gobernanza, gates, tool-registry, contratos, video).
2. **Fase 1 (máximo ROI):** adopta los 3 schemas `akl_*` para tus handoffs y deploys. Valídalos con `ajv`.
3. **Fase 2:** integra el validator + risk scorer como gate pre-render en `skat-video-ads-chat-sim-v1`, y `ChatSimScene` como motor de reels.

### Ejemplo — gate pre-render

```ts
import { validateChatSimComposition } from "./tools/chatsim-precompose-validator";
import { scoreStaticDmRisk } from "./tools/static-dm-risk";

const report = await validateChatSimComposition(props, { assetsRoot: "remotion-composer/public" });
if (!report.valid) throw new Error("Pre-compose falló: " + report.errors.join("; "));

const risk = scoreStaticDmRisk(props.steps);
if (risk.verdict === "fail") {
  // re-planear guión: risk.dimensions muestra qué dimensión falla
}
```

## Ruta de adopción

Ver §9 de la doctrina. Resumen: Fase 0 (prompt/doctrina, hoy) → Fase 1 (contratos de datos) → Fase 2 (tools de video) → Fase 3 (tool-registry + cost ledger).

---

*ArketLabs · SKAT v4.1 · 2026-07-08*
