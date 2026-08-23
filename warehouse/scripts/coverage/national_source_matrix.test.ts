import { describe, expect, it } from "vitest";
import fs from "node:fs";
import matrix from "../../reports/national_source_matrix.json";
import { enrichMatrix } from "./build_national_source_matrix.mjs";

const registry = JSON.parse(fs.readFileSync(new URL("../../config/v3_source_registry.json", import.meta.url), "utf8"));
const coverage = JSON.parse(fs.readFileSync(new URL("../../reports/suburb_metric_coverage.json", import.meta.url), "utf8"));

describe("national source matrix", () => {
  it("covers every state/territory and uses only explicit evidence labels", () => {
    expect(new Set(matrix.sources.map((source) => source.jurisdiction))).toEqual(new Set(["NATIONAL", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]));
    expect(matrix.sources.every((source) => matrix.evidence_labels.includes(source.evidence))).toBe(true);
  });

  it("keeps the national geography/context lane distinct from market-price coverage", () => {
    const national = matrix.sources.find((source) => source.jurisdiction === "NATIONAL");
    expect(national?.source_id).toBe("abs_asgs_census_context");
    expect(national?.impact).toMatchObject({ price: "none", rent: "none", yield: "none", growth: "none" });
    expect(national?.priority.estimated_addressable_geographies).toBe(0);
  });

  it("carries the complete audit contract for every source without treating unknown as zero", () => {
    expect(matrix.field_contract_version).toBe("national-source-matrix@1");
    const required = [
      "dataset_name", "landing_url", "resource_url", "geography_level", "property_types", "metrics",
      "history", "cadence", "format", "access_method", "authentication", "accessibility", "schema",
      "suppression", "adapter", "warehouse_coverage", "last_refresh", "suburbs_unlocked", "impact", "effort", "risk",
    ];
    for (const source of matrix.sources) {
      for (const field of required) expect(Object.hasOwn(source, field), `${source.source_id}.${field}`).toBe(true);
      expect(source.warehouse_coverage.source_attributed_geography_count, source.source_id).toBeNull();
      expect(source.suburbs_unlocked.warning, source.source_id).toMatch(/not published coverage/);
    }
  });

  it("allows live acquisition only for verified reusable sources with HTTPS allowlists", () => {
    for (const source of matrix.sources.filter((item) => item.acquisition.mode === "live_public")) {
      expect(source.licence.status, source.source_id).toBe("verified_reusable");
      expect(source.acquisition.url, source.source_id).toMatch(/^https:\/\//);
      expect(source.acquisition.allowed_hosts.length, source.source_id).toBeGreaterThan(0);
    }
  });

  it("records the WA candidate as context-only with zero median-price gain", () => {
    const wa = matrix.sources.find((source) => source.source_id === "wa_property_sales");
    expect(wa?.metric_family).toBe("weekly_sales_context");
    expect(wa?.priority.estimated_addressable_geographies).toBe(0);
    expect(wa?.blockers.join(" ")).toMatch(/cannot improve median-price coverage/);
  });

  it("reconciles the existing NSW rent pipeline instead of claiming a new adapter", () => {
    const nsw = matrix.sources.find((source) => source.source_id === "nsw_dcj_rent_and_sales_report");
    expect(nsw?.disposition).toBe("existing_pipeline_registry_reconciled");
    expect(nsw?.acquisition.mode).toBe("existing_pipeline");
  });

  it("rebuilds idempotently from the same committed evidence", () => {
    const once = enrichMatrix(matrix, registry, coverage);
    const twice = enrichMatrix(once, registry, coverage);
    expect(twice).toEqual(once);
  });
});
