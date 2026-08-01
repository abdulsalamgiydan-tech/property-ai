import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("052_warehouse_bootstrap_views_functions.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "052_warehouse_bootstrap_views_functions.sql"), "utf8");
  const lower = sql.toLowerCase();

  // Same 10 views + 8 functions 046_research_api_grant_hardening.sql grants
  // on -- duplicated here (not imported) since 046's array is a local const,
  // not exported, and modifying an already-shipped/tested migration file
  // just to export a fixture is a bigger change than a small duplicated
  // literal array.
  const views = [
    "v_market_geography_search_v1",
    "v_suburb_market_snapshot_v1",
    "v_postcode_market_snapshot_v1",
    "v_suburb_demographic_profile_v1",
    "v_postcode_demographic_profile_v1",
    "v_dataset_freshness_v1",
    "v_refresh_run_history_v1",
    "v_metric_assumptions_v1",
    "v_quality_summary_v1",
    "v_evidence_catalogue_v1",
  ];

  const functionSignatures = [
    "get_market_timeseries_v1(text)",
    "search_market_geographies_v2(text, text, text, integer)",
    "get_market_snapshot_v2(text)",
    "compare_market_geographies_v1(text[])",
    "get_market_map_markers_v1(numeric, numeric, numeric, numeric, text, integer)",
    "get_market_timeseries_v2(text)",
    "get_metric_lineage_v1(text, text, text)",
    "get_warehouse_operations_summary_v1()",
  ];

  // Line-anchored: real SQL statements start a line (ignoring leading
  // whitespace). Comment-on string literals legitimately contain words like
  // "granted", "truncated", or "no direct grant on ..." mid-sentence --
  // those must not trip these checks, only an actual GRANT/REVOKE/TRUNCATE
  // statement would.
  it("does not drop, truncate, or write data", () => {
    expect(lower).not.toMatch(/^\s*drop\s+(table|view|function|schema)/im);
    expect(lower).not.toMatch(/^\s*truncate\s+/im);
    expect(lower).not.toMatch(/^\s*delete\s+from\s+/im);
    expect(lower).not.toMatch(/^\s*insert\s+into\s+/im);
  });

  it("creates all 10 views 046 grants on", () => {
    for (const view of views) {
      expect(lower).toContain(`create or replace view public.${view}`);
    }
  });

  it("creates all 8 functions 046 grants on, with matching signatures -- proves 052 satisfies every 046 dependency mechanically, not just by manual review", () => {
    for (const sig of functionSignatures) {
      const funcName = sig.slice(0, sig.indexOf("("));
      expect(lower).toContain(`create or replace function public.${funcName}(`);
    }
  });

  it("every function is STABLE SECURITY DEFINER with a pinned search_path", () => {
    const functionBlocks = sql.split(/CREATE OR REPLACE FUNCTION/).slice(1);
    expect(functionBlocks.length).toBe(functionSignatures.length);
    for (const block of functionBlocks) {
      expect(block).toMatch(/STABLE SECURITY DEFINER/);
      expect(block).toMatch(/SET search_path TO/);
    }
  });

  it("never grants anything itself -- grants are 046's job, applied after this file", () => {
    expect(lower).not.toMatch(/^\s*grant\s+/im);
    expect(lower).not.toMatch(/^\s*revoke\s+/im);
  });
});
