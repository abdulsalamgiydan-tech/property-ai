import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const scriptPath = path.join(__dirname, "refresh_engine_v3.mjs");
const src = fs.readFileSync(scriptPath, "utf8");

describe("refresh_engine_v3 — safety pattern (static checks, matching v2's convention)", () => {
  it("refuses --target=production and any production connection string before doing anything else", () => {
    expect(src).toMatch(/oshquaxsloolqucwvigc/);
    expect(src).toMatch(/argVal\("target"\) === "production"/);
  });

  it("--branch-load requires --execute", () => {
    expect(src).toMatch(/branchLoad && !isExecute.*fail/);
  });

  it("defaults to dry-run when no mode flag is given", () => {
    expect(src).toMatch(/isDryRun = has\("dry-run"\) \|\| \(!isExecute && !isPlan && !isStatus && !isValidate\)/);
  });

  it("integrates the WS9 quality gate and treats a blocking failure as promotion_blocked, not succeeded", () => {
    expect(src).toMatch(/run_quality_check\.mjs/);
    expect(src).toMatch(/promotion_blocked/);
  });

  it("updates freshness only after a successful promotion, never unconditionally", () => {
    expect(src).toMatch(/check_freshness\.mjs/);
    expect(src).toMatch(/if \(runResult\.status === "promoted"\)/);
  });

  it("exits non-zero when a run is promotion_blocked or failed", () => {
    expect(src).toMatch(/if \(runResult\.status === "promotion_blocked" \|\| runResult\.status === "failed"\) process\.exit\(1\)/);
  });
});

describe("refresh_engine_v3 — live process behaviour", () => {
  it("--plan prints a plan and exits 0 without writing a run-state file or touching the database", () => {
    const runDir = path.join(repoRoot, "warehouse", "data", "local", "refresh_runs");
    const statePath = path.join(runDir, "v3_last_run.json");
    const before = fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf8") : null;
    const result = spawnSync("node", [scriptPath, "--plan"], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/mode=plan/);
    const after = fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf8") : null;
    expect(after).toBe(before); // --plan must never write/modify the v3 run-state file
  });

  it("--domain filters the plan to only that category", () => {
    const result = spawnSync("node", [scriptPath, "--plan", "--domain=lineage"], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/metric_lineage_registry/);
    expect(result.stdout).not.toMatch(/nsw_sales_pilot/);
  });

  it("--affected-by traverses the dependency graph against the REAL registry (not just the unit-test fixture)", () => {
    const result = spawnSync("node", [scriptPath, "--plan", "--affected-by=rba_interest_rates"], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/nsw_market_intelligence_snapshot/);
    expect(result.stdout).not.toMatch(/nsw_sales_pilot\]/); // sales doesn't depend on interest rates
  });

  it("--status reports 'no run recorded' cleanly when nothing has run yet, rather than crashing", () => {
    const runDir = path.join(repoRoot, "warehouse", "data", "local", "refresh_runs");
    const statePath = path.join(runDir, "v3_last_run.json");
    if (fs.existsSync(statePath)) return; // a real run already happened this session -- skip rather than delete real state
    const result = spawnSync("node", [scriptPath, "--status"], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/No refresh_engine_v3 run has been recorded/);
  });
});
