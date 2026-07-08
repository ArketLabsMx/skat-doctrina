/* Verificación funcional del bundle. Corre: npx tsx verify.test.ts */
import { validateChatSimComposition, type ChatSimProps } from "./tools/chatsim-precompose-validator";
import { scoreStaticDmRisk } from "./tools/static-dm-risk";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

// --- 1. Reel BUENO: hook rápido, typing antes de cada out, stream, CTA con hold, ritmo variado ---
const goodProps: ChatSimProps = {
  width: 1080,
  height: 1920,
  fps: 30,
  steps: [
    { type: "message_in", text: "Hola, siguen con casas en preventa?", durationS: 1.8 },
    { type: "typing_dots", durationS: 1.2 },
    { type: "message_out", text: "Si! Tenemos 3 modelos disponibles 🏡", durationS: 2.4, stream: true },
    { type: "message_in", text: "Cuanto el enganche?", durationS: 1.4 },
    { type: "typing_dots", durationS: 1.0 },
    { type: "message_out", text: "Desde 10%. Te paso opciones ahora?", durationS: 2.6, stream: true },
    { type: "cta_reveal", text: "Escríbenos por DM", durationS: 4.5 },
  ],
};

(async () => {
  const goodReport = await validateChatSimComposition(goodProps, {});
  assert(goodReport.valid, "Reel bueno pasa el validator (sin errores)");
  const goodRisk = scoreStaticDmRisk(goodProps.steps);
  assert(goodRisk.verdict === "strong" || goodRisk.verdict === "acceptable",
    `Reel bueno: riesgo bajo (${goodRisk.verdict}, avg ${goodRisk.average})`);

  // --- 2. Reel MALO: sin CTA, sin typing, sin stream, texto muro, ritmo uniforme ---
  const badProps: ChatSimProps = {
    width: 720, height: 1280, // resolución incorrecta
    steps: [
      { type: "message_out", text: "Hola te cuento que ofrecemos un servicio integral de bienes raices con financiamiento a la medida y asesoria personalizada durante todo el proceso de compra", durationS: 2 },
      { type: "message_out", text: "Tambien manejamos renta vacacional y administracion de propiedades para inversionistas que buscan rendimiento pasivo con cero complicaciones operativas", durationS: 2 },
      { type: "message_out", text: "Contactanos cuando gustes para agendar una llamada", durationS: 2 },
    ],
  };
  const badReport = await validateChatSimComposition(badProps, {});
  assert(!badReport.valid, "Reel malo FALLA el validator (resolución + sin CTA)");
  assert(badReport.errors.some((e) => e.includes("1080x1920")), "Detecta resolución no-9:16");
  assert(badReport.errors.some((e) => e.toLowerCase().includes("cta")), "Detecta CTA ausente");
  const badRisk = scoreStaticDmRisk(badProps.steps);
  assert(badRisk.verdict === "fail" || badRisk.verdict === "revise",
    `Reel malo: riesgo alto (${badRisk.verdict}, avg ${badRisk.average})`);
  console.log("   dimensiones malo:", JSON.stringify(Object.fromEntries(
    Object.entries(badRisk.dimensions).map(([k, v]) => [k, v.score])), null, 0));

  // --- 3. Schemas AKL validan un ejemplo correcto y rechazan uno incorrecto ---
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  const handoffSchema = JSON.parse(readFileSync("./schemas/akl_handoff.schema.json", "utf8"));
  const validateHandoff = ajv.compile(handoffSchema);

  const goodHandoff = {
    version: "1.0",
    folio: "AKL-2026-MILA-cutover-fase1",
    from_instance: "web", to_instance: "code",
    status: "in_progress",
    timestamp: "2026-07-08T18:00:00Z",
    estado_actual_verificado: true,
    verificacion_evidencia: [{ fuente: "arcia-landing@a1b2c3d", hallazgo: "webhook directo ya existe, no reconstruir" }],
    objetivo: "Migrar captura de ManyChat a webhook directo",
    artifacts: { plan_ref: "projects/mila/plan.json" },
  };
  assert(validateHandoff(goodHandoff), "akl_handoff valida un handoff correcto");

  const badHandoff = { ...goodHandoff, estado_actual_verificado: false };
  assert(!validateHandoff(badHandoff), "akl_handoff RECHAZA handoff con candado en false (anti-doble-trabajo)");

  const dlSchema = JSON.parse(readFileSync("./schemas/akl_decision_log.schema.json", "utf8"));
  const validateDl = ajv.compile(dlSchema);
  const badDl = {
    version: "1.0", folio: "AKL-2026-MILA-x",
    decisions: [{
      decision_id: "d-001", instancia: "code", category: "credencial", subject: "token IG",
      options_considered: [{ option_id: "a", descripcion: "usar EAA" }], // solo 1 opción → debe fallar
      selected: "a", reason: "best option", // reason boilerplate corta → falla minLength
    }],
  };
  assert(!validateDl(badDl), "akl_decision_log RECHAZA decisión con 1 sola opción / reason boilerplate");

  console.log(`\n${failures === 0 ? "✅ TODO VERDE" : "❌ " + failures + " FALLOS"}`);
  process.exit(failures === 0 ? 0 : 1);
})();
