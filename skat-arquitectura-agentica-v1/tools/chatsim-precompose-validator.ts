/**
 * chatsim-precompose-validator.ts
 *
 * Validador pre-render determinista para reels chat-sim 9:16 (Meta Click-to-Message).
 * Corre ANTES de renderizar para atrapar problemas caros barato. Cero IA, cero API.
 *
 * Implementacion clean-room ArketLabs (patron inspirado en OpenMontage, sin heredar codigo AGPL).
 *
 * Uso:
 *   const report = await validateChatSimComposition(props, { assetsRoot: "public/", videoDurationS });
 *   if (!report.valid) throw new Error(report.errors.join("; "));
 */

import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, isAbsolute } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// ---- Contrato de props que validamos (subconjunto minimo de ChatSimReel) ----

export type ChatStep =
  | { type: "message_in"; text: string; durationS: number }
  | { type: "message_out"; text: string; durationS: number; stream?: boolean }
  | { type: "typing_dots"; durationS: number }
  | { type: "reaction"; emoji: string; durationS: number }
  | { type: "read_receipt"; durationS: number }
  | { type: "pause"; durationS: number }
  | { type: "cta_reveal"; text: string; durationS: number };

export interface ChatSimAudio {
  narrationSrc?: string;
  musicSrc?: string;
  sfxSrc?: string;
}

export interface ChatSimProps {
  fps?: number; // default 30
  width?: number; // debe ser 1080
  height?: number; // debe ser 1920
  avatarSrc?: string;
  backgroundSrc?: string;
  steps: ChatStep[];
  audio?: ChatSimAudio;
  overlays?: Array<{ type: string; content: string; placement: string }>;
}

export interface ValidateOptions {
  assetsRoot?: string; // raiz para resolver rutas relativas de assets (ej. remotion-composer/public)
  /** Presupuesto de caracteres por linea a font-size movil legible. Default 24. */
  maxCharsPerLine?: number;
  /** Lineas maximas razonables por burbuja antes de warning. Default 4. */
  maxLinesPerBubble?: number;
}

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
  videoDurationS: number;
}

const META_SAFE_TOP = 0.14; // 14% superior reservado por UI de IG
const META_SAFE_BOTTOM = 0.2; // 20% inferior reservado por UI/CTA

/** Resuelve una duracion de audio con ffprobe. Devuelve null si no se puede. */
async function probeDurationS(path: string): Promise<number | null> {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

function resolveAsset(src: string, assetsRoot?: string): string {
  if (isAbsolute(src) || !assetsRoot) return src;
  return join(assetsRoot, src);
}

export async function validateChatSimComposition(
  props: ChatSimProps,
  opts: ValidateOptions = {},
): Promise<ValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const fps = props.fps ?? 30;
  const maxChars = opts.maxCharsPerLine ?? 24;
  const maxLines = opts.maxLinesPerBubble ?? 4;

  // --- Check 1: formato 9:16 exacto para Meta ---
  const w = props.width ?? 1080;
  const h = props.height ?? 1920;
  if (w !== 1080 || h !== 1920) {
    errors.push(`Resolucion ${w}x${h} no es 1080x1920 (9:16 requerido por Meta Reels/Stories)`);
  }

  // --- Check 2: hay steps ---
  if (!props.steps || props.steps.length === 0) {
    errors.push("La conversacion no tiene steps");
    return finalize(errors, warnings, info, 0);
  }

  // --- Check 3: cada step tiene duracion positiva; sumar duracion total ---
  let videoDurationS = 0;
  props.steps.forEach((s, i) => {
    const d = (s as { durationS?: number }).durationS;
    if (typeof d !== "number" || d <= 0) {
      errors.push(`Step #${i} (${s.type}): durationS invalida o <= 0`);
    } else {
      videoDurationS += d;
    }
  });
  info.push(`Duracion derivada: ${videoDurationS.toFixed(2)}s (${props.steps.length} steps, ${fps}fps)`);

  // --- Check 4: hook detiene scroll — el primer beat "de contenido" cae en <=2s ---
  const firstContentIdx = props.steps.findIndex(
    (s) => s.type === "message_in" || s.type === "message_out",
  );
  if (firstContentIdx === -1) {
    warnings.push("No hay ninguna burbuja de mensaje (message_in/out) en la conversacion");
  } else {
    let tBeforeFirst = 0;
    for (let i = 0; i < firstContentIdx; i++) tBeforeFirst += props.steps[i].durationS;
    if (tBeforeFirst > 2.0) {
      warnings.push(
        `El primer mensaje aparece a los ${tBeforeFirst.toFixed(1)}s — el hook debe detener el scroll en <=2s`,
      );
    }
  }

  // --- Check 5: typing_dots antes de cada respuesta del agente (message_out) ---
  props.steps.forEach((s, i) => {
    if (s.type === "message_out") {
      const prev = props.steps[i - 1];
      if (!prev || prev.type !== "typing_dots") {
        warnings.push(
          `Step #${i}: message_out sin typing_dots previo — el "..." vende la respuesta instantanea de la IA`,
        );
      }
    }
  });

  // --- Check 6: texto no desborda a font-size movil ---
  props.steps.forEach((s, i) => {
    const text = (s as { text?: string }).text;
    if (typeof text === "string" && text.length > 0) {
      const lines = Math.ceil(text.length / maxChars);
      if (lines > maxLines) {
        warnings.push(
          `Step #${i} (${s.type}): ~${lines} lineas a ${maxChars} chars/linea (>${maxLines}) — nadie escribe parrafos por DM; parte el mensaje`,
        );
      }
    }
  });

  // --- Check 7: CTA presente y con hold suficiente (>=4s) ---
  const ctas = props.steps.filter((s) => s.type === "cta_reveal");
  if (ctas.length === 0) {
    errors.push("No hay cta_reveal — un ad Click-to-Message necesita CTA accionable");
  } else {
    const lastCtaHold = ctas[ctas.length - 1].durationS;
    if (lastCtaHold < 4.0) {
      warnings.push(`El CTA final tiene hold de ${lastCtaHold}s (<4s) — dale tiempo para tap`);
    }
  }

  // --- Check 8: assets referenciados existen ---
  const assetRefs: Array<[string, string]> = [];
  if (props.avatarSrc) assetRefs.push(["avatar", props.avatarSrc]);
  if (props.backgroundSrc) assetRefs.push(["background", props.backgroundSrc]);
  if (props.audio?.narrationSrc) assetRefs.push(["narration", props.audio.narrationSrc]);
  if (props.audio?.musicSrc) assetRefs.push(["music", props.audio.musicSrc]);
  if (props.audio?.sfxSrc) assetRefs.push(["sfx", props.audio.sfxSrc]);

  for (const [label, src] of assetRefs) {
    const resolved = resolveAsset(src, opts.assetsRoot);
    if (!existsSync(resolved)) {
      errors.push(`Asset faltante (${label}): ${src} (busque en ${resolved})`);
    }
  }

  // --- Check 9: duracion de audio vs video (ffprobe) ---
  if (props.audio?.narrationSrc) {
    const resolved = resolveAsset(props.audio.narrationSrc, opts.assetsRoot);
    if (existsSync(resolved)) {
      const dur = await probeDurationS(resolved);
      if (dur === null) {
        warnings.push(`No se pudo sondear duracion de narracion: ${props.audio.narrationSrc}`);
      } else {
        info.push(`Narracion: ${dur.toFixed(1)}s`);
        const overshoot = dur - videoDurationS;
        if (overshoot > 1.0) {
          errors.push(
            `Narracion (${dur.toFixed(1)}s) excede el video (${videoDurationS.toFixed(1)}s) por ${overshoot.toFixed(1)}s — el audio se cortaria`,
          );
        } else if (overshoot > 0) {
          warnings.push(`Narracion (${dur.toFixed(1)}s) excede levemente el video por ${overshoot.toFixed(1)}s`);
        }
      }
    }
  }
  if (props.audio?.musicSrc) {
    const resolved = resolveAsset(props.audio.musicSrc, opts.assetsRoot);
    if (existsSync(resolved)) {
      const dur = await probeDurationS(resolved);
      if (dur !== null && dur < videoDurationS) {
        warnings.push(`Musica (${dur.toFixed(1)}s) mas corta que el video (${videoDurationS.toFixed(1)}s) — terminara antes`);
      }
    }
  }

  // --- Check 10: overlays en safe-zones de Meta ---
  (props.overlays ?? []).forEach((o, i) => {
    const p = o.placement.toLowerCase();
    const risky =
      p.includes("top") && !p.includes("safe")
        ? "zona superior (UI de IG)"
        : p.includes("bottom") && !p.includes("safe")
          ? "zona inferior (CTA/UI de IG)"
          : null;
    if (risky) {
      warnings.push(
        `Overlay #${i} "${o.content}" en ${risky} — respeta ${Math.round(META_SAFE_TOP * 100)}% sup / ${Math.round(META_SAFE_BOTTOM * 100)}% inf`,
      );
    }
  });

  return finalize(errors, warnings, info, videoDurationS);
}

function finalize(
  errors: string[],
  warnings: string[],
  info: string[],
  videoDurationS: number,
): ValidationReport {
  return { valid: errors.length === 0, errors, warnings, info, videoDurationS };
}
