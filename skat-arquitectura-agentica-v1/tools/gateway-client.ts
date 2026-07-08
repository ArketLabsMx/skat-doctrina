/**
 * gateway-client.ts
 *
 * Cliente generico para proveedores de generacion ASYNC (imagen/video/lipsync):
 * el patron universal submit -> poll -> normalize. Reusable para CUALQUIER
 * proveedor de trabajos largos (Kling, Runway, Veo, Muapi, etc.), no atado a ninguno.
 *
 * Implementacion clean-room ArketLabs (patron destilado de open-generative-ai, MIT;
 * reescrito, provider-neutral, con nuestro contrato de status + idempotencia de Regla 5).
 *
 * Lecciones codificadas:
 *  - La forma de la respuesta del poll VARIA entre proveedores -> normalizar SIEMPRE a {url}.
 *  - Trabajo largo = submit devuelve request_id, luego poll con backoff hasta estado terminal.
 *  - Idempotency key por request (hash del payload) para no re-generar / re-cobrar.
 *  - La API key NUNCA se loguea ni vive en localStorage (Guardian de Secretos).
 */

import { createHash } from "node:crypto";

export type TerminalStatus = "succeeded" | "failed";
export type JobStatus = "pending" | "running" | TerminalStatus;

export interface GatewayConfig {
  baseUrl: string;
  apiKey: string;
  /** Header de auth. Muchos gateways usan 'x-api-key', no 'Authorization: Bearer'. */
  authHeader?: string;
  /** Construye la ruta de submit desde el endpoint del modelo. */
  submitPath?: (endpoint: string) => string;
  /** Construye la ruta de resultado desde el request_id. */
  resultPath?: (requestId: string) => string;
  /** Inyectable para test. Default: global fetch. */
  fetchImpl?: typeof fetch;
  poll?: { intervalMs?: number; maxAttempts?: number; backoff?: number };
}

export interface GenerateInput {
  endpoint: string; // p.ej. "flux-schnell-image"
  payload: Record<string, unknown>; // { prompt, aspect_ratio, ... }
  signal?: AbortSignal;
}

export interface GenerationResult {
  success: boolean;
  status: JobStatus;
  url: string | null;
  requestId: string | null;
  idempotencyKey: string;
  attempts: number;
  error?: string;
  raw?: unknown;
}

const DEFAULTS = { intervalMs: 2000, maxAttempts: 60, backoff: 1.15 };

export class GatewayClient {
  private cfg: Required<Omit<GatewayConfig, "poll" | "fetchImpl">> & {
    poll: Required<NonNullable<GatewayConfig["poll"]>>;
    fetchImpl: typeof fetch;
  };
  /** Cache idempotente en memoria: mismo payload -> mismo resultado, sin re-cobrar. */
  private cache = new Map<string, GenerationResult>();

  constructor(config: GatewayConfig) {
    this.cfg = {
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      apiKey: config.apiKey,
      authHeader: config.authHeader ?? "x-api-key",
      submitPath: config.submitPath ?? ((e) => `/api/v1/${e}`),
      resultPath: config.resultPath ?? ((id) => `/api/v1/predictions/${id}/result`),
      fetchImpl: config.fetchImpl ?? fetch,
      poll: { ...DEFAULTS, ...(config.poll ?? {}) },
    };
  }

  idempotencyKey(input: GenerateInput): string {
    const basis = JSON.stringify({ e: input.endpoint, p: input.payload });
    return createHash("sha256").update(basis).digest("hex").slice(0, 32);
  }

  private headers(): Record<string, string> {
    return { "content-type": "application/json", [this.cfg.authHeader]: this.cfg.apiKey };
  }

  /** Extrae una url estable sin importar la forma de la respuesta del proveedor. */
  static normalizeUrl(raw: any): string | null {
    if (!raw || typeof raw !== "object") return null;
    const candidates = [
      raw.url,
      raw.output_url,
      raw.image_url,
      raw.video_url,
      Array.isArray(raw.outputs) ? (typeof raw.outputs[0] === "string" ? raw.outputs[0] : raw.outputs[0]?.url) : null,
      Array.isArray(raw.images) ? raw.images[0]?.url ?? raw.images[0] : null,
      raw.output,
      raw.result?.url,
      raw.data?.url,
    ];
    for (const c of candidates) if (typeof c === "string" && c.startsWith("http")) return c;
    return null;
  }

  /** Mapea el status crudo del proveedor a nuestro enum. */
  static normalizeStatus(raw: any): JobStatus {
    const s = String(raw?.status ?? raw?.state ?? "").toLowerCase();
    if (["completed", "succeeded", "success", "done"].includes(s)) return "succeeded";
    if (["failed", "error", "canceled", "cancelled"].includes(s)) return "failed";
    if (["processing", "running", "in_progress", "started"].includes(s)) return "running";
    return "pending";
  }

  async generate(input: GenerateInput): Promise<GenerationResult> {
    const idempotencyKey = this.idempotencyKey(input);
    const cached = this.cache.get(idempotencyKey);
    if (cached) return cached;

    let requestId: string | null = null;
    try {
      // --- Submit ---
      const submitRes = await this.cfg.fetchImpl(this.cfg.baseUrl + this.cfg.submitPath(input.endpoint), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(input.payload),
        signal: input.signal,
      });
      if (!submitRes.ok) {
        return this.fail(idempotencyKey, null, `submit HTTP ${submitRes.status}`, 0);
      }
      const submitBody: any = await submitRes.json();
      requestId = submitBody.request_id ?? submitBody.id ?? submitBody.prediction_id ?? null;
      // Algunos gateways devuelven el resultado directo en el submit (sin poll):
      const immediate = GatewayClient.normalizeStatus(submitBody);
      if (immediate === "succeeded") {
        return this.ok(idempotencyKey, requestId, GatewayClient.normalizeUrl(submitBody), submitBody, 0);
      }
      if (!requestId) return this.fail(idempotencyKey, null, "sin request_id en submit", 0);

      // --- Poll con backoff ---
      let interval = this.cfg.poll.intervalMs;
      for (let attempt = 1; attempt <= this.cfg.poll.maxAttempts; attempt++) {
        if (input.signal?.aborted) return this.fail(idempotencyKey, requestId, "abortado", attempt);
        await sleep(interval, input.signal);
        interval = Math.round(interval * this.cfg.poll.backoff);

        const pollRes = await this.cfg.fetchImpl(this.cfg.baseUrl + this.cfg.resultPath(requestId), {
          method: "GET",
          headers: this.headers(),
          signal: input.signal,
        });
        if (!pollRes.ok) continue; // transitorio; reintenta
        const body: any = await pollRes.json();
        const status = GatewayClient.normalizeStatus(body);
        if (status === "succeeded") {
          return this.ok(idempotencyKey, requestId, GatewayClient.normalizeUrl(body), body, attempt);
        }
        if (status === "failed") {
          return this.fail(idempotencyKey, requestId, body.error ?? "job failed", attempt, body);
        }
      }
      return this.fail(idempotencyKey, requestId, "timeout de poll", this.cfg.poll.maxAttempts);
    } catch (e: any) {
      return this.fail(idempotencyKey, requestId, e?.message ?? String(e), 0);
    }
  }

  private ok(key: string, requestId: string | null, url: string | null, raw: unknown, attempts: number): GenerationResult {
    const r: GenerationResult = {
      success: url != null,
      status: "succeeded",
      url,
      requestId,
      idempotencyKey: key,
      attempts,
      raw,
      ...(url == null ? { error: "succeeded pero sin url normalizable" } : {}),
    };
    if (r.success) this.cache.set(key, r); // solo cachea exitos (no re-cobrar), no fallos
    return r;
  }

  private fail(key: string, requestId: string | null, error: string, attempts: number, raw?: unknown): GenerationResult {
    return { success: false, status: "failed", url: null, requestId, idempotencyKey: key, attempts, error, raw };
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    }, { once: true });
  });
}
