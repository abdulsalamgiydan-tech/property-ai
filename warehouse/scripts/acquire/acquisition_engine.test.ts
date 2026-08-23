import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireSource, buildPlan, jsonSchemaFingerprint, looksLikeHtml, runAcquisitionQueue, validatePayload } from "./acquisition_engine.mjs";

const dirs: string[] = [];
const tmp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-acquire-")); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

function source(overrides = {}) {
  return {
    source_id: "official_test",
    jurisdiction: "SA",
    metric_family: "sales",
    licence: { status: "verified_reusable", name: "CC BY 4.0" },
    acquisition: {
      mode: "live_public",
      url: "https://data.sa.gov.au/api/3/action/package_show?id=test",
      allowed_hosts: ["data.sa.gov.au"],
      expected_kind: "json",
      extension: "json",
      min_bytes: 2,
      max_bytes: 10000,
      retries: 2,
      backoff_ms: 0,
      ...overrides,
    },
  };
}

function response(body: string, { status = 200, contentType = "application/json", etag = "v1", contentLength = null as number | null } = {}) {
  const bytes = Buffer.from(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => ({ "content-type": contentType, "content-length": contentLength == null ? null : String(contentLength), etag, "last-modified": "Sat, 22 Aug 2026 00:00:00 GMT" }[key.toLowerCase()] ?? null) },
    arrayBuffer: async () => bytes,
  };
}

describe("acquisition engine", () => {
  it("plans without I/O and labels every lane non-publishable", () => {
    const plan = buildPlan([source(), source({ mode: "manual_inbox", url: null })]);
    expect(plan).toHaveLength(2);
    expect(plan.every((item) => item.publishable === false)).toBe(true);
  });

  it("rate-limits multi-source acquisition queues", async () => {
    const acquireImpl = vi.fn(async (item) => ({ source_id: item.source_id }));
    const sleep = vi.fn(async () => {});
    const sources = [source({ rate_limit_ms: 750 }), { ...source(), source_id: "second" }];
    await expect(runAcquisitionQueue(sources, { acquireImpl, sleep })).resolves.toEqual([
      { source_id: "official_test" },
      { source_id: "second" },
    ]);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(750);
  });

  it("detects HTML masquerading as JSON/CSV and validates JSON shape", () => {
    const html = Buffer.from("<!doctype html><html><head></head></html>");
    expect(looksLikeHtml(html)).toBe(true);
    expect(validatePayload(response(html.toString(), { contentType: "text/html" }), html, source()).ok).toBe(false);
    const json = Buffer.from('{"success":true,"result":{}}');
    expect(validatePayload(response(json.toString()), json, source())).toMatchObject({ ok: true, notModified: false });
    expect(validatePayload(response(json.toString(), { contentType: "text/plain" }), json, source())).toMatchObject({ ok: false });
    expect(validatePayload(response(json.toString(), { contentLength: json.length + 1 }), json, source())).toMatchObject({ ok: false });
  });

  it("fingerprints nested JSON structure rather than only top-level keys", () => {
    expect(jsonSchemaFingerprint({ success: true, result: { resources: [{ url: "a" }] } })).not.toBe(
      jsonSchemaFingerprint({ success: true, result: { resources: [{ id: "a" }] } }),
    );
    expect(jsonSchemaFingerprint({ success: true, result: { resources: [{ url: "different-value" }] } })).toBe(
      jsonSchemaFingerprint({ success: false, result: { resources: [{ url: "a" }] } }),
    );
  });

  it("retries a transient response, writes immutable local bytes and never publishes", async () => {
    const localRoot = tmp();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response("temporary", { status: 503, contentType: "text/plain" }))
      .mockResolvedValueOnce(response('{"success":true,"result":{}}'));
    const result = await acquireSource(source(), {
      localRoot,
      fetchImpl,
      sleep: async () => {},
      now: () => new Date("2026-08-23T00:00:00Z"),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("acquired_local_only");
    expect(fs.existsSync(result.rawPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(localRoot, "official_test", "checkpoint.json"), "utf8")).status).toBe("acquired_local_only");
  });

  it("quarantines a changed JSON schema fingerprint", async () => {
    const localRoot = tmp();
    const now = () => new Date("2026-08-23T00:00:00Z");
    await acquireSource(source(), { localRoot, fetchImpl: vi.fn().mockResolvedValue(response('{"success":true}')), sleep: async () => {}, now });
    const second = await acquireSource(source(), { localRoot, fetchImpl: vi.fn().mockResolvedValue(response('{"different":true}', { etag: "v2" })), sleep: async () => {}, now });
    expect(second.status).toBe("quarantined_schema_drift");
  });

  it("resumes with ETag/Last-Modified validators and handles 304 without rewriting bytes", async () => {
    const localRoot = tmp();
    const now = () => new Date("2026-08-23T00:00:00Z");
    await acquireSource(source(), { localRoot, fetchImpl: vi.fn().mockResolvedValue(response('{"success":true}')), sleep: async () => {}, now });
    const fetchImpl = vi.fn().mockResolvedValue(response("", { status: 304, contentType: "", etag: "v1" }));
    const second = await acquireSource(source(), { localRoot, fetchImpl, sleep: async () => {}, now });
    expect(second.status).toBe("not_modified");
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      "If-None-Match": "v1",
      "If-Modified-Since": "Sat, 22 Aug 2026 00:00:00 GMT",
    });
  });

  it("refuses non-HTTPS, non-allowlisted and unlicensed acquisition", async () => {
    await expect(acquireSource(source({ url: "http://data.sa.gov.au/test" }), { fetchImpl: vi.fn() })).rejects.toThrow(/HTTPS/);
    await expect(acquireSource(source({ url: "https://example.com/test" }), { fetchImpl: vi.fn() })).rejects.toThrow(/allow-listed/);
    await expect(acquireSource({ ...source(), licence: { status: "review_required" } }, { fetchImpl: vi.fn() })).rejects.toThrow(/licence/);
  });
});
