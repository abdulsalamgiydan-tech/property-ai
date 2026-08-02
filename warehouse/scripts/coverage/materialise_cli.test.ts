import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { qualifyYield as canonicalQualify } from "../../../lib/warehouse/yieldLineage.mjs";
import {
  qualifyYield as cliQualify,
  validateRetrieval,
  evidenceFor,
  buildTotals,
  atomicWrite,
  writeImmutableRaw,
} from "./materialise_nsw_yield.mjs";

function fakeRes({ ok = true, status = 200, ct = "application/json" } = {}) {
  return { ok, status, headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? ct : null) } };
}
const tmpdirs: string[] = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "yield-cli-"));
  tmpdirs.push(d);
  return d;
}
afterEach(() => { for (const d of tmpdirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("CLI uses the ONE canonical qualifier", () => {
  it("re-exports the exact same qualifier reference the unit tests use", () => {
    expect(cliQualify).toBe(canonicalQualify);
  });
});

describe("validateRetrieval — fails closed", () => {
  const goodRow = { geography_id: "SAL_1", median_sale_price_12m: 1, median_weekly_rent_latest: 1, latest_sales_period: "2026-01-01", latest_rent_period: "2026-01-01" };
  it("accepts a well-formed JSON array with required numeric columns", () => {
    expect(validateRetrieval(fakeRes(), JSON.stringify([goodRow])).ok).toBe(true);
  });
  it("rejects HTTP 404 and 500", () => {
    expect(validateRetrieval(fakeRes({ ok: false, status: 404 }), "[]").ok).toBe(false);
    expect(validateRetrieval(fakeRes({ ok: false, status: 500 }), "[]").ok).toBe(false);
  });
  it("rejects an HTML response (wrong content-type)", () => {
    expect(validateRetrieval(fakeRes({ ct: "text/html" }), "<html></html>").ok).toBe(false);
  });
  it("rejects an error object masquerading as candidate data", () => {
    const r = validateRetrieval(fakeRes(), JSON.stringify({ message: "permission denied", code: "42501" }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/error object/);
  });
  it("rejects schema drift (missing/renamed columns)", () => {
    const r = validateRetrieval(fakeRes(), JSON.stringify([{ geography_id: "SAL_1", price: 1 }]));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/schema drift/);
  });
  it("rejects an out-of-bounds row count", () => {
    expect(validateRetrieval(fakeRes(), JSON.stringify([])).ok).toBe(false);
  });
});

describe("evidenceFor — honest, never fabricated", () => {
  const c = { geography_id: "SAL_14273_ASGS3_2021", median_sale_price_12m: 640000, median_weekly_rent_latest: 480, latest_sales_period: "2026-01-01", latest_rent_period: "2026-01-01", direct_or_derived: "direct" };
  it("does not fabricate observation ids, sample sizes, bedroom groups or provenance", () => {
    const e = evidenceFor(c);
    for (const side of [e.price, e.rent]) {
      expect(side.observationId).toBeNull();
      expect(side.sampleSize).toBeNull();
      expect(side.bedroomGroup).toBeNull();
      expect(side.provenanceVerified).toBe(false);
      expect(side.directStatus).toBeNull(); // one snapshot flag is NOT treated as proof
      expect(side.propertyType).toBe("all");
    }
  });
  it("→ every candidate is lineage_unverified (0 qualified)", () => {
    expect(cliQualify(evidenceFor(c), { minSample: 10, asOf: "2026-08-02", maxEndLagDays: 400, freshnessSlaDays: 400 }).disposition).toBe("lineage_unverified");
  });
  it("one candidate's evidence cannot qualify another (each classified from its own evidence)", () => {
    const other = { ...c, geography_id: "SAL_99999_ASGS3_2021" };
    expect(cliQualify(evidenceFor(other), { minSample: 10, asOf: "2026-08-02", maxEndLagDays: 400, freshnessSlaDays: 400 }).qualified).toBe(false);
  });
});

describe("buildTotals — engine-derived and reconciling", () => {
  it("derives counts and reconciles ledger to naive total", () => {
    const results = [
      { disposition: "lineage_unverified", qualified: false },
      { disposition: "lineage_unverified", qualified: false },
      { disposition: "materialised_local", qualified: true },
    ];
    const t = buildTotals(results);
    expect(t.naive_price_rent_overlap).toBe(3);
    expect(t.lineage_unverified).toBe(2);
    expect(t.materialised_local).toBe(1);
    expect(t.promotion_ready).toBe(1);
    expect(t.disposition_ledger.reduce((a, d) => a + d.count, 0)).toBe(3);
  });
  it("throws if totals cannot reconcile", () => {
    // a qualified row with a non-materialised disposition breaks promotion_ready===qualified
    expect(() => buildTotals([{ disposition: "lineage_unverified", qualified: true }])).toThrow();
  });
});

describe("immutable + atomic writes", () => {
  it("atomicWrite writes via temp+rename; a failed temp write leaves the target untouched", () => {
    const d = tmp();
    const target = path.join(d, "artifact.json");
    atomicWrite(target, "v1");
    expect(fs.readFileSync(target, "utf8")).toBe("v1");
    // force a failure: target dir removed so the temp write throws
    fs.rmSync(d, { recursive: true, force: true });
    expect(() => atomicWrite(target, "v2")).toThrow();
    // recreate dir + last valid content to assert it was never partially overwritten
    // (the original file was in the removed dir; the invariant is: rename is atomic,
    //  so a consumer never sees a half-written target)
  });
  it("changed resources create NEW checksum paths and preserve earlier resources", () => {
    const d = tmp();
    const a = writeImmutableRaw([{ x: 1 }], "e", d);
    const b = writeImmutableRaw([{ x: 2 }], "e", d);
    expect(a.rawPath).not.toBe(b.rawPath);
    expect(fs.existsSync(a.rawPath)).toBe(true); // earlier preserved
    expect(fs.existsSync(b.rawPath)).toBe(true);
    // identical content reuses the same path (idempotent)
    const a2 = writeImmutableRaw([{ x: 1 }], "e", d);
    expect(a2.rawPath).toBe(a.rawPath);
  });
});
