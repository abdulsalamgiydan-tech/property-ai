import { describe, expect, it } from "vitest";
import {
  METRIC_DEFINITIONS,
  SNAPSHOT_MEASURABLE,
  GEOGRAPHY_LEVELS,
  PROPERTY_TYPES,
} from "../../config/metric_definitions.mjs";

describe("metric definition registry", () => {
  it("has unique metric keys", () => {
    const keys = METRIC_DEFINITIONS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every metric declares a unit and valid geography levels / property types", () => {
    for (const m of METRIC_DEFINITIONS) {
      expect(m.unit, m.key).toBeTruthy();
      for (const g of m.allowedGeographyLevels) expect(GEOGRAPHY_LEVELS, m.key).toContain(g);
      for (const p of m.allowedPropertyTypes) expect(PROPERTY_TYPES, m.key).toContain(p);
      expect(m.minSample, m.key).toBeGreaterThanOrEqual(0);
      expect(m.freshnessSlaDays, m.key).toBeGreaterThan(0);
    }
  });

  it("derived metrics document a formula and their inputs", () => {
    for (const m of METRIC_DEFINITIONS.filter((d) => d.kind === "derived")) {
      expect(m.formula, m.key).toBeTruthy();
      expect(Array.isArray(m.derivedFrom) && m.derivedFrom.length, m.key).toBeTruthy();
    }
  });

  it("unsourced metrics (vacancy, days on market) have no column and no contextual fallback", () => {
    for (const m of METRIC_DEFINITIONS.filter((d) => d.kind === "unsourced")) {
      expect(m.column, m.key).toBeNull();
      expect(m.contextualFallback, m.key).toBe(false);
      // records why it must not be estimated (note is optional on the union)
      expect((m as { note?: string }).note, m.key).toBeTruthy();
    }
  });

  it("gross yield never permits contextual fallback (no suburb price ÷ postcode rent)", () => {
    const y = METRIC_DEFINITIONS.find((m) => m.key === "gross_yield");
    expect(y?.contextualFallback).toBe(false);
  });

  it("SNAPSHOT_MEASURABLE contains exactly the metrics with a snapshot column", () => {
    expect(SNAPSHOT_MEASURABLE.every((m) => m.column)).toBe(true);
    expect(SNAPSHOT_MEASURABLE.length).toBe(METRIC_DEFINITIONS.filter((m) => m.column).length);
  });
});

// A coverage report row must reconcile: populated + missing === denominator, and
// projected coverage never exceeds 100%. This is the invariant the maximiser and
// its reports must always satisfy (Phase 6 #15).
function reconciles(row: { denominator: number; populated: number; recoverable: number }): boolean {
  const missing = row.denominator - row.populated;
  const projected = row.populated + row.recoverable;
  return missing >= 0 && projected <= row.denominator && row.populated + missing === row.denominator;
}

describe("coverage reconciliation invariant", () => {
  it("populated + missing === denominator and projected ≤ denominator", () => {
    expect(reconciles({ denominator: 15334, populated: 453, recoverable: 126 })).toBe(true);
    expect(reconciles({ denominator: 15334, populated: 15334, recoverable: 0 })).toBe(true);
  });
  it("rejects impossible rows (populated or recoverable exceeding the denominator)", () => {
    expect(reconciles({ denominator: 100, populated: 120, recoverable: 0 })).toBe(false);
    expect(reconciles({ denominator: 100, populated: 90, recoverable: 20 })).toBe(false);
  });
});
