/* Verificación del GatewayClient con fetch mockeado. Corre: npx tsx gateway-client.test.ts */
import { GatewayClient } from "./gateway-client";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failures++; };

// Mock: submit devuelve request_id "req1" en estado pending; el poll da "processing" 1 vez y luego "completed".
function makeMockFetch() {
  let polls = 0;
  const calls: string[] = [];
  const fetchImpl = (async (url: string, init?: any) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (String(url).includes("/predictions/")) {
      polls++;
      const body = polls < 2
        ? { status: "processing" }
        : { status: "completed", outputs: [{ url: "https://cdn.example.com/out.png" }] };
      return { ok: true, json: async () => body } as any;
    }
    // submit
    return { ok: true, json: async () => ({ request_id: "req1", status: "pending" }) } as any;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

(async () => {
  const { fetchImpl, calls } = makeMockFetch();
  const client = new GatewayClient({
    baseUrl: "https://api.example.ai/",
    apiKey: "SECRET",
    fetchImpl,
    poll: { intervalMs: 1, maxAttempts: 10, backoff: 1 },
  });

  const input = { endpoint: "flux-schnell-image", payload: { prompt: "un gato", aspect_ratio: "9:16" } };
  const r = await client.generate(input);

  assert(r.success === true, "genera con éxito tras poll");
  assert(r.url === "https://cdn.example.com/out.png", "normaliza url desde outputs[0].url");
  assert(r.requestId === "req1", "captura request_id del submit");
  assert(r.status === "succeeded", "status terminal = succeeded");

  // Idempotencia: segundo generate con mismo payload NO vuelve a llamar la red (cache).
  const before = calls().length;
  const r2 = await client.generate(input);
  const after = calls().length;
  assert(r2.idempotencyKey === r.idempotencyKey, "misma idempotency key para mismo payload");
  assert(after === before, "segundo generate usa cache (no re-llama la red = no re-cobra)");

  // Payload distinto -> key distinta.
  const r3key = client.idempotencyKey({ endpoint: "flux-schnell-image", payload: { prompt: "otro" } });
  assert(r3key !== r.idempotencyKey, "payload distinto -> idempotency key distinta");

  // normalizeUrl robusto ante formas variadas.
  assert(GatewayClient.normalizeUrl({ images: [{ url: "http://a/b.png" }] }) === "http://a/b.png", "normaliza images[0].url");
  assert(GatewayClient.normalizeUrl({ video_url: "https://v/x.mp4" }) === "https://v/x.mp4", "normaliza video_url");
  assert(GatewayClient.normalizeUrl({ nada: 1 }) === null, "sin url -> null (no inventa)");

  // Fallo del proveedor se refleja como failed, sin cachear.
  const failClient = new GatewayClient({
    baseUrl: "https://x", apiKey: "K", poll: { intervalMs: 1, maxAttempts: 3, backoff: 1 },
    fetchImpl: (async (url: string) => String(url).includes("/predictions/")
      ? { ok: true, json: async () => ({ status: "failed", error: "modelo caido" }) }
      : { ok: true, json: async () => ({ request_id: "r2", status: "pending" }) }) as any,
  });
  const rf = await failClient.generate({ endpoint: "e", payload: { prompt: "x" } });
  assert(rf.success === false && rf.error === "modelo caido", "propaga fallo del proveedor sin cachear");

  console.log(`\n${failures === 0 ? "✅ TODO VERDE" : "❌ " + failures + " FALLOS"}`);
  process.exit(failures === 0 ? 0 : 1);
})();
