#!/usr/bin/env node
/**
 * Local-first official-source acquisition engine.
 *
 * Safe defaults:
 *   --plan    describe eligible lanes; no network and no writes
 *   --dry-run default; inspect cache state; no network and no writes
 *   --acquire explicit public HTTPS GET; writes immutable bytes/checkpoints only
 *
 * It has no database client and no publication primitive.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { atomicWrite, writeImmutable } from "./immutableCore.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
export const DEFAULT_LOCAL_ROOT = path.join(REPO_ROOT, "warehouse", "data", "local", "acquisition");
export const MATRIX_PATH = path.join(REPO_ROOT, "warehouse", "reports", "national_source_matrix.json");

export function looksLikeHtml(buffer) {
  const prefix = buffer.subarray(0, 1024).toString("utf8").trimStart().toLowerCase();
  return prefix.startsWith("<!doctype html") || prefix.startsWith("<html") || prefix.includes("<head>");
}

function jsonShape(value, depth = 0) {
  if (value === null) return "null";
  if (depth >= 8) return Array.isArray(value) ? "array" : typeof value;
  if (Array.isArray(value)) {
    const variants = [...new Set(value.slice(0, 20).map((item) => jsonShape(item, depth + 1)))].sort();
    return `array[${variants.join("|")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${key}:${jsonShape(value[key], depth + 1)}`).join(",")}}`;
  }
  return typeof value;
}

export function jsonSchemaFingerprint(value) {
  return crypto.createHash("sha256").update(jsonShape(value)).digest("hex");
}

function mimeAllowed(kind, contentType) {
  if (!contentType) return false;
  if (kind === "json") return /(?:application|text)\/(?:[^;]+\+)?json\b/i.test(contentType);
  if (kind === "csv") return /(?:text\/csv|application\/(?:csv|vnd\.ms-excel|octet-stream)|text\/plain)\b/i.test(contentType);
  if (kind === "xlsx") return /application\/(?:vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|zip|octet-stream)\b/i.test(contentType);
  if (kind === "html") return /text\/html\b/i.test(contentType);
  return false;
}

export function validatePayload(response, buffer, source) {
  if (!response || (!response.ok && response.status !== 304)) return { ok: false, reason: `HTTP ${response?.status ?? "no-response"}` };
  if (response.status === 304) return { ok: true, notModified: true, schemaFingerprint: null };
  const min = Number(source.acquisition?.min_bytes ?? 1);
  const max = Number(source.acquisition?.max_bytes ?? 50 * 1024 * 1024);
  if (buffer.length < min) return { ok: false, reason: `body ${buffer.length} bytes below minimum ${min}` };
  if (buffer.length > max) return { ok: false, reason: `body ${buffer.length} bytes above maximum ${max}` };
  const kind = source.acquisition?.expected_kind;
  const contentType = String(response.headers?.get?.("content-type") ?? "").toLowerCase();
  if (!mimeAllowed(kind, contentType)) return { ok: false, reason: `unexpected MIME '${contentType || "missing"}' for ${kind ?? "unknown"}` };
  const contentEncoding = String(response.headers?.get?.("content-encoding") ?? "").toLowerCase();
  const declaredLengthHeader = response.headers?.get?.("content-length");
  const declaredLength = declaredLengthHeader == null || String(declaredLengthHeader).trim() === ""
    ? null
    : Number(declaredLengthHeader);
  if (!contentEncoding && declaredLength != null && Number.isFinite(declaredLength) && declaredLength >= 0 && declaredLength !== buffer.length) {
    return { ok: false, reason: `body ${buffer.length} bytes does not match Content-Length ${declaredLength}` };
  }
  if (kind !== "html" && (looksLikeHtml(buffer) || contentType.includes("text/html"))) {
    return { ok: false, reason: "HTML response masquerading as data" };
  }

  let schemaFingerprint = null;
  if (kind === "xlsx") {
    if (!(buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)) return { ok: false, reason: "XLSX zip magic missing" };
  } else if (kind === "json") {
    try {
      const parsed = JSON.parse(buffer.toString("utf8"));
      schemaFingerprint = jsonSchemaFingerprint(parsed);
    } catch {
      return { ok: false, reason: "invalid JSON payload" };
    }
  } else if (kind === "csv") {
    const header = buffer.toString("utf8").split(/\r?\n/, 1)[0]?.trim();
    if (!header || !header.includes(",")) return { ok: false, reason: "CSV header missing" };
    schemaFingerprint = crypto.createHash("sha256").update(header.toLowerCase().replace(/\s+/g, " ")).digest("hex");
  } else if (kind === "html") {
    if (!looksLikeHtml(buffer) && !contentType.includes("text/html")) return { ok: false, reason: "expected HTML resource" };
  } else {
    return { ok: false, reason: `unsupported expected_kind '${kind ?? ""}'` };
  }
  return { ok: true, notModified: false, schemaFingerprint };
}

export function buildPlan(sources, requestedSourceId = null) {
  return sources
    .filter((source) => !requestedSourceId || source.source_id === requestedSourceId)
    .map((source) => ({
      source_id: source.source_id,
      jurisdiction: source.jurisdiction,
      metric_family: source.metric_family,
      mode: source.acquisition?.mode ?? "discovery_only",
      url: source.acquisition?.url ?? null,
      expected_kind: source.acquisition?.expected_kind ?? null,
      rate_limit_ms: Number(source.acquisition?.rate_limit_ms ?? 1_000),
      writes: source.acquisition?.mode === "live_public" ? "gitignored local immutable cache only" : "none",
      publishable: false,
    }));
}

function assertOfficialUrl(source) {
  const url = new URL(source.acquisition.url);
  if (url.protocol !== "https:") throw new Error(`${source.source_id}: only HTTPS acquisition is allowed`);
  const allowed = source.acquisition.allowed_hosts ?? [];
  if (!allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error(`${source.source_id}: host ${url.hostname} is not allow-listed`);
  }
  return url;
}

function checkpointPath(localRoot, sourceId) {
  return path.join(localRoot, sourceId, "checkpoint.json");
}

function readCheckpoint(localRoot, sourceId) {
  const target = checkpointPath(localRoot, sourceId);
  if (!fs.existsSync(target)) return null;
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

export async function acquireSource(source, {
  localRoot = DEFAULT_LOCAL_ROOT,
  fetchImpl = fetch,
  now = () => new Date(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (source.acquisition?.mode !== "live_public") throw new Error(`${source.source_id}: source is not eligible for live acquisition`);
  if (source.licence?.status !== "verified_reusable") throw new Error(`${source.source_id}: reusable licence is not verified`);
  const url = assertOfficialUrl(source);
  const prior = readCheckpoint(localRoot, source.source_id);
  const headers = {};
  if (prior?.etag) headers["If-None-Match"] = prior.etag;
  if (prior?.last_modified) headers["If-Modified-Since"] = prior.last_modified;
  const attempts = Math.max(1, Number(source.acquisition.retries ?? 3));
  let response;
  let buffer;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      response = await fetchImpl(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(Number(source.acquisition.timeout_ms ?? 30_000)),
      });
      if (response.status !== 429 && response.status < 500) {
        buffer = response.status === 304 ? Buffer.alloc(0) : Buffer.from(await response.arrayBuffer());
        break;
      }
      if (attempt === attempts) buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === attempts) throw error;
    }
    if (attempt < attempts) await sleep(Number(source.acquisition.backoff_ms ?? 250) * attempt);
  }

  const validation = validatePayload(response, buffer ?? Buffer.alloc(0), source);
  if (!validation.ok) throw new Error(`${source.source_id}: acquisition rejected — ${validation.reason}`);
  if (validation.notModified) return { source_id: source.source_id, status: "not_modified", checkpoint: prior };

  const sourceDir = path.join(localRoot, source.source_id);
  const result = writeImmutable(
    sourceDir,
    source.source_id,
    source.acquisition.extension ?? source.acquisition.expected_kind ?? "bin",
    buffer,
    {
      source_id: source.source_id,
      url: url.toString(),
      retrieved_at: now().toISOString(),
      licence: source.licence,
      http: {
        status: response.status,
        content_type: response.headers.get("content-type"),
        content_length: buffer.length,
        etag: response.headers.get("etag"),
        last_modified: response.headers.get("last-modified"),
      },
      schema_fingerprint: validation.schemaFingerprint,
    },
  );

  const priorSchema = prior?.schema_fingerprint ?? source.acquisition.prior_schema_fingerprint ?? null;
  const schemaDrift = Boolean(priorSchema && validation.schemaFingerprint && priorSchema !== validation.schemaFingerprint);
  const checkpoint = {
    source_id: source.source_id,
    retrieved_at: now().toISOString(),
    sha256: result.sha,
    etag: response.headers.get("etag"),
    last_modified: response.headers.get("last-modified"),
    schema_fingerprint: validation.schemaFingerprint,
    status: schemaDrift ? "quarantined_schema_drift" : "acquired_local_only",
  };
  fs.mkdirSync(sourceDir, { recursive: true });
  atomicWrite(checkpointPath(localRoot, source.source_id), `${JSON.stringify(checkpoint, null, 2)}\n`);
  return { source_id: source.source_id, status: checkpoint.status, rawPath: result.rawPath, manifestPath: result.manPath, checkpoint };
}

export function loadSourceMatrix(matrixPath = MATRIX_PATH) {
  return JSON.parse(fs.readFileSync(matrixPath, "utf8")).sources;
}

export async function runAcquisitionQueue(sources, {
  acquireImpl = acquireSource,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const results = [];
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    results.push(await acquireImpl(source));
    if (index < sources.length - 1) await sleep(Math.max(0, Number(source.acquisition?.rate_limit_ms ?? 1_000)));
  }
  return results;
}

function parseArgs(argv) {
  const mode = argv.includes("--acquire") ? "acquire" : argv.includes("--plan") ? "plan" : "dry-run";
  const sourceIndex = argv.indexOf("--source");
  return { mode, sourceId: sourceIndex >= 0 ? argv[sourceIndex + 1] : null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = loadSourceMatrix();
  const plan = buildPlan(sources, args.sourceId);
  if (args.sourceId && plan.length === 0) throw new Error(`unknown source '${args.sourceId}'`);
  if (args.mode !== "acquire") {
    const cache = plan.map((item) => ({
      ...item,
      cache_present: fs.existsSync(checkpointPath(DEFAULT_LOCAL_ROOT, item.source_id)),
      mode_executed: args.mode,
      network_requests: 0,
      files_written: 0,
    }));
    console.log(JSON.stringify({ safe: true, plan: cache }, null, 2));
    return;
  }
  const eligible = sources.filter((source) => (!args.sourceId || source.source_id === args.sourceId) && source.acquisition?.mode === "live_public");
  if (eligible.length === 0) throw new Error("no selected source is eligible for live public acquisition");
  const results = await runAcquisitionQueue(eligible);
  console.log(JSON.stringify({ safe: true, publish_writes: 0, results }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
