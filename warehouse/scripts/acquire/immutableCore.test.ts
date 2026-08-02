import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { writeImmutable, validateResponse, atomicWrite, sha256 } from "./immutableCore.mjs";

const dirs: string[] = [];
function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "v3-acq-")); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); });

function res({ ok = true, status = 200, ct = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } = {}) {
  return { ok, status, headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? ct : null) } };
}

describe("validateResponse — fails closed", () => {
  it("accepts a good spreadsheet response", () => {
    expect(validateResponse(res(), Buffer.alloc(1000), { expectContentType: "spreadsheetml" }).ok).toBe(true);
  });
  it("rejects bad status, wrong content-type, empty and over-budget", () => {
    expect(validateResponse(res({ ok: false, status: 404 }), Buffer.alloc(10)).ok).toBe(false);
    expect(validateResponse(res({ ct: "text/html" }), Buffer.alloc(10), { expectContentType: "spreadsheetml" }).ok).toBe(false);
    expect(validateResponse(res(), Buffer.alloc(0)).ok).toBe(false);
    expect(validateResponse(res(), Buffer.alloc(100), { maxBytes: 50 }).ok).toBe(false);
  });
});

describe("writeImmutable — byte-accurate + integrity", () => {
  it("manifest sha256 equals the exact stored bytes; filename carries sha8", () => {
    const d = tmp();
    const buf = Buffer.from("official-bytes-");
    const { sha, rawPath, manPath } = writeImmutable(d, "res", "xlsx", buf, { source_id: "x" });
    expect(sha256(fs.readFileSync(rawPath))).toBe(sha);
    expect(JSON.parse(fs.readFileSync(manPath, "utf8")).sha256).toBe(sha);
    expect(path.basename(rawPath)).toContain(sha.slice(0, 8));
  });
  it("reuses an identical file after an integrity check, and throws on corruption", () => {
    const d = tmp();
    const buf = Buffer.from("abc");
    const a = writeImmutable(d, "res", "xlsx", buf, {});
    expect(writeImmutable(d, "res", "xlsx", buf, {}).rawPath).toBe(a.rawPath); // reuse
    fs.writeFileSync(a.rawPath, "tampered");
    expect(() => writeImmutable(d, "res", "xlsx", buf, {})).toThrow(/corruption/);
  });
  it("atomicWrite preserves a prior target when rename fails", () => {
    const d = tmp();
    const target = path.join(d, "f");
    atomicWrite(target, "v1");
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => { throw new Error("boom"); });
    expect(() => atomicWrite(target, "v2")).toThrow(/boom/);
    expect(fs.readFileSync(target, "utf8")).toBe("v1");
  });
});
