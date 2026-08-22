import { describe, it, expect } from "vitest";
import { summarise, DERIVED_METRICS } from "./coverage_freshness_summary.mjs";

const coverage = {
  total_suburb_snapshots: 15334,
  metrics: [
    { metric: "median_sale_price_overall", populated: 4821, missing: 10513, pct: 31.4 },
    { metric: "median_weekly_rent", populated: 3089, missing: 12245, pct: 20.1 },
    { metric: "gross_yield", populated: 453, missing: 14881, pct: 3 },
    { metric: "annual_price_growth_12m", populated: 735, missing: 14599, pct: 4.8 },
    { metric: "dwelling_stock", populated: 15334, missing: 0, pct: 100 },
  ],
};

const registry = [
  { id: "sa_house", name: "SA house", jurisdiction: "SA", licence: "Creative Commons Attribution", cadence: "quarterly" },
  { id: "nsw_sales", name: "NSW sales", jurisdiction: "NSW", licence: "CC BY", cadence: "quarterly" },
  { id: "wa_rent", name: "WA rent", jurisdiction: "WA", licence: "custom", cadence: "quarterly" },
];

describe("coverage_freshness_summary.summarise (offline, deterministic)", () => {
  const s = summarise(coverage, registry);

  it("classifies yield & growth as DERIVED, medians/rent/stock as DIRECT", () => {
    expect(DERIVED_METRICS.has("gross_yield")).toBe(true);
    expect(DERIVED_METRICS.has("annual_price_growth_12m")).toBe(true);
    expect(s.derived_metrics.map((m) => m.metric).sort()).toEqual(["annual_price_growth_12m", "gross_yield"]);
    expect(s.direct_metrics.map((m) => m.metric)).toContain("median_sale_price_overall");
    expect(s.direct_metrics.map((m) => m.metric)).not.toContain("gross_yield");
  });

  it("recomputes coverage pct from committed counts (never fabricated)", () => {
    const sale = s.direct_metrics.find((m) => m.metric === "median_sale_price_overall");
    expect(sale.pct).toBeCloseTo(31.4, 1);
    expect(sale.populated).toBe(4821);
    expect(sale.missing).toBe(10513);
  });

  it("surfaces the worst-covered DIRECT metrics as highest-value gaps", () => {
    // median_weekly_rent (20.1%) is the worst-covered DIRECT metric here.
    expect(s.highest_value_gaps[0].metric).toBe("median_weekly_rent");
    expect(s.highest_value_gaps.some((g) => g.metric === "gross_yield")).toBe(false); // derived excluded
  });

  it("rolls up sources by jurisdiction and counts reuse-licensed ones", () => {
    expect(s.registered_sources).toBe(3);
    expect(s.sources_by_jurisdiction.SA.sources).toBe(1);
    expect(s.sources_by_jurisdiction.SA.licensedForReuse).toBe(1);
    expect(s.sources_by_jurisdiction.NSW.licensedForReuse).toBe(1);
    expect(s.sources_by_jurisdiction.WA.licensedForReuse).toBe(0); // "custom" not a reuse licence
  });

  it("is deterministic given identical inputs", () => {
    const a = summarise(coverage, registry);
    const b = summarise(coverage, registry);
    // ignore generated_at timestamp
    const strip = ({ generated_at, ...rest }) => rest;
    expect(strip(a)).toEqual(strip(b));
  });
});
