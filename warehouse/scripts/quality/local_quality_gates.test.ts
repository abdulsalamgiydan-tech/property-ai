import { describe, expect, it } from "vitest";
import { rowNaturalKey, runLocalQualityGates } from "./local_quality_gates.mjs";

const SHA = "b".repeat(64);

function row(overrides = {}) {
  return {
    geographyId: "SAL51234",
    geographyType: "SAL",
    geographyLabel: "FREMANTLE",
    state: "WA",
    metric: "weekly_sales_turnover",
    value: 4_200_000,
    unit: "AUD",
    propertyType: "all_residential",
    reportingPeriod: "2026-08-21",
    sourceId: "wa_property_sales",
    sourcePublished: "2026-08-21",
    acquiredAt: "2026-08-23T00:00:00Z",
    classification: "direct",
    freshness: "fresh",
    confidence: "medium",
    fileChecksum: SHA,
    adapterVersion: "wa_property_sales@1-candidate",
    schemaVersion: "regional-data-hub-normalised@1",
    ...overrides,
  };
}

function batch(overrides = {}) {
  return {
    sourceId: "wa_property_sales",
    expectedSourceId: "wa_property_sales",
    sourceLicence: "CC BY 4.0",
    expectedLicence: "CC BY 4.0",
    schemaFingerprint: "header-v1",
    fileMeta: { mime: "text/csv", bytes: 500, looksHtml: false, complete: true },
    rows: [row()],
    quarantined: [],
    ...overrides,
  };
}

describe("local quality gates", () => {
  it("admits a complete deterministic batch", () => {
    const result = runLocalQualityGates(batch());
    expect(result.admit).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails closed on HTML masquerading as data and schema drift", () => {
    const result = runLocalQualityGates(batch({
      priorSchemaFingerprint: "header-v0",
      fileMeta: { mime: "text/html", bytes: 900, looksHtml: true, complete: true },
    }));
    expect(result.admit).toBe(false);
    expect(result.failures.map((g) => g.id)).toEqual(expect.arrayContaining(["file_integrity", "schema_fingerprint"]));
  });

  it("rejects duplicates, invalid geography/value and source mismatch", () => {
    const bad = row({ geographyId: "", value: 0, sourceId: "other" });
    const duplicate = row();
    const result = runLocalQualityGates(batch({ rows: [row(), duplicate, bad] }));
    expect(result.admit).toBe(false);
    expect(result.invalidRows[0].errors).toEqual(expect.arrayContaining(["missing_geography", "invalid_value_for_metric", "source_mismatch"]));
    expect(result.duplicateNaturalKeys).toContain(rowNaturalKey(row()));
  });

  it("accepts signed growth and rejects impossible dates or incomplete lineage", () => {
    expect(runLocalQualityGates(batch({ rows: [row({ metric: "price_growth_12m", value: -4.2, unit: "percent" })] })).admit).toBe(true);
    const result = runLocalQualityGates(batch({ rows: [row({ reportingPeriod: "2026-02-31", acquiredAt: "2026-08-23", geographyType: "UNKNOWN" })] }));
    expect(result.admit).toBe(false);
    expect(result.invalidRows[0].errors).toEqual(expect.arrayContaining([
      "invalid_reporting_period",
      "invalid_acquired_at",
      "invalid_geography_type",
    ]));
  });

  it("blocks a material coverage collapse or unexpected distribution shift", () => {
    const result = runLocalQualityGates(batch({ previousAcceptedRows: 10, minimumCoverageRatio: 0.8, priorMedian: 100_000 }));
    expect(result.admit).toBe(false);
    expect(result.failures.map((g) => g.id)).toEqual(expect.arrayContaining(["coverage_collapse", "distribution_shift"]));
  });

  it("enforces a configured defensibility threshold without applying one to factual counts by default", () => {
    expect(runLocalQualityGates(batch({ rows: [row({ sampleSize: 3 })] })).admit).toBe(true);
    const result = runLocalQualityGates(batch({ rows: [row({ sampleSize: 3 })], minimumSampleSize: 10 }));
    expect(result.admit).toBe(false);
    expect(result.failures.map((gate) => gate.id)).toContain("minimum_sample_size");
  });

  it("checks distribution shifts per metric instead of mixing unlike units", () => {
    const result = runLocalQualityGates(batch({
      rows: [row({ metric: "weekly_property_sales_count", value: 10, unit: "transactions" }), row({ metric: "weekly_property_sales_turnover", value: 5_000_000 })],
      priorMediansByMetric: { weekly_property_sales_count: 8, weekly_property_sales_turnover: 4_000_000 },
    }));
    expect(result.admit).toBe(true);
  });

  it("checks idempotent reruns by natural-key set while retaining quarantine evidence", () => {
    const result = runLocalQualityGates(batch({
      rerunNaturalKeys: ["different|key"],
      quarantined: [{ reason: "suppressed" }],
    }));
    expect(result.admit).toBe(false);
    expect(result.failures.map((g) => g.id)).toContain("idempotent_rerun");
    expect(result.quarantinedRows).toBe(1);
  });
});
