import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const scriptPath = path.join(__dirname, "refresh_engine_v4.mjs");
const src = fs.readFileSync(scriptPath, "utf8");

describe("refresh_engine_v4 — safety pattern (static checks, matching v2/v3's convention)", () => {
  it("refuses --target=production before doing anything else", () => {
    expect(src).toMatch(/oshquaxsloolqucwvigc/);
    expect(src).toMatch(/argVal\("target"\) === "production"/);
  });

  it("defines no --execute flag or write path of its own — v4 is read-only by design, not just by default", () => {
    // Referencing v3's --execute in help/doc text is fine and expected
    // (v4 always defers execution to a separately-invoked v3); what must
    // NOT exist is this script defining/handling its own execute flag.
    expect(src).not.toMatch(/has\("execute"\)/);
    expect(src).not.toMatch(/\bisExecute\b/);
    // Confirms this script never calls any DDL/write-shaped client method.
    expect(src).not.toMatch(/client\.query\(\s*["'`](insert|update|delete|create|drop|alter)/i);
  });

  it("refuses a connection string that references production", () => {
    expect(src).toMatch(/DB_URL\.includes\(PROD_REF\)/);
  });

  it("only queries meta.dataset_freshness_status and meta.data_quality_run — both read-only selects", () => {
    expect(src).toMatch(/select dataset_id, freshness_status from meta\.dataset_freshness_status/);
    expect(src).toMatch(/from meta\.data_quality_run/);
  });

  it("never recommends running a refresh from within itself — always defers to a separately-invoked v3 --execute", () => {
    expect(src).toMatch(/refresh_engine_v3\.mjs --execute/);
  });
});

describe("refresh_engine_v4 — live process behaviour (DB-independent paths only)", () => {
  // CI (warehouse-validation.yml) does not provision WAREHOUSE_VALIDATION_DB_URL
  // — only the separate, manually-triggered warehouse-manual-refresh.yml
  // workflow does. Matching refresh_engine_v3.test.ts's own convention
  // (which likewise never live-tests --stale), --summary itself is verified
  // manually against the real branch rather than via an automated CI test
  // that would otherwise be flaky/broken in CI. Only the no-DB paths are
  // exercised here.

  it("prints usage and exits 0 without touching the database when no command is given", () => {
    const result = spawnSync("node", [scriptPath], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/--summary/);
  });

  it("fails clearly (not a stack trace) when --summary is requested but WAREHOUSE_VALIDATION_DB_URL is unset", () => {
    const result = spawnSync("node", [scriptPath, "--summary"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, WAREHOUSE_VALIDATION_DB_URL: "" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/WAREHOUSE_VALIDATION_DB_URL not set/);
  });

  it("refuses a production-referencing connection string even for --summary", () => {
    const result = spawnSync("node", [scriptPath, "--summary"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, WAREHOUSE_VALIDATION_DB_URL: "postgresql://user:pass@db.oshquaxsloolqucwvigc.supabase.co:5432/postgres" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/references PRODUCTION/);
  });
});
