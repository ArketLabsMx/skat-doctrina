/**
 * static-dm-risk.ts
 *
 * Scorer determinista de "riesgo de screenshot": mide si un reel chat-sim se sentira
 * como una captura de pantalla animada en vez de una conversacion viva. Corre ANTES
 * del render; si el veredicto es "fail", el guion se re-planea, no se renderiza.
 *
 * Cada dimension se puntua 0-5 (MENOR es mejor). Promedio -> veredicto.
 * Analogo al slideshow-risk de OpenMontage, reimplementado clean-room para el dominio chat-sim.
 *
 * Uso:
 *   const r = scoreStaticDmRisk(props.steps);
 *   if (r.verdict === "fail") { ...re-planear guion... }
 */

import type { ChatStep } from "./chatsim-precompose-validator";

export interface DimensionScore {
  score: number; // 0-5, menor mejor
  reason: string;
}

export interface StaticDmRiskReport {
  average: number;
  verdict: "strong" | "acceptable" | "revise" | "fail";
  dimensions: Record<string, DimensionScore>;
}

function bubbles(steps: ChatStep[]): Array<Extract<ChatStep, { text: string }>> {
  return steps.filter(
    (s): s is Extract<ChatStep, { text: string }> =>
      s.type === "message_in" || s.type === "message_out" || s.type === "cta_reveal",
  );
}

/** typing_indicator_ausente: burbujas del agente que aparecen sin "..." previo. */
function scoreTypingIndicator(steps: ChatStep[]): DimensionScore {
  const outs = steps.filter((s) => s.type === "message_out");
  if (outs.length === 0) return { score: 0, reason: "Sin respuestas del agente que evaluar" };
  let missing = 0;
  steps.forEach((s, i) => {
    if (s.type === "message_out" && steps[i - 1]?.type !== "typing_dots") missing++;
  });
  const ratio = missing / outs.length;
  return {
    score: Math.min(5, ratio * 5),
    reason: `${missing}/${outs.length} respuestas del agente sin typing_dots previo (${Math.round(ratio * 100)}%)`,
  };
}

/** ritmo_uniforme: si casi todos los steps duran casi lo mismo -> robotico. */
function scoreRhythm(steps: ChatStep[]): DimensionScore {
  const durs = steps.map((s) => s.durationS);
  if (durs.length < 3) return { score: 0, reason: "Muy pocos steps para evaluar ritmo" };
  const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
  const variance = durs.reduce((a, d) => a + (d - mean) ** 2, 0) / durs.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coef. de variacion
  // cv bajo (todo igual) = riesgo alto. cv >= 0.5 se considera buena variacion.
  const score = Math.max(0, Math.min(5, (0.5 - cv) / 0.5) * 5);
  return {
    score,
    reason: `Coef. de variacion de duraciones ${cv.toFixed(2)} (bajo = ritmo robotico; objetivo >=0.5)`,
  };
}

/** sin_scroll: conversaciones largas sin suficientes beats para justificar scroll natural. */
function scoreScroll(steps: ChatStep[]): DimensionScore {
  const b = bubbles(steps);
  if (b.length <= 4) return { score: 0, reason: "Conversacion corta, no requiere scroll" };
  // Con >4 burbujas esperamos que el motor haga auto-scroll; penaliza si todo cabe estatico.
  // Heuristica: >6 burbujas sin pausas intercaladas se lee como muro estatico.
  const pauses = steps.filter((s) => s.type === "pause").length;
  const density = b.length / Math.max(1, pauses + 1);
  const score = b.length > 6 && density > 4 ? Math.min(5, density - 1) : Math.max(0, density - 3);
  return {
    score: Math.min(5, score),
    reason: `${b.length} burbujas, ${pauses} pausas — densidad ${density.toFixed(1)} (alta = muro estatico sin respiro)`,
  };
}

/** sin_micro_motion: falta de reveals streaming, reacciones o read receipts que den vida. */
function scoreMicroMotion(steps: ChatStep[]): DimensionScore {
  const outs = steps.filter((s) => s.type === "message_out") as Array<
    Extract<ChatStep, { type: "message_out" }>
  >;
  const streamed = outs.filter((s) => s.stream).length;
  const life = steps.filter((s) => s.type === "reaction" || s.type === "read_receipt").length;
  const streamRatio = outs.length > 0 ? streamed / outs.length : 1;
  let score = 0;
  const reasons: string[] = [];
  if (streamRatio < 0.5) {
    score += (0.5 - streamRatio) * 6;
    reasons.push(`solo ${Math.round(streamRatio * 100)}% de respuestas con stream (reveal palabra-por-palabra)`);
  }
  if (life === 0 && bubbles(steps).length > 3) {
    score += 1.5;
    reasons.push("sin reacciones ni read receipts");
  }
  return {
    score: Math.min(5, score),
    reason: reasons.length ? reasons.join("; ") : "Micro-motion suficiente",
  };
}

/** texto_muro: burbujas demasiado largas dominan la conversacion. */
function scoreWallOfText(steps: ChatStep[], maxCharsShort = 90): DimensionScore {
  const b = bubbles(steps);
  if (b.length === 0) return { score: 0, reason: "Sin burbujas" };
  const long = b.filter((s) => s.text.length > maxCharsShort).length;
  const ratio = long / b.length;
  return {
    score: Math.min(5, ratio * 5),
    reason: `${long}/${b.length} burbujas >${maxCharsShort} chars (${Math.round(ratio * 100)}%) — DMs reales son cortos`,
  };
}

/** cta_debil: el CTA final no tiene hold ni contraste (reveal dedicado). */
function scoreWeakCta(steps: ChatStep[]): DimensionScore {
  const ctas = steps.filter((s) => s.type === "cta_reveal");
  if (ctas.length === 0) return { score: 5, reason: "Sin cta_reveal — riesgo maximo para un ad" };
  const hold = ctas[ctas.length - 1].durationS;
  if (hold >= 4) return { score: 0, reason: `CTA con hold ${hold}s (>=4s)` };
  return { score: Math.min(5, (4 - hold) * 1.5), reason: `CTA con hold ${hold}s (<4s) — debil para el tap` };
}

export function scoreStaticDmRisk(steps: ChatStep[]): StaticDmRiskReport {
  if (!steps || steps.length === 0) {
    return { average: 5, verdict: "fail", dimensions: {} };
  }

  const dimensions: Record<string, DimensionScore> = {
    typing_indicator_ausente: scoreTypingIndicator(steps),
    ritmo_uniforme: scoreRhythm(steps),
    sin_scroll: scoreScroll(steps),
    sin_micro_motion: scoreMicroMotion(steps),
    texto_muro: scoreWallOfText(steps),
    cta_debil: scoreWeakCta(steps),
  };

  const scores = Object.values(dimensions).map((d) => d.score);
  const average = scores.reduce((a, b) => a + b, 0) / scores.length;

  let verdict: StaticDmRiskReport["verdict"];
  if (average < 2.0) verdict = "strong";
  else if (average < 3.0) verdict = "acceptable";
  else if (average < 4.0) verdict = "revise";
  else verdict = "fail";

  return { average: Math.round(average * 100) / 100, verdict, dimensions };
}
