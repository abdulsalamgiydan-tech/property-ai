import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests for the real orchestrator script (Sprint 11 WS14),
// exercised as it actually runs (subprocess, real CLI parsing, real lock
// file), not a mocked reimplementation. Every invocation below uses
// --dataset=__nonexistent_test_id__ where it needs --execute, which makes
// selectDatasets() return an empty list (no real build/validate/branch-load
// script is ever spawned) — this proves the safety-gate and orchestration
// logic without downloading anything or touching the database.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const scriptPath = path.join(__dirname, "refresh_engine_v2.mjs");
const runDir = path.join(repoRoot, "warehouse", "data", "local", "refresh_runs");
const lockPath = path.join(runDir, ".lock");

const NONEXISTENT_DATASET = "__nonexistent_test_id__";

function run(argsStr: string, envOverrides: Record<string, string> = {}) {
  const result = spawnSync("node", [scriptPath, ...argsStr.split(" ").filter(Boolean)], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, ...envOverrides },
  });
  return result;
}

function extractRunId(stdout: string): string | null {
  const m = stdout.match(/run_id=([0-9a-f-]{36})/);
  return m ? m[1] : null;
}

const createdRunStateFiles: string[] = [];

afterEach(() => {
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    /* ignore */
  }
  for (const runId of createdRunStateFiles.splice(0)) {
    try {
      fs.rmSync(path.join(runDir, `${runId}.json`), { force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("refresh_engine_v2 — production rejection (hard stop, checked before any DB connection)", () => {
  it("refuses --target=production outright", () => {
    const r = run("--plan --target=production");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("never supported");
  });

  it("refuses a connection string that references the production ref", () => {
    const r = run("--execute --local-only --dataset=" + NONEXISTENT_DATASET, {
      WAREHOUSE_VALIDATION_DB_URL: "postgresql://postgres.oshquaxsloolqucwvigc:pw@aws-1-region.pooler.supabase.com:5432/postgres",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("PRODUCTION");
  });

  it("refuses --branch-load with no connection string configured at all", () => {
    const r = run("--execute --branch-load --dataset=" + NONEXISTENT_DATASET, { WAREHOUSE_VALIDATION_DB_URL: "" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("WAREHOUSE_VALIDATION_DB_URL not set");
  });

  it("refuses --branch-load with a connection string that isn't the validation branch", () => {
    const r = run("--execute --branch-load --dataset=" + NONEXISTENT_DATASET, {
      WAREHOUSE_VALIDATION_DB_URL: "postgresql://postgres.someotherref:pw@aws-1-region.pooler.supabase.com:5432/postgres",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("does not reference the validation branch");
  });
});

describe("refresh_engine_v2 — argument validation", () => {
  it("refuses --branch-load without --execute", () => {
    const r = run("--branch-load --dataset=" + NONEXISTENT_DATASET);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--branch-load requires --execute");
  });

  it("--plan prints a dependency-ordered plan and creates no lock file", () => {
    const r = run("--plan");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("mode=plan");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("--dry-run is the default mode when neither --plan nor --execute is given", () => {
    const r = run("--dataset=" + NONEXISTENT_DATASET);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("mode=dry-run");
  });
});

describe("refresh_engine_v2 — run locking", () => {
  it("refuses to start a second run while a fresh lock is held", () => {
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ run_id: "fake-lock-test", pid: 999999, acquired_at: new Date().toISOString() }, null, 2)
    );
    const r = run("--execute --local-only --dataset=" + NONEXISTENT_DATASET);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("another refresh run appears to be in progress");
    expect(r.stderr).toContain("fake-lock-test");
  });

  it("treats a lock older than 2 hours as stale and proceeds", () => {
    fs.mkdirSync(runDir, { recursive: true });
    const staleTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(lockPath, JSON.stringify({ run_id: "stale-lock-test", pid: 999999, acquired_at: staleTime }, null, 2));
    const r = run("--execute --local-only --dataset=" + NONEXISTENT_DATASET);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("lock file is stale");
    const runId = extractRunId(r.stdout);
    if (runId) createdRunStateFiles.push(runId);
    // The lock is released again on process exit — proves the run actually
    // completed cleanly rather than crashing mid-way with the lock held.
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});

describe("refresh_engine_v2 — resumability", () => {
  it("fails clearly when --resume references a run id with no saved state", () => {
    const r = run("--resume=00000000-0000-0000-0000-000000000000");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no run state found");
  });

  it("an empty-selection run completes with 0/0 datasets and can be resumed", () => {
    const first = run("--execute --local-only --dataset=" + NONEXISTENT_DATASET);
    expect(first.status).toBe(0);
    const runId = extractRunId(first.stdout);
    expect(runId).not.toBeNull();
    if (runId) createdRunStateFiles.push(runId);

    const resumed = run(`--resume=${runId}`);
    expect(resumed.status).toBe(0);
    expect(resumed.stdout).toContain(`Resuming run ${runId}`);
    expect(resumed.stdout).toContain("0/0 datasets already succeeded");
  });
});

describe("refresh_engine_v2 — dataset selection with no matches", () => {
  it("a dataset filter matching nothing produces a 0-total summary, not a crash", () => {
    const r = run("--execute --local-only --dataset=" + NONEXISTENT_DATASET);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("0 succeeded, 0 failed, 0 unchanged, 0 planned (of 0 selected)");
    const runId = extractRunId(r.stdout);
    if (runId) createdRunStateFiles.push(runId);
  });
});
