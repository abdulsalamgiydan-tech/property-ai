/**
 * Immutable acquisition core (V3) — extends the V2.1.2 byte-immutable contract
 * to real official downloads. Shared by every source lane.
 *
 * Guarantees:
 *  - SHA-256 is over the EXACT downloaded bytes; the filename carries that sha8.
 *  - an existing sha-named file is reused only after re-hashing it (integrity);
 *    a mismatch throws (corruption) — never a silent reuse.
 *  - atomic temp-file + rename; a failed write leaves any prior artifact intact.
 *  - captured HTTP provenance (status, content-type, length, ETag, Last-Modified)
 *    is stored in an immutable per-resource manifest alongside the raw file.
 *  - a failed/short/typed-wrong retrieval fails closed and writes nothing.
 *
 * Raw bytes land in gitignored warehouse/data/local; only checksums/manifests
 * (small) are ever committed. No WAF/CAPTCHA bypass, no scraping — documented
 * downloads/APIs only.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Atomic write: temp file then rename. A failure to write/rename leaves `target` untouched. */
export function atomicWrite(target, content) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, target);
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.rmSync(tmp); } catch { /* ignore cleanup */ }
    throw e;
  }
}

/**
 * Validate an HTTP response before the bytes may enter staging. Returns
 * {ok, buf?, reason?}. Fails closed on bad status, wrong content-type, empty or
 * over-budget body.
 * @param {{expectContentType?:string, maxBytes?:number, minBytes?:number}} [opts]
 */
export function validateResponse(res, buf, opts = {}) {
  const { expectContentType, maxBytes = 50 * 1024 * 1024, minBytes = 1 } = opts;
  if (!res || !res.ok) return { ok: false, reason: `HTTP ${res ? res.status : "no-response"}` };
  const ct = (res.headers?.get?.("content-type") || "").toLowerCase();
  if (expectContentType && !ct.includes(expectContentType)) return { ok: false, reason: `unexpected content-type '${ct}'` };
  if (buf.length < minBytes) return { ok: false, reason: `body ${buf.length} bytes < min ${minBytes}` };
  if (buf.length > maxBytes) return { ok: false, reason: `body ${buf.length} bytes > budget ${maxBytes}` };
  return { ok: true, buf };
}

/**
 * Content-address raw bytes: write `<basename>.<sha8>.<ext>` + an immutable
 * `<basename>.<sha8>.manifest.json`. Reuse an identical existing file after an
 * integrity check; never overwrite a different resource at a fixed path.
 */
export function writeImmutable(dir, basename, ext, buf, provenance) {
  const sha = sha256(buf);
  const sha8 = sha.slice(0, 8);
  fs.mkdirSync(dir, { recursive: true });
  const rawPath = path.join(dir, `${basename}.${sha8}.${ext}`);
  const manPath = path.join(dir, `${basename}.${sha8}.manifest.json`);
  if (fs.existsSync(rawPath)) {
    const onDisk = sha256(fs.readFileSync(rawPath));
    if (onDisk !== sha) throw new Error(`raw corruption: ${rawPath} hashes ${onDisk.slice(0, 8)} != ${sha8}`);
  } else {
    atomicWrite(rawPath, buf);
  }
  if (!fs.existsSync(manPath)) {
    atomicWrite(manPath, JSON.stringify({ basename, sha256: sha, bytes: buf.length, ...provenance }, null, 2));
  }
  return { sha, sha8, rawPath, manPath };
}

/**
 * Download → validate → content-address, capturing full HTTP provenance. A
 * failed/invalid retrieval throws and never overwrites the last valid artifact.
 */
export async function acquire(url, { dir, basename, ext = "bin", expectContentType, maxBytes, timeoutMs = 30000, sourceId, retrievedAt } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const buf = Buffer.from(await res.arrayBuffer());
  const v = validateResponse(res, buf, { expectContentType, maxBytes });
  if (!v.ok) throw new Error(`acquire ${basename}: retrieval invalid — ${v.reason}`);
  const provenance = {
    source_id: sourceId ?? null,
    url,
    retrieved_at: retrievedAt ?? new Date().toISOString(),
    http: { status: res.status, content_type: res.headers.get("content-type"), content_length: buf.length, etag: res.headers.get("etag"), last_modified: res.headers.get("last-modified") },
  };
  return writeImmutable(dir, basename, ext, buf, provenance);
}
