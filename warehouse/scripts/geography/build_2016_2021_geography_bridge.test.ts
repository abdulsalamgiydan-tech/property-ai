import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration test against the REAL build script and REAL ABS
// correspondence files — not a mock. Those files are local-only and
// gitignored (warehouse/data/raw, warehouse/data/processed), so this
// suite skips cleanly in a clean CI clone (which never has them) rather
// than failing — matching this project's "no required local secrets/data
// for ordinary CI" rule. Run locally after the source files are present
// (see CROSS_CENSUS_HARMONISATION_METHOD.md) to exercise it for real.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const scriptPath = path.join(__dirname, "build_2016_2021_geography_bridge.mjs");
const reportPath = path.join(repoRoot, "warehouse", "reports", "geography_bridge_2016_2021_local_build.json");
const correspondenceDir = path.join(repoRoot, "warehouse", "data", "raw", "abs_correspondence", "asgs_2016_to_2021");

const hasLocalData = fs.existsSync(correspondenceDir) && fs.existsSync(path.join(correspondenceDir, "CG_SSC_2016_SAL_2021.csv"));

type ReconciliationSide = {
  reconciled_within_tolerance: boolean;
  reconciliation_pct: number;
  target_geographies_with_converted_value: number;
  source_residual_stats?: { n_over_5pct: number };
};
type LocalBuildReport = {
  documented_tolerance_pct: number;
  sal: ReconciliationSide;
  poa: ReconciliationSide;
  deferred: string;
};

describe.skipIf(!hasLocalData)("build_2016_2021_geography_bridge (local-data integration test)", () => {
  let report: LocalBuildReport;

  beforeAll(() => {
    const result = spawnSync("node", [scriptPath], { cwd: repoRoot, encoding: "utf8", timeout: 120000 });
    expect(result.status, `build script failed: ${result.stderr}`).toBe(0);
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  }, 120000);

  it("reconciles national population within the documented tolerance", () => {
    expect(report.sal.reconciled_within_tolerance).toBe(true);
    expect(report.poa.reconciled_within_tolerance).toBe(true);
    expect(Math.abs(100 - report.sal.reconciliation_pct)).toBeLessThanOrEqual(report.documented_tolerance_pct);
    expect(Math.abs(100 - report.poa.reconciliation_pct)).toBeLessThanOrEqual(report.documented_tolerance_pct);
  });

  it("converts population for approximately every current SAL and POA geography", () => {
    // 15,333/15,334 SAL and 2,641/2,641 POA in the live branch (WS4 report) —
    // allow a small margin since this is independent of any specific branch state.
    expect(report.sal.target_geographies_with_converted_value).toBeGreaterThan(15000);
    expect(report.poa.target_geographies_with_converted_value).toBeGreaterThan(2500);
  });

  it("has near-zero source reconciliation residual (correspondence quality is high)", () => {
    expect(report.sal.source_residual_stats.n_over_5pct).toBe(0);
  });

  it("documents the SA2 deferral rather than silently omitting it", () => {
    expect(report.deferred).toMatch(/SA2/);
  });
});

describe("2016-2021 geography bridge — script presence and safety pattern", () => {
  it("build script exists and is local-only (no DB connection code)", () => {
    const src = fs.readFileSync(scriptPath, "utf8");
    expect(src).not.toMatch(/WAREHOUSE_VALIDATION_DB_URL/);
    expect(src).toMatch(/DuckDBInstance/);
  });

  it("load script exists, defaults to dry-run, and refuses a production connection string", () => {
    const loadScriptPath = path.join(__dirname, "load_2016_2021_geography_bridge_to_branch.mjs");
    const src = fs.readFileSync(loadScriptPath, "utf8");
    expect(src).toMatch(/PROD_REF/);
    expect(src).toMatch(/oshquaxsloolqucwvigc/);
    expect(src).toMatch(/EXECUTE = process\.argv\.includes\("--execute"\)/);
    expect(src).toMatch(/on conflict \(source_geography_id, target_geography_id, correspondence_version\) do nothing/);
  });

  it("validate script exists, is read-only, and checks the lineage-conflation defect specifically", () => {
    const validateScriptPath = path.join(__dirname, "validate_2016_2021_geography_bridge.mjs");
    const src = fs.readFileSync(validateScriptPath, "utf8");
    expect(src).toMatch(/population_growth_method never equals/);
    expect(src).not.toMatch(/\binsert into\b/i);
    expect(src).not.toMatch(/\bupdate\s+\w+\.\w+\s+set\b/i);
  });
});
