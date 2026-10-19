/**
 * CDS Hooks 2.0 のサービス提供元。依存は Node の標準ライブラリだけ。
 *
 *   GET  /cds-services                 discovery
 *   POST /cds-services/{id}            hook の呼び出し → {cards}
 *   POST /cds-services/{id}/feedback   カードの採否(ログに残すだけ)
 *
 * ログには患者を特定できる値を出さない(サービス id・カード数・所要時間だけ)。
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { loadConfig, type Config } from "./config";
import { SERVICES } from "./discovery";
import type { FeedbackRequest, HookRequest } from "./hooks";
import { collectPatientData } from "./patientData";
import { evaluate } from "./rules";

const MAX_BODY_BYTES = 5 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "request body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

function authorized(req: IncomingMessage, config: Config): boolean {
  if (!config.authToken) return true;
  const given = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${config.authToken}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function invoke(serviceId: string, req: IncomingMessage, config: Config) {
  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) throw new HttpError(404, `no such service: ${serviceId}`);
  const request = await readJson<HookRequest>(req);
  if (request.hook !== service.hook) throw new HttpError(400, `service ${serviceId} handles ${service.hook}`);
  const data = await collectPatientData(service.id, request, config);
  const cards = data ? evaluate(data, { now: new Date(), smartAppLaunchUrl: config.smartAppLaunchUrl }) : [];
  return { cards };
}

async function handle(req: IncomingMessage, res: ServerResponse, config: Config) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "OPTIONS") return send(res, 204);
  if (parts[0] !== "cds-services") throw new HttpError(404, "not found");

  if (req.method === "GET" && parts.length === 1) return send(res, 200, { services: SERVICES });
  if (req.method !== "POST" || parts.length < 2 || parts.length > 3) throw new HttpError(404, "not found");
  if (!authorized(req, config)) throw new HttpError(401, "unauthorized");

  const serviceId = decodeURIComponent(parts[1]!);
  if (parts.length === 3) {
    if (parts[2] !== "feedback") throw new HttpError(404, "not found");
    const body = await readJson<FeedbackRequest>(req);
    for (const item of body.feedback ?? []) {
      console.log(
        `[cds] feedback service=${serviceId} outcome=${item.outcome} reason=${item.overrideReason?.reason?.code ?? "-"}`,
      );
    }
    return send(res, 200, {});
  }

  const started = Date.now();
  const result = await invoke(serviceId, req, config);
  console.log(`[cds] ${serviceId} cards=${result.cards.length} ${Date.now() - started}ms`);
  return send(res, 200, result);
}

const config = loadConfig();
createServer((req, res) => {
  handle(req, res, config).catch((error: unknown) => {
    if (error instanceof HttpError) return send(res, error.status, { error: error.message });
    console.error("[cds] error", error);
    send(res, 500, { error: "internal error" });
  });
}).listen(config.port, () => {
  console.log(`[cds] listening on http://localhost:${config.port}/cds-services`);
});
