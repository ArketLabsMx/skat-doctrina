# Doctrina · Higgsfield real estate video (Reels + retargeting)

**Folio inicial:** `AKL-2026-DOCTRINA-HIGGSFIELD-RE-001`
**Origen:** destilado del battle `AKL-2026-IVH-VIDEO-001-E` (Reel v3 SHORT Reels-native), 2026-07-09
**Alcance:** cross-repo — aplica a cualquier cliente real estate con Higgsfield como fuente de assets crudos y Remotion como componedor final

---

Doctrina viva para producir video ads real-estate cuando el pipeline es Higgsfield (assets crudos, aspiracional) + Remotion (compositor final, kinetic). Se agrega D-nueva al final; no se reescriben las anteriores sin ADR.

---

## D8 · Formato dicta ritmo — dos playbooks distintos para real estate video

**Añadida:** 2026-07-09 (battle E, IVH · reel v3 SHORT)
**Anti-doctrina registrada:** SKAT armó el brief D con playbook Cine para adset IG DM (formato equivocado para el canal). Emmanuel diagnosticó "va lento, muy pasivo" — corrección arquitectónica, no cosmética.

### PLAYBOOK CINE (listing / YouTube / retargeting / hero web)

- **Duración:** 40-60s
- **Cuts:** cada 4-6s
- **Transiciones:** cross-fades suaves, cuts limpios
- **Estética:** slow cinematic, golden hour, geometría preservada
- **Texto:** overlay discreto, apariciones sutiles
- **Ritmo emocional:** aspiracional, tempo de "walk-through"
- **Referencias:** MeltFlex, doctrina D7 (por publicar)

### PLAYBOOK REELS-NATIVE (adset IG DM / TikTok / audiencia fría)

- **Duración:** 12-18s
- **Cuts:** cada 1-2s, snap-cuts secos
- **Efectos:** kinetic typography (punch-in con spring), freeze frames, flash blancos entre cuts, highlights animados sobre keywords
- **Estética:** motion agresivo, tempo de "attention war"
- **Texto:** protagonista, no acompañante. Overlay de hero size, kinetic
- **Ritmo emocional:** urgente, gancho en el primer segundo
- **Referencias:** MrBeast titles, Meta 2026 top performers

### Regla operativa

Ambos formatos usan los **MISMOS MP4s crudos de Higgsfield como materia prima**. El pivote de formato **NO re-genera assets** — Remotion los recompone via `OffthreadVideo` con `startFrom`/`endAt` para tomar el sub-clip rico. Los créditos de generación externa se protegen.

### Distribución por canal

| Canal / Objetivo | Formato correcto |
|---|---|
| Adset IG DM conversion (frío/lookalike) | Reels-native |
| Adset TikTok Shop / cold | Reels-native |
| Retargeting web-viewer que ya vio la marca | Cine |
| Hero del sitio del cliente | Cine |
| Canal YouTube (long-form) | Cine |
| Listing MLS embed | Cine |
| Ads Manager · Reels placement | Reels-native |
| Ads Manager · Feed placement | Ambos, Reels-native preferido si el objetivo es CTM/CTD |

Si solo se puede tener uno, **Reels-native gana en adset de conversión, Cine gana en marca / retargeting cálido**.

### Gate arquitectónico

Antes de aprobar un brief SKAT de video real-estate: verificar que el **formato** propuesto matchee el **canal** de destino. Un brief Cine sobre un adset frío de conversión es un error de premisa, no de ejecución. El síntoma final ("va lento", "no engancha") aparece hasta el review humano — el gate temprano lo detecta antes.

### Composición técnica en Remotion

```tsx
// Snap-cut duro (Reels-native)
<Sequence from={0} durationInFrames={60}>
  <OffthreadVideo src={hero01} startFrom={60} endAt={120} muted />
</Sequence>
<Sequence from={60} durationInFrames={30}>
  <OffthreadVideo src={hero02} startFrom={75} endAt={105} muted />
</Sequence>

// Punch-in agresivo con spring
const scale = spring({ frame, fps: 30, config: { damping: 15, stiffness: 200 }, from: 3.0, to: 1.0 });
<div style={{ transform: `scale(${scale})`, fontSize: 180, fontWeight: 900 }}>$2,199/mo</div>

// Flash blanco entre cuts (3 frames ≈ 100ms)
<Sequence from={cutFrame - 3} durationInFrames={3}>
  <AbsoluteFill style={{ background: "white", opacity: interpolate(frame, [0, 1, 2], [0, 1, 0]) }} />
</Sequence>

// Freeze frame antes del cut
<Freeze frame={50}>
  <OffthreadVideo src={hero04} startFrom={60} muted />
</Freeze>

// Highlight animado sobre palabra clave
const highlightWidth = spring({ frame: frame - 5, fps: 30, config: { damping: 12 }, from: 0, to: 1 });
<span style={{ background: `linear-gradient(90deg, gold ${highlightWidth * 100}%, transparent 0)` }}>OWN</span>
```

### Anti-patrones específicos de este playbook

1. **Text hero size en Cine, no en Reels-native.** Cine usa el video como emoción principal, texto discreto. Reels-native lo invierte: el texto de hero size (150-220px) es lo que engancha.

2. **Cross-fades en Reels-native = 0.** Un cross-fade de 500ms mata el ritmo. Snap-cut siempre.

3. **Music matching.** El playbook Cine usa audio ambient (piano lento, strings). Reels-native usa beat con drop en el price punch. Los MP4s van muted en la composición Remotion; el audio se agrega en Ads Manager o en post separado (evita rehacer la composición para probar tracks).

4. **Duración del hook.** Cine puede permitirse 3-5s antes de la promesa. Reels-native tiene que enganchar en el primer segundo o el 80% swipea.

### Ejemplo canónico

`AKL-IVH-video-D-EN-v3-short.mp4` (IVH, 2026-07-09):
- 15s (450 frames @ 30fps)
- Reusa 7 heros del brief D (Higgsfield MeltFlex, sin re-render)
- Estructura HOOK / APPROACH / LIFESTYLE FLASH / PRICE PUNCH / PROOF (chat-sim micro con RichCard) / CTA
- Peso 7.9 MB (<15 MB gate del brief E §6 G4)
- Composición Remotion: `video-ads/src/compositions/ReelShort.tsx`

---

*ArketLabs · SKAT · doctrina cross-repo · 2026-07-09*
