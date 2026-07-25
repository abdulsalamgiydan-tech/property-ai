import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMetricLineage, knownMetricFamilies } from "./lineage_service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A minimal fake pg client — this tests the service's own logic (column
// selection, jurisdiction resolution, national-rule fallback), not a live
// database. Live correctness is exercised by running
// validate_metric_lineage_completeness.mjs against the real branch, which
// this test suite cannot do in CI (no DB credentials there by design).
function makeFakeClient(responses) {
  return {
    query: async (sql) => {
      const key = sql.includes("from mart.") ? "martRow" : sql.includes("r.jurisdiction_code is not distinct from $3") ? "jurisdictionSpecific" : "national";
      return { rows: responses[key] ?? [] };
    },
  };
}

describe("getMetricLineage", () => {
  it("throws on an unknown metric family rather than silently returning nothing", async () => {
    const client = makeFakeClient({});
    await expect(getMetricLineage(client, "suburb_market_snapshot", "SAL_1_ASGS3_2021", "not_a_real_metric")).rejects.toThrow(/unknown metric family/);
  });

  it("returns found:false when the geography has no snapshot row", async () => {
    const client = makeFakeClient({ martRow: [] });
    const result = await getMetricLineage(client, "suburb_market_snapshot", "SAL_999999_ASGS3_2021", "sales");
    expect(result.found).toBe(false);
  });

  it("resolves jurisdiction from state_code and attaches the matching registry entry", async () => {
    const client = makeFakeClient({
      martRow: [{ state_code: "1", sales_volume_12m: 120, median_sale_price_12m: "950000", annual_price_change_pct: "3.2", sales_sample_confidence: "high", latest_sales_period: "2025-01-01", metric_provenance: {}, source_periods: {}, confidence_label: "high", data_quality_status: "passed" }],
      jurisdictionSpecific: [{ is_derived: false, transformation_method: "direct_load", correspondence_version: null, source_id: "nsw_vg_sales", source_name: "NSW VG Property Sales Information", publisher: "NSW Valuer General", source_url: null, licence: null, dataset_id: "nsw_psi_2001_current_full_state", dataset_name: "NSW VG PSI — full state, 2001-current", contributing_dataset_ids: [], notes: null }],
    });
    const result = await getMetricLineage(client, "suburb_market_snapshot", "SAL_12345_ASGS3_2021", "sales");
    expect(result.found).toBe(true);
    expect(result.jurisdiction).toBe("NSW");
    expect(result.lineageComplete).toBe(true);
    expect(result.methodology.datasetId).toBe("nsw_psi_2001_current_full_state");
    expect(result.values.sales_volume_12m).toBe(120);
  });

  it("falls back to the national (NULL-jurisdiction) rule when no jurisdiction-specific rule exists", async () => {
    const client = makeFakeClient({
      martRow: [{ state_code: "3", population_growth_2016_2021_pct: "8.4", metric_provenance: {}, source_periods: {}, confidence_label: "medium", data_quality_status: "passed" }],
      jurisdictionSpecific: [],
      national: [{ is_derived: true, transformation_method: "cross_census_boundary_reconciliation", correspondence_version: "ABS_2016_to_ASGS3_2021", source_id: "abs_census", source_name: "Australian Census", publisher: "ABS", source_url: null, licence: null, dataset_id: "abs_correspondence_2016_2021", dataset_name: "ABS official 2016-to-2021 geographic correspondence", contributing_dataset_ids: [], notes: null }],
    });
    const result = await getMetricLineage(client, "suburb_market_snapshot", "SAL_54321_ASGS3_2021", "population_growth");
    expect(result.jurisdiction).toBe("QLD");
    expect(result.lineageComplete).toBe(true);
    expect(result.methodology.isDerived).toBe(true);
    expect(result.methodology.correspondenceVersion).toBe("ABS_2016_to_ASGS3_2021");
  });

  it("reports lineageComplete:false honestly when no registry entry matches (never fabricates one)", async () => {
    const client = makeFakeClient({
      martRow: [{ state_code: "6", median_weekly_rent_latest: 420, annual_rent_change_pct: "2.1", rent_confidence: "medium", latest_rent_period: "2025-10-01", metric_provenance: {}, source_periods: {}, confidence_label: "medium", data_quality_status: "passed" }],
      jurisdictionSpecific: [],
      national: [],
    });
    const result = await getMetricLineage(client, "suburb_market_snapshot", "SAL_11111_ASGS3_2021", "rent");
    expect(result.lineageComplete).toBe(false);
    expect(result.methodology).toBeNull();
  });

  it("exposes all 8 metric families used across the wide snapshot marts", () => {
    const families = knownMetricFamilies();
    expect(families).toEqual(
      expect.arrayContaining(["sales", "rent", "yield", "approvals", "dwelling_stock", "demographics", "population_growth", "affordability"])
    );
  });
});

describe("lineage scripts — safety pattern", () => {
  it("build_metric_lineage_registry defaults to dry-run and refuses production", () => {
    const src = fs.readFileSync(path.join(__dirname, "build_metric_lineage_registry.mjs"), "utf8");
    expect(src).toMatch(/oshquaxsloolqucwvigc/);
    expect(src).toMatch(/EXECUTE = process\.argv\.includes\("--execute"\)/);
  });

  it("validate_metric_lineage_completeness is read-only and exits non-zero on a mandatory gap", () => {
    const src = fs.readFileSync(path.join(__dirname, "validate_metric_lineage_completeness.mjs"), "utf8");
    expect(src).not.toMatch(/\binsert into\b/i);
    expect(src).not.toMatch(/\bupdate\s+\w+\.\w+\s+set\b/i);
    expect(src).toMatch(/process\.exit\(1\)/);
  });

  it("every registry row referencing a dataset/source/jurisdiction is validated against meta tables before any write", () => {
    const src = fs.readFileSync(path.join(__dirname, "build_metric_lineage_registry.mjs"), "utf8");
    expect(src).toMatch(/unknown dataset_id/);
    expect(src).toMatch(/unknown source_id/);
    expect(src).toMatch(/unknown jurisdiction_code/);
  });
});
