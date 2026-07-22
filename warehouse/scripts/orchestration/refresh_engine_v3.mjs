#!/usr/bin/env node
/**
 * National refresh engine v3 (Sprint 12, Workstream 10).
 *
 * Builds on refresh_engine_v2.mjs (Sprint 11 WS14) rather than replacing
 * it — v2's dry-run-default, production-hard-refusal, run-locking, and
 * resumable-checkpoint logic is already real, already tested (12 passing
 * tests), and is reused here unmodified in spirit. v3 adds exactly what
 * WS9 and this workstream's own investigation found genuinely missing:
 *
 *   1. A blocking QUALITY GATE after branch-load: runs WS9's
 *      run_quality_check.mjs --execute. Any BLOCKING rule failure marks
 *      the run "promotion_blocked" (not "succeeded") and exits non-zero —
 *      "no continuation after a material blocking quality failure."
 *   2. A FRESHNESS UPDATE at the end of a successful run: calls Sprint 10's
 *      check_freshness.mjs --execute. WS9 found all 7 tracked datasets
 *      stuck at 'manual_review' specifically because nothing had ever run
 *      through a tracked orchestrator execution — this closes that gap.
 *   3. Dependency-aware `--affected-by=<dataset_id>` selection (via
 *      refresh_lib.affectedDatasets): a geography change invalidates every
 *      dependent geography-derived mart transitively; a rate change
 *      rebuilds only affordability outputs; a rent change rebuilds
 *      rent/yield outputs but not unrelated supply facts. Uses the
 *      registry's existing depends_on graph, which v2 stored but never
 *      traversed.
 *   4. `--domain=<category>` filtering (maps onto the registry's existing
 *      `category` field — no schema change needed).
 *   5. `--stale` selection: queries meta.dataset_freshness_status for
 *      datasets currently stale/critical/manual_review.
 *   6. Bounded retry with exponential backoff around each script
 *      execution (v2 had none — a single transient network blip failed
 *      the whole dataset).
 *
 * Deliberately NOT duplicated from v2: build/validate/branch-load script
 * dispatch, per-dataset isolated failure handling, lock-file protection,
 * resumable run-state persistence, capacity pre-flight. Those are proven
 * and green — the safest option is to keep using v2 for pure local/
 * branch-load execution and layer the new WS9/WS10 behaviour AROUND it,
 * not fork it.
 *
 * Usage:
 *   node refresh_engine_v3.mjs --plan
 *   node refresh_engine_v3.mjs --dry-run --domain=rent
 *   node refresh_engine_v3.mjs --execute --branch-load --dataset=qld_rents
 *   node refresh_engine_v3.mjs --execute --branch-load --affected-by=rba_interest_rates
 *   node refresh_engine_v3.mjs --execute --branch-load --stale
 *   node refresh_engine_v3.mjs --status
 *   node refresh_engine_v3.mjs --validate
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { DATASETS } from "../../config/refresh_registry.mjs";
import { affectedDatasets, withRetry, filterByDomain, filterByJurisdiction } from "./refresh_lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const RUN_DIR = rel("warehouse", "data", "local", "refresh_runs");
const V3_STATE_PATH = path.join(RUN_DIR, "v3_last_run.json");

const args = process.argv.slice(2);
const argVal = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : null;
};
const has = (name) => args.includes(`--${name}`);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (argVal("target") === "production") fail("--target=production is never supported by this orchestrator (hard stop)");
try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL ?? "";
if (DB_URL.includes(PROD_REF)) fail(`connection string references PRODUCTION (${PROD_REF}) — refusing (hard stop)`);

const isPlan = has("plan");
const isStatus = has("status");
const isValidate = has("validate");
const isExecute = has("execute");
const isDryRun = has("dry-run") || (!isExecute && !isPlan && !isStatus && !isValidate);
const branchLoad = has("branch-load");
if (branchLoad && !isExecute) fail("--branch-load requires --execute (hard stop)");

const jurisdictionFilter = (argVal("jurisdiction") ?? "ALL").toUpperCase();
const domainFilter = argVal("domain");
const datasetFilter = argVal("dataset") ? argVal("dataset").split(",").map((s) => s.trim()) : null;
const affectedByFilter = argVal("affected-by");
const isStale = has("stale");
const maxRetries = Number(argVal("max-retries") ?? 3);

function ensureRunDir() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
}

// ── --status: print the last recorded v3 run, no execution ──────────────
if (isStatus) {
  if (!fs.existsSync(V3_STATE_PATH)) {
    console.log("No refresh_engine_v3 run has been recorded yet.");
    process.exit(0);
  }
  const last = JSON.parse(fs.readFileSync(V3_STATE_PATH, "utf8"));
  console.log(JSON.stringify(last, null, 2));
  process.exit(0);
}

// ── --validate: dry-run selection + a read-only WS9 quality gate against
// current branch state (distinct from --dry-run: this actually connects
// and checks whether the branch is CURRENTLY in a publishable state,
// without running or changing anything) ─────────────────────────────────
if (isValidate) {
  console.log("refresh_engine_v3 --validate: checking current branch quality state (read-only, no writes)");
  try {
    execFileSync("node", [rel("warehouse", "scripts", "quality", "run_quality_check.mjs")], { stdio: "inherit" });
    console.log("\n--validate PASSED: no blocking quality rule currently fails on the branch.");
  } catch {
    fail("--validate FAILED: at least one blocking quality rule currently fails on the branch — see output above (hard stop)");
  }
  process.exit(0);
}

// ── Dataset selection ─────────────────────────────────────────────────────
async function selectStaleDatasetIds() {
  if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set — required for --stale (hard stop)");
  if (!DB_URL.includes(BRANCH_REF)) fail(`connection string does not reference the validation branch (${BRANCH_REF}) — refusing (hard stop)`);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query("select dataset_id from meta.dataset_freshness_status where freshness_status in ('stale','critical','manual_review')");
  await client.end();
  // meta.dataset_freshness_status uses meta.dataset.dataset_id, a SEPARATE
  // id namespace from this registry's own dataset_id (discovered WS10) --
  // cross-reference via each registry entry's meta_dataset_ids, not a
  // direct id match, or --stale would silently select nothing.
  return new Set(rows.map((r) => r.dataset_id));
}

function registrySelectionIsStale(d, staleMetaIds) {
  if (!d.meta_dataset_ids || d.meta_dataset_ids.length === 0) return false; // not yet stale-trackable -- honest, not a false negative disguised as fresh
  return d.meta_dataset_ids.some((id) => staleMetaIds.has(id));
}

let selected = DATASETS.slice();
let selectionReasons = new Map(DATASETS.map((d) => [d.dataset_id, []]));
const addReason = (id, reason) => selectionReasons.get(id)?.push(reason);

if (affectedByFilter) {
  selected = affectedDatasets(DATASETS, affectedByFilter);
  for (const d of selected) addReason(d.dataset_id, d.dataset_id === affectedByFilter ? "explicitly requested (--affected-by)" : `downstream of changed dataset '${affectedByFilter}'`);
} else {
  for (const d of selected) addReason(d.dataset_id, "in full selection");
}
selected = filterByDomain(selected, domainFilter);
if (domainFilter) for (const d of selected) addReason(d.dataset_id, `matches --domain=${domainFilter}`);
selected = filterByJurisdiction(selected, jurisdictionFilter);
if (jurisdictionFilter !== "ALL") for (const d of selected) addReason(d.dataset_id, `matches --jurisdiction=${jurisdictionFilter}`);
if (datasetFilter) {
  selected = selected.filter((d) => datasetFilter.includes(d.dataset_id));
  for (const d of selected) addReason(d.dataset_id, "explicitly requested (--dataset)");
}
if (isStale) {
  const staleMetaIds = await selectStaleDatasetIds();
  selected = selected.filter((d) => registrySelectionIsStale(d, staleMetaIds));
  for (const d of selected) addReason(d.dataset_id, "currently stale/critical/manual_review (via meta_dataset_ids)");
}
selected.sort((a, b) => a.tier - b.tier);

console.log(`refresh_engine_v3 — mode=${isPlan ? "plan" : isDryRun ? "dry-run" : branchLoad ? "branch-load" : "local-only"} selected=${selected.length} dataset(s)`);
for (const d of selected) {
  console.log(`  [${d.dataset_id}] (tier ${d.tier}, ${d.category}, ${d.jurisdiction}) — ${[...new Set(selectionReasons.get(d.dataset_id))].join("; ")}`);
}

if (isPlan || isDryRun) {
  console.log(`\n${isPlan ? "Plan" : "Dry run"}: would execute ${selected.length} dataset(s) in tier order.`);
  console.log(`Quality rules that would run after branch-load: see meta.data_quality_rule (run 'npm run warehouse:quality:report' for current counts).`);
  console.log(`Human approval required: no (this orchestrator only ever targets the validation branch, never production).`);
  process.exit(0);
}

// ── Execute (delegates the actual dataset-level work to v2, invoked as a
// subprocess with equivalent flags, wrapped in retry + the new WS9/WS10
// gates) ──────────────────────────────────────────────────────────────
ensureRunDir();
const v2Args = ["warehouse/scripts/orchestration/refresh_engine_v2.mjs", "--execute"];
if (branchLoad) v2Args.push("--branch-load");
if (jurisdictionFilter !== "ALL") v2Args.push(`--jurisdiction=${jurisdictionFilter}`);
if (datasetFilter || affectedByFilter || isStale || domainFilter) {
  v2Args.push(`--dataset=${selected.map((d) => d.dataset_id).join(",")}`);
}
if (has("changed-only")) v2Args.push("--changed-only");

const runResult = { started_at: new Date().toISOString(), mode: branchLoad ? "branch-load" : "local-only", selected: selected.map((d) => d.dataset_id) };

try {
  await withRetry(
    () => execFileSync("node", v2Args, { stdio: "inherit", cwd: repoRoot }),
    {
      maxAttempts: maxRetries,
      onRetry: (attempt, delay) => console.log(`  refresh_engine_v2 subprocess failed (attempt ${attempt}) — retrying in ${delay}ms`),
    }
  );
  runResult.v2_status = "succeeded";
} catch (err) {
  runResult.v2_status = "failed";
  runResult.v2_error = String(err.message ?? err).slice(0, 1000);
}

// ── WS9 quality gate: only meaningful after a branch-load attempt ───────
if (branchLoad && runResult.v2_status === "succeeded") {
  console.log("\nrefresh_engine_v3: running the WS9 quality gate before declaring this run promoted...");
  try {
    execFileSync("node", [rel("warehouse", "scripts", "quality", "run_quality_check.mjs"), "--execute"], { stdio: "inherit" });
    runResult.quality_gate = "passed";
    runResult.status = "promoted";
  } catch {
    runResult.quality_gate = "failed";
    runResult.status = "promotion_blocked";
    console.error("\nrefresh_engine_v3: BLOCKING quality rule(s) failed — this run is NOT promoted. The branch data from this run remains committed (matching this project's transaction-level guarantees per dataset), but must be treated as not-yet-valid until the blocking issue is resolved.");
  }

  if (runResult.status === "promoted") {
    console.log("\nrefresh_engine_v3: updating freshness status...");
    try {
      execFileSync("node", [rel("warehouse", "scripts", "orchestration", "check_freshness.mjs"), "--execute"], { stdio: "inherit" });
      runResult.freshness_updated = true;
    } catch (err) {
      runResult.freshness_updated = false;
      runResult.freshness_error = String(err.message ?? err).slice(0, 500);
    }
  }
} else {
  runResult.status = runResult.v2_status === "succeeded" ? "succeeded_local_only" : "failed";
}

runResult.completed_at = new Date().toISOString();
fs.writeFileSync(V3_STATE_PATH, JSON.stringify(runResult, null, 2));
console.log(`\nrefresh_engine_v3 run complete: status=${runResult.status}`);
console.log(`State: ${V3_STATE_PATH}`);

if (runResult.status === "promotion_blocked" || runResult.status === "failed") process.exit(1);
