import { describe, expect, it } from "vitest";
import { prioritise, simulate } from "./coverage_engine_core.mjs";

const coverage = {
  total_suburb_snapshots: 15_334,
  metrics: [
    { metric: "median_sale_price_overall", populated: 4_821 },
    { metric: "median_weekly_rent", populated: 3_089 },
    { metric: "gross_yield", populated: 453 },
    { metric: "annual_price_growth_12m", populated: 735 },
  ],
};

describe("offline coverage engine", () => {
  it("ranks only estimated opportunity and penalises unverified licences", () => {
    const ranked = prioritise([
      { source_id: "licensed", jurisdiction: "WA", metric_family: "sales", disposition: "candidate", licence: { status: "verified_reusable" }, priority: { estimated_addressable_geographies: 1000, reliability_weight: 1, accessibility_weight: 1, mapping_weight: 1, effort: 2 } },
      { source_id: "unclear", jurisdiction: "QLD", metric_family: "sales", disposition: "discovery", licence: { status: "review_required" }, priority: { estimated_addressable_geographies: 1000, reliability_weight: 1, accessibility_weight: 1, mapping_weight: 1, effort: 2 } },
    ], coverage);
    expect(ranked.map((item) => item.source_id)).toEqual(["licensed", "unclear"]);
    expect(ranked.every((item) => item.evidence === "estimated")).toBe(true);
    expect(ranked[0].warning).toMatch(/not achieved/);
  });

  it("keeps published counts unchanged while showing local candidates separately", () => {
    const result = simulate({
      coverage,
      candidateObservations: [
        { geographyId: "SAL1", metric: "median_sale_price", reportingPeriod: "2026-06-30" },
        { geographyId: "SAL2", metric: "median_sale_price", reportingPeriod: "2026-06-30" },
      ],
      publishedGeographyIdsByMetric: { median_sale_price: ["SAL1"] },
      estimatedOnly: { median_sale_price: 1000 },
    });
    const price = result.metrics.find((item) => item.metric === "median_sale_price");
    expect(price).toMatchObject({ current_published: 4821, after_published: 4821, verified_local_candidate: 2, verified_new_geographies: 1, estimated_only_ceiling: 1000 });
    expect(price.verified_new_geography_ids).toEqual(["SAL2"]);
    expect(result.production_coverage_changed).toBe(false);
  });

  it("reports unresolved novelty when published geography IDs are absent", () => {
    const result = simulate({ coverage, candidateObservations: [{ geographyId: "SAL1", metric: "median_sale_price", reportingPeriod: "2026-06-30" }] });
    expect(result.metrics.find((item) => item.metric === "median_sale_price")?.verified_new_geographies).toBeNull();
  });

  it("calculates candidate-only yield and multi-period growth unlocks", () => {
    const result = simulate({
      coverage,
      candidateObservations: [
        { geographyId: "SAL1", metric: "median_sale_price", reportingPeriod: "2025-06-30" },
        { geographyId: "SAL1", metric: "median_sale_price", reportingPeriod: "2026-06-30" },
        { geographyId: "SAL1", metric: "median_weekly_rent", reportingPeriod: "2026-06-30" },
      ],
    });
    expect(result.derived_unlocks).toMatchObject({ verified_local_yield: 1, verified_local_growth_12m: 1 });
  });

  it("does not claim derived unlocks for mismatched property types or non-annual periods", () => {
    const result = simulate({
      coverage,
      candidateObservations: [
        { geographyId: "SAL1", propertyType: "house", metric: "median_sale_price", reportingPeriod: "2026-03-31" },
        { geographyId: "SAL1", propertyType: "house", metric: "median_sale_price", reportingPeriod: "2026-06-30" },
        { geographyId: "SAL1", propertyType: "unit", metric: "median_weekly_rent", reportingPeriod: "2026-06-30" },
      ],
    });
    expect(result.derived_unlocks).toMatchObject({ verified_local_yield: 0, verified_local_growth_12m: 0 });
  });
});
