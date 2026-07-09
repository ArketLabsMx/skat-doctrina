# Cómo pedirle trabajo a Claude para que sea efectivo desde el primer intento

**Folio:** `AKL-2026-DOCTRINA-BRIEF-CLAUDE-001`
**Repo:** `skat-doctrina/doctrina/` (cross-repo — aplica a IVH, JRG, PADSPOT, ArketLabs, todo)
**Origen:** destilado del battle Fuga 2 (AKL-2026-IVH-CAPI-001), 2026-07-08
**Estado:** doctrina v1

---

Doctrina ejecutiva para redactar handoffs a Claude. Simétrica: audita al humano tanto como al agente. Copiar/pegar cuando redactes battles.

---

## 1. Anatomía del prompt que hace clic al primer intento

Los prompts que sacan lo mejor de Claude tienen **5 secciones fijas**. Si falta alguna, Claude adivina — y adivinar es donde perdemos tiempo.

```markdown
# HANDOFF | <folio único> | <título 1 línea>
Fecha: <fecha> · Repo: `<repo>` · Prioridad: <baja/media/alta/máxima>
Deadline: <duro o "sin deadline">

## 0. Candado anti-doble-trabajo (OBLIGATORIO)
- <verificaciones previas: grep, PRs abiertos, memoria stale, docs oficiales>
- Si algo contradice este handoff → reportar antes de ejecutar.

## 1. Evidencia verificada (fuente + timestamp)
- <datos duros con timestamp: audits, MCP calls, logs>
- <hipótesis marcadas EXPLÍCITAMENTE como hipótesis, no como hechos>

## 2. Doctrina aplicable (no reinventar)
- <reglas del proyecto: memorias persistentes, doctrinas previas>
- <patrones ya establecidos que Claude debe respetar>

## 3. Tareas (T1..Tn)
- <cada T con criterio de éxito verificable>
- <no vagas: "arregla el CAPI"; sí específicas: "crear script que emita LeadSubmitted con event_id idempotente y verificar via ads_get_dataset_stats">

## 4. Gates (invariantes que no se rompen)
- <G1..Gn: cosas que Claude NO debe hacer / debe verificar antes>
- Ej: "Secretos jamás en chat", "PRs chicos: T1 un PR, T2 otro", "Dry-run antes de live fire"

## 5. Criterio de cierre
- <señal única que dice "esto quedó": test verde, count>=1, MP4 en móvil, etc>
- <cómo verificarás tú independiente al reporte de Claude>
```

**Regla de dedo**: si vas a redactar el prompt en menos de 10 minutos, invierte 3 más en el §0 Candado. Es lo que evita que Claude asuma que tu hipótesis del problema es correcta cuando puede no serlo.

---

## 2. Cómo dar GO efectivo (menos preguntas, más ejecución)

Claude por default pide confirmación en operaciones con blast radius. Puedes desbloquearlo con **frases explícitas**:

| Situación | Frase que activa GO amplio |
|---|---|
| Autorizas MCPs de solo-lectura | *"Autorizado usar MCP `<tool>` cuando lo necesites, no me preguntes"* |
| Autorizas mutaciones locales (git, archivos, npm) | *"Autorizado editar código, commit y push. No pausas para confirmar"* |
| Autorizas investigación externa | *"Autorizado WebSearch/WebFetch cuando no tengas la respuesta"* |
| Un ciclo de "haz X → aborta → haz Y" te agota | *"Ya no me preguntes tanto. Investiga y ejecuta"* |
| Le das rienda suelta total (con límites) | *"Solucionalo. Solo detente si el fix cambia arquitectura o gasta dinero real"* |

**Anti-patrón**: preguntas ambiguas como *"¿lo hago?"* — Claude no sabe si es rhetorical o real. Mejor: *"Adelante"* / *"NO"* / *"Espera, pregunto X primero"*.

### ⚠️ Techo explícito — cosas que NINGUNA frase de esta tabla desbloquea

Un GO amplio no autoriza en ningún caso, ni siquiera en "modo tormenta" (§7):

- **Pastes de secretos en chat, logs, commits o query strings** (tokens, passwords, API keys, service role keys, connection strings con credenciales). Cambio de valor en Vercel UI SIEMPRE lo hace el humano.
- **Gasto de dinero real**: compras, transferencias, top-ups, upgrades de plan pagado, cualquier acción que cargue un método de pago.
- **Mutaciones en campañas vivas**: pausar/activar ads en delivery, subir/bajar budget, cambiar targeting, cambiar creativos que ya están sirviendo impresiones. Meta / Google / TikTok / LinkedIn — todas.
- **Deletes irreversibles**: `DROP TABLE`, `rm -rf` sobre código no-en-git, `git push --force` a main, `git branch -D` sin merge previo, eliminar assets de Business Manager.
- **Publicar contenido**: post/reel/story a IG/FB/LinkedIn/TikTok/YouTube, envío de emails masivos (Resend broadcast, MailChimp campaigns), publicar landing pages a producción con dominio custom.
- **Cambios en autenticación o access control**: rotar tokens que otros sistemas usan, cambiar roles/permisos, agregar/quitar admins, modificar OAuth apps.

Cada uno de estos requiere **GO explícito por ítem**, no por batch. Si Claude en modo tormenta necesita cualquiera de estos para cerrar un battle, se detiene y pide autorización separada con el detalle exacto (qué campaña, qué cantidad, qué tabla, qué archivos).

---

## 3. Cuándo cortar la deliberación de Claude

Claude tiende a proponer 3 opciones cuando hay 1 obvia. Cuando notes eso, corta:

- *"Elige tú la mejor y arranca"*
- *"Recomiendas A o B — dale A"*
- *"No me des opciones, dame la ejecución"*

Cuando Claude reporta y te pregunta antes de commit:
- *"Commit y push. Después me cuentas si algo salió mal"*

Cuando Claude entra en loop de verificación (screenshot → screenshot → screenshot):
- *"Deja de verificar, ejecuta el fix y valida con smoke"*

**Balance**: cortar demasiado pronto es peligroso en battles con mutaciones destructivas (rm, force-push, upload a prod, gasto de dinero). Cortar tarde es peligroso en battles con deadline. Ajusta según el gasto real de equivocarse.

---

## 4. Contexto del proyecto que Claude debe tener siempre

Estas van al inicio del prompt o en el §2 Doctrina. Son atajos que evitan re-explicar. Un bloque por cliente/repo.

### Ejemplo · IVH (`innovate-homes`)
- **Meta ad accounts**: `1466213084717464` (Barcelona Estates) · `853449263738615` (test)
- **BMs**: `845063269772728` (Comercial Emmanuel) · `1559572911732666` (Innovate Homes)
- **Dataset web**: `1498240838513565` (IH Barcelona - ArketLabs, en BM Comercial Emmanuel)
- **Dataset IG DM**: separado, vive en BM Innovate Homes (ver `META_IG_DATASET_ID`)
- **IG @innovate.homes**: `17841478521343946` (dueño: BM Innovate Homes)
- **Doctrinas activas**: Captura Resiliente v1 · Meta CAPI two datasets · MILA web untouchable · anti-doctrina "no confiar solo en memoria stale"
- **Supabase project**: `wikacrmgetrnwugqtugt`
- **Vercel project**: `innovate-homes` en team `emmanuels-projects-72aeb425`

### Ruta corta para verificar hechos antes de asumir (cross-cliente)
- **Meta state**: MCP `ads_get_dataset_details / stats / entities` (read-only, no autorización necesaria por default)
- **Supabase state**: MCP `execute_sql` con project_id (read-only queries: sí; writes: G3 dry-run + GO)
- **Vercel deploy**: MCP `get_deployment_build_logs` con `idOrUrl`
- **Docs oficiales**: `developers.facebook.com` / `developers.google.com` / `vercel.com/docs` / etc — verificar ANTES de asumir flow UI está roto

---

## 5. Anti-patrones que hemos vivido (y cómo evitarlos)

### Anti-patrón 1 · "Yo tengo la hipótesis, Claude ejecutala"
**Signal**: el handoff dice "el problema es X, arréglalo así".
**Riesgo**: Si X es una interpretación tuya y no un hecho verificado, Claude persigue X por horas antes de descubrir que era Y.
**Fix**: en §1 Evidencia separa hechos (con fuente) de hipótesis (marcadas explícitamente). En §0 Candado pide a Claude "verificar mi hipótesis contra el sistema real antes de ejecutar".

### Anti-patrón 2 · "Adivina el path UI"
**Signal**: le pides a Claude que te guíe por Meta Business Suite / cualquier UI de tercero.
**Riesgo**: Meta/Google/Vercel cambian su UI constantemente. Los pasos que Claude "recuerda" pueden estar obsoletos.
**Fix**: si la UI es crítica, autoriza browser MCP + WebSearch + pásale screenshots reales. O acepta que Claude va a iterar 2-3 veces mirando la UI.

### Anti-patrón 3 · Handoff sin folio ni deadline
**Signal**: "hey, ¿puedes ver esto?" sin folio ni prioridad.
**Riesgo**: Claude no sabe si dropear otro trabajo, cuánto invertir, o cómo priorizar interrupciones.
**Fix**: incluso conversaciones informales — si es material, agrégale folio + una línea de prioridad al inicio.

### Anti-patrón 4 · Contradecir mid-flight sin explicar
**Signal**: "STOP no hagas eso" seguido de "OK sí hazlo" 5 minutos después sin decirle qué cambió.
**Riesgo**: Claude no puede aprender de la contradicción y probablemente cometerá el mismo tipo de error en 20 minutos.
**Fix**: cuando cambies de opinión, explica el por qué en 1 línea: *"OK sí — verifiqué en Y que Meta requiere ese path"*. Eso permite a Claude ajustar su modelo.

### Anti-patrón 5 · Pedir screenshot cuando MCP lo puede resolver
**Signal**: "pásame screenshot de X en Vercel/Meta/Supabase".
**Riesgo**: perdés 30 segundos y Claude puede haber ejecutado un MCP que da la respuesta canónica.
**Fix**: preguntar a Claude *"¿esto se puede verificar por MCP en lugar de screenshot?"* — casi siempre sí.

---

## 6. Template copy-paste para nuevos handoffs

```markdown
# HANDOFF SKAT → Claude | AKL-YYYY-<CLIENT>-<CAT>-<###>
**Fecha:** YYYY-MM-DD · **Repo:** `<repo>` · **Prioridad:** <baja/media/alta/máxima>
**Deadline:** <fecha o "sin deadline">

## 0. Candado anti-doble-trabajo
1. `git grep -il "<término>"` — verificar código existente antes de escribir uno nuevo
2. Revisar PRs abiertos en `feat/<área>-*` y últimos commits del área
3. Si hay memoria persistente de este dominio, releerla y marcar si contradice el handoff
4. Si algo contradice → reportar antes de ejecutar

## 1. Evidencia verificada
**Hecho**: <dato con fuente + timestamp>
**Hecho**: <dato con fuente + timestamp>
**Hipótesis (NO verificada)**: <tu suposición del problema>

## 2. Doctrina aplicable
- <memoria persistente relevante>
- <patrones establecidos que NO reinventar>

## 3. Tareas
**T1** — <nombre corto>. Criterio de éxito: <cómo se verifica que quedó>
**T2** — ...

## 4. Gates
- G1: <cosa que NO se hace>
- G2: <invariante que se preserva>
- G3: <verificación de sistema real requerida antes de cerrar>

## 5. Criterio de cierre
<señal única y verificable independientemente por ti>
```

---

## 7. Frases de "modo tormenta" (cuando el battle se atora)

Cuando el battle está trabado y necesitas máxima efectividad:

- *"Investiga sin preguntar. WebSearch, MCP, docs oficiales — lo que necesites. Reporta cuando tengas fix"*
- *"Ejecuta y reporta. Si dudas entre 2 caminos, elige el más simple"*
- *"Ya perdimos X minutos. Si no hay solución en 10 más, dame las 3 rutas y elijo yo"*
- *"Deja de darme opciones, dame la ejecución. Si me equivoco luego, reverte"*
- *"Verifica contra docs oficiales antes de asumir que la UI está rota"*

**Recordatorio**: modo tormenta NO desbloquea las 6 categorías del techo del §2. Si Claude las necesita, para y pide GO explícito por ítem.

---

## 8. Regla de oro (aprendida en Fuga 2)

### Versión filosófica

> **Si Claude te pregunta lo mismo 3 veces con opciones parecidas, corta con "elige tú y ejecuta".**
> **Si tú le has dicho "aborta" 3 veces, cuestiona tu premisa antes de la de Claude.**

Ambas fallas son signal de que el modelo mental (tuyo o de Claude) está desalineado con la realidad del sistema. La forma más rápida de re-alinear es: **verificar contra docs oficiales / MCP / screenshots reales** en lugar de seguir iterando sobre asunciones.

### Tripwire mecánico (ejecutable, no depende de contar minutos)

**3 intentos idénticos fallando con el mismo error = ALTO OBLIGATORIO. Prohibido un 4to intento igual.**

Contadores objetivos que disparan el tripwire:
- Mismo subcode / error code / mensaje de excepción 3 veces
- Mismo modal/pantalla llegando al mismo dead-end 3 veces
- Mismo flow UI que produce el mismo resultado no-deseado 3 veces
- 3 rondas de "prueba esto" → "no funciona" → "prueba lo otro" sobre el mismo síntoma

Cuando el contador llega a 3, la acción del 4to intento cambia — **no puede ser el mismo tipo de intento**. La acción obligatoria es:

1. **Detener la iteración** — no un 4to clic al mismo botón, no un 4to prompt con la misma estrategia
2. **Cuestionar la premisa** — la de Claude Y la del humano. La regla del §8 filosófica se aplica en ambas direcciones
3. **Abrir la doc oficial** del producto (Meta, Google, AWS, Vercel, Stripe, lo que sea). Buscar por el error literal del sistema, no por la interpretación humana
4. **Re-planear** con la nueva información antes de tocar nada más

**Por qué mecánico y no filosófico**: si depende de que alguien esté contando minutos o notando patrones sutiles, no dispara. El contador de 3 es objetivo — cualquiera puede verificarlo, incluido Claude mismo en su siguiente turn.

---

## Registro de battles donde este documento se aplica retro

- **Fuga 2 · AKL-2026-IVH-CAPI-001 (2026-07-08)** — subcode 2804133 tomó 40 min de vueltas UI porque:
  - Claude no consultó docs Meta hasta forzarlo
  - Emmanuel tuvo que decir "deja de preguntar" para desbloquearlo
  - El "aborta 3 veces" era señal de que el flow ERA correcto, no lo contrario
  - Con el tripwire del §8: el 3er intento idéntico habría disparado obligatorio abrir docs Meta, evitando los 10 min extra hasta el "deja de preguntar"

---

*ArketLabs · SKAT · doctrina v1 · 2026-07-08*
