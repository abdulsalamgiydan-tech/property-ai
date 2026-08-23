import { describe, it, expect } from "vitest";
import { parseVicPropertySales, vicQuarterEnd, normalisePropertyType, MIN_SALES } from "./parse.mjs";
import { REAL_ROWS, DRIFTED_ROWS } from "./fixtures.mjs";

const OPTS = { retrievedAt: "2026-08-23T00:00:00Z", resourceSha: "sha-test" };

describe("vicQuarterEnd / normalisePropertyType", () => {
  it("derives quarter-end from label", () => {
    expect(vicQuarterEnd("Q2 2026")).toBe("2026-06-30");
    expect(vicQuarterEnd("2026 Q4")).toBe("2026-12-31");
    expect(vicQuarterEnd("H2 2026")).toBeNull();
    expect(vicQuarterEnd("")).toBeNull();
  });
  it("maps property types, rejects unknown", () => {
    expect(normalisePropertyType("House")).toBe("house");
    expect(normalisePropertyType("Unit")).toBe("unit");
    expect(normalisePropertyType("Vacant Land")).toBe("land");
    expect(normalisePropertyType("Studio")).toBeNull();
  });
});

describe("parseVicPropertySales", () => {
  const out = parseVicPropertySales(REAL_ROWS, OPTS);

  it("refuses drifted headers (never guesses)", () => {
    const d = parseVicPropertySales(DRIFTED_ROWS, OPTS);
    expect(d.drift).toBe(true);
    expect(d.records).toHaveLength(0);
  });

  it("accepts only rows passing every gate; quarantines the rest with reasons", () => {
    // ABBOTSFORD house+unit, BRUNSWICK house = 3 accepted
    expect(out.records.map((r) => `${r.suburb}/${r.property_type}`)).toEqual([
      "ABBOTSFORD/house",
      "ABBOTSFORD/unit",
      "BRUNSWICK/house",
    ]);
    const reasons = out.quarantined.map((q) => q.quarantine_reason).sort();
    expect(reasons).toEqual([
      "insufficient_sample", // BALWYN 6
      "non_positive_or_suppressed_median", // CARLTON 0
      "unknown_property_type", // DOCKLANDS Studio
      "unparseable_period", // FITZROY H2 2026
    ]);
  });

  it("classifies accepted rows as DIRECT with source, period, type and sample", () => {
    const abb = out.records.find((r) => r.suburb === "ABBOTSFORD" && r.property_type === "house");
    expect(abb.classification).toBe("direct");
    expect(abb.source_id).toBe("vic_vg_property_sales");
    expect(abb.current_period_end).toBe("2026-06-30");
    expect(abb.median_sale_price).toBe(1275000);
    expect(abb.sales_count).toBeGreaterThanOrEqual(MIN_SALES);
  });

  it("is deterministic / idempotent (stable order, same output on rerun)", () => {
    const again = parseVicPropertySales(REAL_ROWS, OPTS);
    expect(again.records).toEqual(out.records);
  });

  it("never fabricates: a suppressed median is quarantined, not defaulted to 0", () => {
    const carlton = out.quarantined.find((q) => q.suburb === "CARLTON");
    expect(carlton.median_sale_price).toBe(0);
    expect(out.records.some((r) => r.suburb === "CARLTON")).toBe(false);
  });
});
