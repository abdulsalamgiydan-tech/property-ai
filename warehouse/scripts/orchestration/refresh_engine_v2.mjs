#!/usr/bin/env node
/**
 * National refresh engine v2 (Sprint 11, Workstream 14).
 *
 * Single orchestrator across every dataset in warehouse/config/refresh_registry.mjs
 * (~20 datasets spanning geography, Census, sales, rent, supply, macro and
 * derived snapshots). This script does NOT reimplement any fetch/parse/load
 * logic — it dispatches to the existing, individually-validated build/
 * validate/branch-load scripts already written across Sprints 2-11, in
 * dependency-tier order, with the safety gates a v1 single-jurisdiction
 * runner (run_refresh.mjs) didn't need.
 *
 * Modes (mutually exclusive, dry-run is the default):
 *   --plan          Print the dependency-ordered run plan, execute nothing.
 *   --dry-run       Same as --plan but also validates preconditions (default).
 *   --execute       Actually run build/validate scripts (local only unless
 *                   --branch-load is also given).
 *   --local-only    Explicit synonym for --execute without --branch-load.
 *   --branch-load   After local build+validate succeeds, also run each
 *                   dataset's branch_load_script --execute. Requires
 *                   --execute. Never implies it.
 *
 * Filters:
 *   --jurisdiction=NSW|VIC|QLD|SA|WA|ALL
 *   --dataset=<dataset_id> (repeatable via comma-separated list)
 *   --geography=SAL|POA|SA2|LGA (accepted, informational only — see registry notes)
 *   --changed-only  Skip a dataset whose local_report content hash matches
 *                   the last recorded run (no re-download/re-build needed).
 *
 * Resumability:
 *   --resume=<run-id>  Reload a prior run's state file and continue from
 *                      the first not-yet-succeeded dataset.
 *
 * Safety (checked before ANY database connection is opened):
 *   - A production-looking connection string is refused outright.
 *   - --target=production is refused outright regardless of any other flag.
 *   - Branch loads refuse if the branch is already using >= 90% of the
 *     internal 4,500 MB working ceiling (a coarse but real pre-flight
 *     capacity gate, not a precise per-dataset growth prediction).
 *   - A run lock file prevents two orchestrator runs from executing
 *     concurrently and corrupting each other's state.
 *
 * Usage:
 *   node refresh_engine_v2.mjs --plan
 *   node refresh_engine_v2.mjs --dry-run --jurisdiction=NSW
 *   node refresh_engine_v2.mjs --execute --local-only --dataset=vic_rents
 *   node refresh_engine_v2.mjs --execute --branch-load --changed-only
 *   node refresh_engine_v2.mjs --resume=<run-id>
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { DATASETS } from "../../config/refresh_registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const CAPACITY_CEILING_MB = 4500;
const CAPACITY_WARN_FRACTION = 0.9; // refuse branch-load at >= 90% of the working ceiling

const RUN_DIR = rel("warehouse", "data", "local", "refresh_runs");
const LOCK_PATH = path.join(RUN_DIR, ".lock");
const LAST_HASHES_PATH = path.join(RUN_DIR, "last_known_hashes.json");

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

// ── HARD STOP: production-target rejection, checked before anything else ──
if (argVal("target") === "production" || has("target=production")) {
  fail("--target=production is never supported by this orchestrator (hard stop)");
}
try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL ?? "";
if (DB_URL.includes(PROD_REF)) fail(`connection string references PRODUCTION (${PROD_REF}) — refusing (hard stop)`);

// ── Argument parsing ────────────────────────────────────────────────────
const isPlan = has("plan");
const isDryRun = has("dry-run") || (!has("execute") && !isPlan);
const isExecute = has("execute");
const localOnly = has("local-only") || (isExecute && !has("branch-load"));
const branchLoad = has("branch-load");
if (branchLoad && !isExecute) fail("--branch-load requires --execute (hard stop: refusing to infer execute from branch-load alone)");

const jurisdictionFilter = (argVal("jurisdiction") ?? "ALL").toUpperCase();
const datasetFilter = argVal("dataset")
  ? argVal("dataset")
      .split(",")
      .map((s) => s.trim())
  : null;
const geographyFilter = argVal("geography"); // accepted, informational only — see registry notes
const changedOnly = has("changed-only");
const resumeRunId = argVal("resume");

function selectDatasets() {
  let list = DATASETS.slice().sort((a, b) => a.tier - b.tier);
  if (jurisdictionFilter !== "ALL") {
    list = list.filter((d) => d.jurisdiction === jurisdictionFilter || d.jurisdiction === "ALL");
  }
  if (datasetFilter) {
    list = list.filter((d) => datasetFilter.includes(d.dataset_id));
  }
  return list;
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function loadLastHashes() {
  if (!fs.existsSync(LAST_HASHES_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(LAST_HASHES_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveLastHashes(hashes) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(LAST_HASHES_PATH, JSON.stringify(hashes, null, 2));
}

// ── Run locking ─────────────────────────────────────────────────────────
function acquireLock(runId) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  if (fs.existsSync(LOCK_PATH)) {
    const existing = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
    const ageMs = Date.now() - new Date(existing.acquired_at).getTime();
    // A lock older than 2 hours is treated as stale (a crashed prior run,
    // not a genuinely still-running one) rather than blocking forever.
    if (ageMs < 2 * 60 * 60 * 1000) {
      fail(`another refresh run appears to be in progress (run_id=${existing.run_id}, pid=${existing.pid}, acquired ${existing.acquired_at}) — refusing to start a second run (hard stop). Delete ${LOCK_PATH} manually only if you have confirmed that process is not actually running.`);
    }
    console.log(`  lock file is stale (>2h old, run_id=${existing.run_id}) — treating as a crashed prior run and proceeding`);
  }
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ run_id: runId, pid: process.pid, acquired_at: new Date().toISOString() }, null, 2));
}
function releaseLock() {
  try {
    fs.rmSync(LOCK_PATH, { force: true });
  } catch {}
}
process.on("exit", releaseLock);
process.on("SIGINT", () => {
  releaseLock();
  process.exit(130);
});

// ── Run state persistence (resumability) ───────────────────────────────
function runStatePath(runId) {
  return path.join(RUN_DIR, `${runId}.json`);
}
function saveRunState(state) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(runStatePath(state.run_id), JSON.stringify(state, null, 2));
}

let runId;
let state;
if (resumeRunId) {
  const p = runStatePath(resumeRunId);
  if (!fs.existsSync(p)) fail(`no run state found for --resume=${resumeRunId} (looked in ${p})`);
  state = JSON.parse(fs.readFileSync(p, "utf8"));
  runId = state.run_id;
  console.log(`Resuming run ${runId} — ${state.datasets.filter((d) => d.status === "succeeded").length}/${state.datasets.length} datasets already succeeded`);
} else {
  runId = crypto.randomUUID();
  state = {
    run_id: runId,
    started_at: new Date().toISOString(),
    mode: isPlan ? "plan" : isDryRun ? "dry-run" : branchLoad ? "branch-load" : "local-only",
    jurisdiction_filter: jurisdictionFilter,
    dataset_filter: datasetFilter,
    geography_filter: geographyFilter,
    changed_only: changedOnly,
    datasets: selectDatasets().map((d) => ({ dataset_id: d.dataset_id, status: "pending" })),
  };
}

console.log(
  `refresh_engine_v2 — run_id=${runId} mode=${state.mode} target=${branchLoad ? "branch" : "local"} jurisdiction=${jurisdictionFilter}` +
    (datasetFilter ? ` datasets=${datasetFilter.join(",")}` : "") +
    (geographyFilter ? ` geography=${geographyFilter} (informational only)` : "") +
    (changedOnly ? " changed-only=true" : "")
);

if (!isPlan) acquireLock(runId);

const registryById = new Map(DATASETS.map((d) => [d.dataset_id, d]));
const lastHashes = loadLastHashes();
const newHashes = { ...lastHashes };

// ── Capacity pre-flight (only relevant for --branch-load) ──────────────
async function checkCapacity() {
  if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set — required for --branch-load (hard stop)");
  if (!DB_URL.includes(BRANCH_REF)) fail(`connection string does not reference the validation branch (${BRANCH_REF}) — refusing (hard stop)`);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query("select pg_database_size(current_database())::bigint as bytes");
  await client.end();
  const usedMb = Number(rows[0].bytes) / 1024 / 1024;
  const fraction = usedMb / CAPACITY_CEILING_MB;
  console.log(`  capacity pre-flight: branch is using ${usedMb.toFixed(0)} MB of the ${CAPACITY_CEILING_MB} MB working ceiling (${(fraction * 100).toFixed(1)}%)`);
  if (fraction >= CAPACITY_WARN_FRACTION) {
    fail(`branch capacity is at ${(fraction * 100).toFixed(1)}% of the ${CAPACITY_CEILING_MB} MB working ceiling — refusing further branch writes until capacity is reviewed (hard stop)`);
  }
  return usedMb;
}

let sizeBeforeMb = null;
if (branchLoad && !isPlan) {
  sizeBeforeMb = await checkCapacity();
}

// ── Main dispatch loop ───────────────────────────────────────────────────
for (const entry of state.datasets) {
  const d = registryById.get(entry.dataset_id);
  if (!d) {
    entry.status = "failed";
    entry.error = "dataset not found in registry (registry may have changed since this run started)";
    continue;
  }
  if (entry.status === "succeeded") {
    console.log(`  [${d.dataset_id}] already succeeded in this run — skipping (resume)`);
    continue;
  }

  if (isPlan || isDryRun) {
    const scripts = [d.build_script, d.validate_script, branchLoad ? d.branch_load_script : null].filter(Boolean);
    console.log(`  [${d.dataset_id}] (tier ${d.tier}, ${d.jurisdiction}) plan: ${scripts.length ? scripts.join(" -> ") : "no local build step (pure in-database SQL)"}`);
    entry.status = "planned";
    continue;
  }

  if (changedOnly && d.local_report) {
    const currentHash = hashFile(rel(d.local_report));
    if (currentHash && lastHashes[d.dataset_id] === currentHash) {
      console.log(`  [${d.dataset_id}] unchanged since last recorded run (local_report hash matches) — skipping`);
      entry.status = "skipped_unchanged";
      continue;
    }
  }

  try {
    if (d.build_script) {
      console.log(`  [${d.dataset_id}] running build: ${d.build_script}`);
      execFileSync("node", [rel(d.build_script)], { stdio: "inherit" });
    }
    if (d.validate_script) {
      console.log(`  [${d.dataset_id}] running validate: ${d.validate_script}`);
      execFileSync("node", [rel(d.validate_script)], { stdio: "inherit" });
    }
    if (d.local_report) {
      const h = hashFile(rel(d.local_report));
      if (h) newHashes[d.dataset_id] = h;
    }

    if (branchLoad) {
      if (!d.branch_load_script) {
        console.log(`  [${d.dataset_id}] no branch_load_script registered — local-only by design (see registry notes), skipping branch phase`);
      } else {
        console.log(`  [${d.dataset_id}] running branch load: ${d.branch_load_script} --execute`);
        execFileSync("node", [rel(d.branch_load_script), "--execute"], { stdio: "inherit" });
      }
    }

    entry.status = "succeeded";
    entry.completed_at = new Date().toISOString();
    console.log(`  [${d.dataset_id}] succeeded.`);
  } catch (err) {
    entry.status = "failed";
    entry.error = String(err.message).slice(0, 2000);
    console.error(`  [${d.dataset_id}] FAILED: ${entry.error}`);
    // Isolated failure — continue to the next dataset. One dataset's
    // failure never blocks or corrupts another's run (matches v1's
    // isolation guarantee). Datasets that DEPEND on this one (per
    // depends_on) will very likely fail their own validation too, which
    // is the correct, honest outcome — this engine does not skip
    // dependents preemptively, it lets their own validation gates catch it.
  }
  saveRunState(state);
}

saveRunState(state);
if (Object.keys(newHashes).length > 0) saveLastHashes(newHashes);

let sizeAfterMb = null;
if (branchLoad && !isPlan) {
  try {
    sizeAfterMb = await checkCapacity();
  } catch {
    /* capacity check already logged; don't fail the summary over a re-check */
  }
}

const summary = {
  succeeded: state.datasets.filter((d) => d.status === "succeeded").length,
  failed: state.datasets.filter((d) => d.status === "failed").length,
  skipped_unchanged: state.datasets.filter((d) => d.status === "skipped_unchanged").length,
  planned: state.datasets.filter((d) => d.status === "planned").length,
  total: state.datasets.length,
};
console.log(
  `\nrefresh_engine_v2 run ${runId} complete: ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.skipped_unchanged} unchanged, ${summary.planned} planned (of ${summary.total} selected)` +
    (sizeBeforeMb !== null && sizeAfterMb !== null ? `. Branch size: ${sizeBeforeMb.toFixed(0)} MB -> ${sizeAfterMb.toFixed(0)} MB (delta ${(sizeAfterMb - sizeBeforeMb).toFixed(1)} MB)` : "")
);
console.log(`Run state: ${runStatePath(runId)} (resume with --resume=${runId} if incomplete)`);

if (summary.failed > 0) process.exit(1);
