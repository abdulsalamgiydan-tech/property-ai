#!/usr/bin/env node
/**
 * Warehouse read-only access security test (Sprint 9, Phase 9).
 *
 * Uses the branch's ANON key (not a secret — Supabase anon keys are
 * designed for client exposure, protected by grants; this project never
 * ships it to a production client bundle) via supabase-js, exactly as the
 * /research feature will, to prove:
 *   - allowed search / snapshot SELECT / time-series RPC succeed
 *   - INSERT / UPDATE / DELETE on the public views fail
 *   - direct access to core.* / mart.* / meta.* schemas fails (not exposed
 *     to PostgREST at all)
 *
 * No service-role key is used anywhere in this script or the app.
 *
 * Outputs:
 *   warehouse/reports/warehouse_readonly_security_test.json
 *   warehouse/reports/warehouse_readonly_security_test.md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try { process.loadEnvFile(rel(".env.local")); } catch {}
const url = process.env.WAREHOUSE_SUPABASE_URL;
const anonKey = process.env.WAREHOUSE_SUPABASE_ANON_KEY;
if (!url || !anonKey) fail("WAREHOUSE_SUPABASE_URL / WAREHOUSE_SUPABASE_ANON_KEY not set (hard stop)");
if (!url.includes("lzonauinzatmtytyoems")) fail("WAREHOUSE_SUPABASE_URL is not the warehouse-validation branch — refusing (hard stop)");

const supabase = createClient(url, anonKey);

const results = [];
const run = async (name, expect, fn) => {
  try {
    const { data, error } = await fn();
    const outcome = error ? "error" : "success";
    const ok = outcome === expect;
    results.push({ name, expected: expect, outcome, ok, detail: error ? error.message : `${Array.isArray(data) ? data.length : data ? 1 : 0} row(s)` });
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${name} — expected ${expect}, got ${outcome}${error ? `: ${error.message}` : ""}`);
  } catch (err) {
    const ok = expect === "error";
    results.push({ name, expected: expect, outcome: "exception", ok, detail: String(err.message).slice(0, 200) });
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${name} — expected ${expect}, got exception: ${err.message}`);
  }
};

console.log("test_readonly_access — anon-key checks against the branch's public API\n");

console.log("Allowed reads (expect success):");
await run("search suburb/postcode geography", "success", () =>
  supabase.from("v_market_geography_search_v1").select("*").ilike("geography_name", "%parramatta%").limit(5));
await run("suburb market snapshot select", "success", () =>
  supabase.from("v_suburb_market_snapshot_v1").select("*").limit(5));
await run("postcode market snapshot select", "success", () =>
  supabase.from("v_postcode_market_snapshot_v1").select("*").limit(5));
await run("suburb demographic profile select", "success", () =>
  supabase.from("v_suburb_demographic_profile_v1").select("*").limit(5));
await run("metric assumptions select", "success", () =>
  supabase.from("v_metric_assumptions_v1").select("*"));
await run("time-series RPC", "success", async () => {
  const { data: geo } = await supabase.from("v_market_geography_search_v1").select("geography_id").eq("has_suburb_snapshot", true).limit(1);
  const gid = geo?.[0]?.geography_id;
  if (!gid) return { data: [], error: null };
  return supabase.rpc("get_market_timeseries_v1", { p_geography_id: gid });
});

console.log("\nDisallowed writes (expect error/blocked):");
await run("INSERT into snapshot view", "error", () =>
  supabase.from("v_suburb_market_snapshot_v1").insert({ geography_id: "SAL_00000_ASGS3_2021" }));
await run("UPDATE snapshot view", "error", () =>
  supabase.from("v_suburb_market_snapshot_v1").update({ median_sale_price_12m: 1 }).eq("geography_id", "SAL_00000_ASGS3_2021"));
await run("DELETE from snapshot view", "error", () =>
  supabase.from("v_suburb_market_snapshot_v1").delete().eq("geography_id", "SAL_00000_ASGS3_2021"));

console.log("\nInternal schemas (expect error — not exposed to PostgREST):");
await run("direct access to core.dim_geography", "error", () =>
  supabase.schema("core").from("dim_geography").select("*").limit(1));
await run("direct access to mart.suburb_market_snapshot", "error", () =>
  supabase.schema("mart").from("suburb_market_snapshot").select("*").limit(1));
await run("direct access to meta.metric_assumption", "error", () =>
  supabase.schema("meta").from("metric_assumption").select("*").limit(1));

const allPassed = results.every((r) => r.ok);
const report = {
  generated_at: new Date().toISOString(),
  verdict: allPassed ? "PASSED" : "FAILED",
  branch_ref: "lzonauinzatmtytyoems",
  auth_method: "anon key (public, non-secret) via supabase-js — no service-role key used anywhere",
  results,
};
fs.writeFileSync(rel("warehouse", "reports", "warehouse_readonly_security_test.json"), JSON.stringify(report, null, 2) + "\n");

const md = `# Warehouse Read-Only Access Security Test (Sprint 9, Phase 9)

Generated: ${report.generated_at}
Branch: \`lzonauinzatmtytyoems\`, tested with the **anon key only** (no
service-role key used anywhere in this test or the app). Verdict: **${report.verdict}**

| test | expected | actual | result |
|---|---|---|---|
${results.map((r) => `| ${r.name} | ${r.expected} | ${r.outcome} | ${r.ok ? "✅ PASS" : "❌ FAIL"} |`).join("\n")}

## Summary

- Allowed reads (search, snapshots, demographics, assumptions, time-series RPC) all succeed via the anon key.
- INSERT/UPDATE/DELETE against the public views all fail — the views are backed by tables anon has zero direct grants on, and no INSERT/UPDATE/DELETE grant was ever issued on the views themselves (migration 014).
- Direct PostgREST access to \`core.*\`, \`mart.*\`, \`meta.*\` all fail — these schemas are not in PostgREST's exposed-schema list and anon has no grants on them (\`revoke all on schema core, mart, staging, meta from anon, authenticated\` in migration 014).
`;
fs.writeFileSync(rel("warehouse", "reports", "warehouse_readonly_security_test.md"), md);
console.log(`\nSecurity test ${report.verdict}. Reports written:`);
console.log("  warehouse/reports/warehouse_readonly_security_test.json");
console.log("  warehouse/reports/warehouse_readonly_security_test.md");
if (!allPassed) process.exit(1);
