/**
 * ChatSimScene.tsx — motor de conversacion chat-sim para reels 9:16 (Meta Click-to-Message).
 *
 * Patron (reimplementado clean-room, sin heredar codigo AGPL de OpenMontage):
 *   - La conversacion es una lista `steps[]` de primitivas tipadas.
 *   - `walkTimeline()` recorre los steps UNA vez y asigna a cada uno su ventana de frames
 *     a partir de duraciones por-step. CERO timestamps manuales. Steps "blocking" avanzan
 *     el reloj; los no-blocking (reaction, read_receipt) se solapan sobre el anterior.
 *   - Una sola composicion parametrica; la duracion se deriva de la data (calculateMetadata).
 *   - Theme por marca/agente inyectado como prop.
 *
 * Reglas Remotion respetadas:
 *   - Todo movimiento con useCurrentFrame() + interpolate()/spring(); nada de CSS animation.
 *   - interpolate siempre con extrapolateLeft/Right: 'clamp'.
 *   - Nunca se usa useVideoConfig().durationInFrames para la duracion de una escena.
 */

import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import type { ChatStep } from "../tools/chatsim-precompose-validator";

// ----------------------------- Theme -----------------------------

export interface ChatTheme {
  background: string;
  bubbleIn: string; // burbuja del usuario
  bubbleOut: string; // burbuja del agente
  textIn: string;
  textOut: string;
  accent: string; // CTA / branding
  fontFamily: string;
}

export const THEMES: Record<string, ChatTheme> = {
  MILA: {
    background: "#0f0f12",
    bubbleIn: "#2a2a30",
    bubbleOut: "#e6447f",
    textIn: "#f2f2f5",
    textOut: "#ffffff",
    accent: "#e6447f",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  LOLA: {
    background: "#0d1117",
    bubbleIn: "#21262d",
    bubbleOut: "#2f6feb",
    textIn: "#f0f6fc",
    textOut: "#ffffff",
    accent: "#2f6feb",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  ARCIA: {
    background: "#0b1410",
    bubbleIn: "#1b2620",
    bubbleOut: "#1fb265",
    textIn: "#eafaf0",
    textOut: "#ffffff",
    accent: "#1fb265",
    fontFamily: "Inter, system-ui, sans-serif",
  },
};

export function resolveTheme(t?: string | ChatTheme): ChatTheme {
  if (!t) return THEMES.MILA;
  if (typeof t === "string") return THEMES[t] ?? THEMES.MILA;
  return t;
}

// ----------------------------- Timeline -----------------------------

const BLOCKING = new Set<ChatStep["type"]>([
  "message_in",
  "message_out",
  "typing_dots",
  "pause",
  "cta_reveal",
]);

export interface TimedStep {
  step: ChatStep;
  startFrame: number;
  endFrame: number;
  index: number;
}

/**
 * Recorre los steps y asigna ventanas de frames. Los blocking avanzan el cursor;
 * los no-blocking (reaction, read_receipt) se anclan al final del cursor actual
 * y se solapan sin avanzarlo.
 */
export function walkTimeline(steps: ChatStep[], fps: number): TimedStep[] {
  const out: TimedStep[] = [];
  let cursor = 0;
  steps.forEach((step, index) => {
    const durFrames = Math.max(1, Math.round(step.durationS * fps));
    const startFrame = cursor;
    const endFrame = cursor + durFrames;
    out.push({ step, startFrame, endFrame, index });
    if (BLOCKING.has(step.type)) cursor = endFrame;
  });
  return out;
}

export function totalFrames(steps: ChatStep[], fps: number): number {
  const timed = walkTimeline(steps, fps);
  return timed.reduce((max, t) => Math.max(max, t.endFrame), 1);
}

// ----------------------------- Bubbles -----------------------------

const BubbleIn: React.FC<{ text: string; theme: ChatTheme }> = ({ text, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18, mass: 0.6 } });
  const y = interpolate(s, [0, 1], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", opacity: s, transform: `translateY(${y}px)` }}>
      <span
        style={{
          maxWidth: "72%",
          background: theme.bubbleIn,
          color: theme.textIn,
          borderRadius: 28,
          borderBottomLeftRadius: 8,
          padding: "20px 26px",
          fontSize: 40,
          lineHeight: 1.25,
          fontFamily: theme.fontFamily,
        }}
      >
        {text}
      </span>
    </div>
  );
};

const BubbleOut: React.FC<{ text: string; stream?: boolean; durationS: number; theme: ChatTheme }> = ({
  text,
  stream,
  durationS,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18, mass: 0.6 } });
  const y = interpolate(s, [0, 1], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Reveal palabra-por-palabra sobre la ventana de esta escena (no la composicion).
  const effectiveFrames = Math.max(1, Math.round(durationS * fps));
  let shown = text;
  if (stream) {
    const chars = Math.round(
      interpolate(frame, [0, effectiveFrames * 0.8], [0, text.length], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    );
    shown = text.slice(0, chars);
  }

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", opacity: s, transform: `translateY(${y}px)` }}>
      <span
        style={{
          maxWidth: "72%",
          background: theme.bubbleOut,
          color: theme.textOut,
          borderRadius: 28,
          borderBottomRightRadius: 8,
          padding: "20px 26px",
          fontSize: 40,
          lineHeight: 1.25,
          fontFamily: theme.fontFamily,
        }}
      >
        {shown}
      </span>
    </div>
  );
};

const TypingDots: React.FC<{ theme: ChatTheme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const dot = (i: number) => {
    const o = interpolate((frame + i * 6) % 30, [0, 15, 30], [0.3, 1, 0.3], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return <span key={i} style={{ opacity: o, fontSize: 44, color: theme.textIn }}>•</span>;
  };
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <span style={{ background: theme.bubbleIn, borderRadius: 28, padding: "16px 26px", display: "flex", gap: 6 }}>
        {[0, 1, 2].map(dot)}
      </span>
    </div>
  );
};

const CtaReveal: React.FC<{ text: string; theme: ChatTheme }> = ({ text, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12, mass: 0.8 } });
  const scale = interpolate(s, [0, 1], [0.85, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 24, opacity: s, transform: `scale(${scale})` }}>
      <span
        style={{
          background: theme.accent,
          color: "#fff",
          borderRadius: 999,
          padding: "26px 44px",
          fontSize: 44,
          fontWeight: 700,
          fontFamily: theme.fontFamily,
        }}
      >
        {text}
      </span>
    </div>
  );
};

// ----------------------------- Scene -----------------------------

export interface ChatSimSceneProps {
  steps: ChatStep[];
  theme?: string | ChatTheme;
}

/**
 * Renderiza la conversacion. Cada step blocking es una <Sequence> anclada a su
 * startFrame; los steps posteriores hacen "scroll" natural porque cada burbuja
 * ocupa su lugar en el flujo vertical y las nuevas empujan hacia arriba.
 */
export const ChatSimScene: React.FC<ChatSimSceneProps> = ({ steps, theme }) => {
  const { fps } = useVideoConfig();
  const th = resolveTheme(theme);
  const timed = walkTimeline(steps, fps);

  return (
    <AbsoluteFill style={{ background: th.background }}>
      {/* Zona de conversacion, dentro de safe-zones de Meta (14% sup / 20% inf) */}
      <AbsoluteFill
        style={{
          top: "14%",
          bottom: "20%",
          left: 0,
          right: 0,
          padding: "0 48px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 20,
        }}
      >
        {timed.map(({ step, startFrame, endFrame, index }) => {
          const durationInFrames = Math.max(1, endFrame - startFrame);
          const key = `${step.type}-${index}`;
          switch (step.type) {
            case "message_in":
              return (
                <Sequence key={key} from={startFrame} durationInFrames={Infinity} layout="none">
                  <BubbleIn text={step.text} theme={th} />
                </Sequence>
              );
            case "message_out":
              return (
                <Sequence key={key} from={startFrame} durationInFrames={Infinity} layout="none">
                  <BubbleOut text={step.text} stream={step.stream} durationS={step.durationS} theme={th} />
                </Sequence>
              );
            case "typing_dots":
              return (
                <Sequence key={key} from={startFrame} durationInFrames={durationInFrames} layout="none">
                  <TypingDots theme={th} />
                </Sequence>
              );
            case "cta_reveal":
              return (
                <Sequence key={key} from={startFrame} durationInFrames={Infinity} layout="none">
                  <CtaReveal text={step.text} theme={th} />
                </Sequence>
              );
            // reaction / read_receipt / pause: extienden el patron aqui.
            default:
              return null;
          }
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Uso en Root.tsx (referencia):
 *
 *   <Composition
 *     id="ChatSimReel"
 *     component={ChatSimScene}
 *     width={1080}
 *     height={1920}
 *     fps={30}
 *     defaultProps={{ steps: [], theme: "MILA" }}
 *     calculateMetadata={({ props }) => ({
 *       durationInFrames: totalFrames(props.steps, 30),
 *     })}
 *   />
 */
