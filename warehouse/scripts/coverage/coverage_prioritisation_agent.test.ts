import { describe, expect, it } from "vitest";
import { buildPrioritisationReport } from "./coverage_prioritisation_agent.mjs";

describe("coverage prioritisation report", () => {
  it("copies only committed baseline counts and labels rankings estimated", () => {
    const report = buildPrioritisationReport({
      as_of: "2026-08-23",
      sources: [{ source_id: "x", jurisdiction: "WA", metric_family: "sales", disposition: "candidate", licence: { status: "verified_reusable" }, priority: { estimated_addressable_geographies: 10, reliability_weight: 1, accessibility_weight: 1, mapping_weight: 1, effort: 1 } }],
    }, {
      total_suburb_snapshots: 100,
      metrics: [
        { metric: "median_sale_price_overall", populated: 20 },
        { metric: "median_weekly_rent", populated: 10 },
      ],
    });
    expect(report.published_baseline.median_sale_price_overall).toBe(20);
    expect(report.ranked_opportunities[0].evidence).toBe("estimated");
    expect(report.production_coverage_changed).toBe(false);
  });
});
