# Battle post-mortem · Meta CAPI · dual dataset + dual token (cross-BM)

**Folio:** `AKL-2026-DOCTRINA-CAPI-BATTLE-001`
**Battle origen:** `AKL-2026-IVH-CAPI-001` (Fuga 2)
**Fecha ejecución:** 2026-07-08
**Estado:** cerrado con firma
**Alcance de esta doctrina:** cross-repo — aplica a cualquier cliente futuro con Meta Business Suite

---

Post-mortem destilado como doctrina transferible. Los patrones aquí (two-datasets, dual-token, cross-BM, tripwire de intentos idénticos) NO son específicos de IVH — aplican a cualquier arreglo donde el IG account y el pixel viven en Business Managers distintos, o donde el owner del dataset y el owner del asset messaging no son el mismo negocio. El post-mortem se guarda en `skat-doctrina` (no en `docs/` del cliente) porque su valor es cross-cliente.

---

## 1. El problema en una línea

Meta Ads pixel `1498240838513565` (IVH) rechazaba con subcode `2804133` cada intento de enviar `LeadSubmitted` (business_messaging) porque el pixel es propiedad del BM Comercial Emmanuel, mientras el IG account `@innovate.homes` es propiedad del BM Innovate Homes — y Meta requiere que el link IG account ↔ dataset sea **intra-BM**. Cross-BM sharing (ambas direcciones) NO propaga ese link.

## 2. Por qué existía el battle

Auditoría del 2026-07-07 encontró que el dataset del pixel había recibido **cero eventos `LeadSubmitted` en su historia**, aunque el pipeline de captura IG DM (webhook + MILA + resilient-capture) funcionaba correctamente. La causa raíz aparente inicial: `META_IG_BUSINESS_ACCOUNT_ID` faltaba en el entorno, entonces `captureLead` skippeaba el dispatch de CAPI con un `console.warn` invisible. Deadline duro: 2026-07-13 (ventana Meta de 7 días para `event_time` retroactivo).

## 3. Cronología resumida

| Fase | Descubrimiento | Acción |
|---|---|---|
| T1-lite | Token web vivo (Graph 200 · events_received=1) — no era rotación | Confirmado con smoke script |
| T2 | Env var `META_IG_BUSINESS_ACCOUNT_ID` no documentada + gate silencioso | Documentar + escalar gate a Sentry error (#67) |
| T2b | Aun seteando la env, subcode `2804133` persistía | Confirmar que el link IG ↔ dataset es intra-BM |
| T2c (Plan A) | UI del dataset no permite linkear IG account cross-BM | Ninguna combinación de share funciona |
| T2d (Plan B) | Meta EXPECTS un dataset separado por surface (Goal Type Instagram DM) | Crear dataset propio del BM que posee el IG — dual-dataset routing (#68) |
| T2e | El BM nuevo es "new business" per policy — no puede compartir dataset back | Cada dataset emite su propio access token — dual-token routing (#69) |
| T3 | Backfill del período ciego (desde 6-jul) hacia el nuevo dataset | Script con guardrails (#70) — 1 evento real disparado (María Montenegro) |

## 4. Los 8 subcodes de Meta resueltos en el camino

Cada uno enseñó algo distinto. Todos quedan documentados inline en `capi-smoke.mjs` como catálogo canónico:

| Subcode | Título Meta | Causa raíz IVH | Fix |
|---|---|---|---|
| `190` | Token expired/revoked | (no ocurrió — falso positivo inicial) | Verificar antes de asumir |
| `2804063` | Missing Messaging Channel | `business_messaging` sin `messaging_channel` | Setear en el request |
| `2804064` | Messaging Event Invalid Argument | Enviar `client_ip_address` / `client_user_agent` en IG DM | Drop de esas match-keys en business_messaging |
| `2804066` | Wrong event_name for action_source | Usar `Lead` con `business_messaging` | `LeadSubmitted` es el event_name correcto |
| `2804075` | Missing ig_sid | IGSID faltante | Recuperarlo del webhook IG, mapearlo desde ManyChat |
| `2804079` | Missing IG Account ID | Faltaba `ig_account_id` (renamed field) | Meta renombró silenciosamente de `instagram_business_account_id` |
| `2804133` | No IG Account Associated To Dataset | El pixel no tiene IG account linkeada | Nuevo dataset en el BM que posee el IG (Plan B) |
| `100:33` | Object does not exist / missing permissions | Token web sin permisos sobre dataset del otro BM | Token propio del nuevo dataset (Plan B dual-token) |

## 5. Arquitectura final (dual routing)

```
                  Web `Lead`                        IG DM `LeadSubmitted`
                     │                                       │
                     ▼                                       ▼
  META_PIXEL_ID = 1498240838513565          META_IG_DATASET_ID = 920685124380283
  BM Comercial Emmanuel                     BM Innovate Homes
  845063269772728                           1559572911732666
                     │                                       │
                     ▼                                       ▼
  META_CAPI_ACCESS_TOKEN                    META_IG_CAPI_ACCESS_TOKEN
  (issued by dataset 1498...)               (issued by dataset 9206...)
                     │                                       │
                     └──────────► graph.facebook.com/v21.0/{pixel}/events ◄────────┘
```

En código:
- `lib/meta/capi.ts::targetPixelIdFor(actionSource)` — dataset por surface
- `lib/meta/capi.ts::targetTokenFor(actionSource)` — token por surface
- Gate escalado a `Sentry.captureException(level: error)` si falta cualquiera de los dos tokens

## 6. Doctrinas destiladas (aplicables cross-repo)

### D1 · Two datasets by design

Meta separa datasets por surface **por diseño**, no por bug de UI. Los flows "Configuraremos automáticamente un identificador" son el camino canónico para eventos CTD/messaging. **Verificar docs oficiales de Meta ANTES de asumir que un flow UI está roto** — un flow que empuja al mismo destino 3 veces está diciendo algo.

Aplica a cualquier cliente donde el IG account y el pixel web viven en BMs distintos, o donde se quiere separar la señal de web y messaging para análisis.

### D2 · Dual token cuando cross-BM

Cuando el dataset destino vive en un BM que **no comparte** con el dataset origen, cada uno emite su propio access token de CAPI y **los tokens no son intercambiables**. Meta rechaza con `code:100 subcode:33` "Object does not exist or missing permissions".

Esto es especialmente común cuando el cliente tiene un BM "new business" (per Meta policy, con restricciones de sharing durante N meses).

### D3 · Gate silencioso → alerta

Cualquier gate por env var que skippee un side-effect crítico (envío de eventos, escritura a DB, notificación) debe disparar `Sentry.captureException(level: error)`, **no `console.warn`**. Un warn en logs de Vercel no le habla a nadie. El skip silencioso de `LeadSubmitted` por env var faltante causó cero eventos históricos en IVH durante semanas.

Regla ejecutable: si en un code review ves un patrón `if (!process.env.X) { console.warn(...); return; }` en un side-effect crítico, es un bug de observabilidad.

### D4 · PR abierto ≠ PR contenedor de trabajo futuro

Squash-merge combina los commits de un PR en uno solo en el momento del merge. Commits que llegan al remote POST-merge al mismo branch no forman parte del squash y quedan huérfanos. Si un battle sigue evolucionando después de un merge, la ruta correcta es **PR nuevo**, no push encima del PR original.

Esto se vio en Fuga 2 con PR #68 (mergeado con solo el commit del split de datasets) y `f21da2f` (dual-token) huérfano — hubo que abrir PR #69 sobre main para aterrizarlo.

### D5 · Backfill = arma cargada sin curaduría

Un script de backfill reutilizable sin (a) filtro de identidades internas y (b) gate de intent explícito es un arma cargada en un cajón. La corrida inicial de T3 en IVH tenía `--live` (neutral) y no filtraba emails/nombres de test — el fire fue seguro solo porque SKAT hizo curaduría manual antes.

Regla aplicada permanentemente en `scripts/capi-backfill.mjs`: `INTERNAL_IDENTITIES` hardcoded al top del archivo (dominios + emails + name keywords), y `--fire` como flag (no `--live`) porque forza lectura consciente al escribirlo. Combinar `--fire` con `--dry-run` explícito es error, no ambigüedad silenciosa.

Aplica a cualquier script que dispare side-effects a producción (email broadcast, evento a Meta/Google/TikTok, escritura masiva, etc).

### D6 · Tripwire mecánico "3 intentos idénticos"

Esta doctrina vive completa en `HOW-TO-BRIEF-CLAUDE.md §8`. Es la que hubiera evitado los 40 minutos de vueltas UI en el battle si se hubiera aplicado antes: 3 intentos idénticos fallando con el mismo error = ALTO obligatorio, cuestionar la premisa, abrir docs oficiales del producto, prohibido un 4to intento igual.

## 7. Los 4 PRs canónicos del battle

| PR | Título | Rol en el battle |
|---|---|---|
| #65 | `capi: smoke probe for META_CAPI_ACCESS_TOKEN` | Health check inicial (T1-lite) |
| #67 | `capi: hookup LeadSubmitted IG DM + escalate silent skip to Sentry` | Gate escalation (T2) + Sentry doctrine (D3) |
| #68 | `capi: route LeadSubmitted to dedicated IG dataset` | Split de datasets (Plan A · dataset routing) |
| #69 | `capi: dual-token routing for IG dataset` | Dual-token (Plan B · token routing) |
| #70 | `capi: T3 backfill script — leads → CAPI dual-token with permanent guardrails` | Backfill T3 versionado con doctrina D5 (backfill guardrails) |

## 8. Trazabilidad y links

- Battle folio: `AKL-2026-IVH-CAPI-001`
- Backfill fbtrace: `AVKhVeLTRP_L8tfFxpCM2qH` (LeadSubmitted de María Montenegro, 2026-07-08 · dataset 920685124380283)
- Manual de handoffs cross-repo (misma casa): [`HOW-TO-BRIEF-CLAUDE.md`](./HOW-TO-BRIEF-CLAUDE.md) — la regla D6 (tripwire) vive en su §8

## 9. Test de aplicabilidad cross-cliente

Antes de tratar esta doctrina como universal, verifica que el nuevo caso encaje:

| Signal | Aplica dual-dataset (D1) | Aplica dual-token (D2) |
|---|---|---|
| IG account y web pixel en BMs distintos | ✅ | ✅ |
| El BM del IG es "new business" per policy Meta | — | ✅ (crítico) |
| El BM del IG puede compartir el dataset con el BM del pixel | (aún así D1 aplica) | ❌ (D2 no necesario, un solo token basta) |
| Cliente quiere separar señal de web vs messaging para análisis | ✅ | (aplica según share) |

Si aplica D2, forzosamente aplica D3 (dual-token requiere gate por token, no por env var genérica).

---

*ArketLabs · SKAT · doctrina cross-repo · 2026-07-08*
