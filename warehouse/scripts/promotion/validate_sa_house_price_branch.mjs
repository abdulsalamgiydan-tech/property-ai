#!/usr/bin/env node
/**
 * Guarded SA house-price validation harness (Official Coverage Uplift 1.2).
 *
 * Default: offline dry-run, no database connection.
 * Remote mode: explicit --execute --rollback-validation against an exact,
 * non-Production branch ref. The orchestrator applies no migrations and has no
 * commit/retain/cleanup path: validation always ends in ROLLBACK, followed by a
 * fresh-connection residue check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRollbackValidation, verifyRollbackResidue } from "./atomicRollbackValidation.mjs";
import {
  REQUIRED_MIGRATIONS, SA_HOUSE_PRICE_BATCH, assertExecutionPreconditions,
  sanitise, validateBranchRef,
} from "./saHousePricePromotion.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const rel = (...parts) => path.join(REPO_ROOT, ...parts);
const REPORT_PATH = rel("warehouse", "reports", "sa_metro_house_coverage_uplift.json");
const PAYLOAD_PATH = rel("warehouse", "data", "local", "coverage_uplift", "sa_house_price_payload.json");

const valueArg = (argv, name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const has = (argv, name) => argv.includes(name);
function say(...parts) { console.log(sanitise(parts.join(" "))); }

export function executionIntent(argv = process.argv.slice(2)) {
  const forbidden = ["--commit", "--retain", "--cleanup"].filter((flag) => has(argv, flag));
  return {
    execute: has(argv, "--execute"),
    rollbackValidation: has(argv, "--rollback-validation"),
    branchRef: valueArg(argv, "--branch-ref"),
    forbidden,
  };
}

function loadReport() {
  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error(`coverage report missing: ${path.relative(REPO_ROOT, REPORT_PATH)} — run the uplift runner first`);
  }
  return JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
}

export function dryRun() {
  const report = loadReport();
  const ctx = SA_HOUSE_PRICE_BATCH;
  const coreRows = report.counts.accepted_observations;
  const checks = [
    ["checksum_matches_report", report.acquisition.sha256 === ctx.resourceSha256],
    ["schema_fingerprint_matches_report", report.acquisition.schema_fingerprint === ctx.schemaFingerprint],
    ["reporting_period_matches", report.reporting_period_end === ctx.reportingPeriodEnd],
    ["exact_row_count", coreRows === ctx.rowCap],
    ["classification_split_direct_derived", report.classification.direct > 0 && report.classification.derived > 0],
    ["target_schema_supports_batch", report.target_compatibility?.schema_supports_batch === true],
  ];
  say("SA house-price validation harness — DRY RUN (no database connection)");
  say(`  source=${ctx.sourceId} sha=${ctx.resourceSha256.slice(0, 12)} period=${ctx.reportingPeriodEnd}`);
  say(`  candidate rows=${coreRows} exact-cap=${ctx.rowCap} direct=${report.classification.direct} derived=${report.classification.derived}`);
  say(`  required migrations must already be applied: ${REQUIRED_MIGRATIONS.join(", ")} (this harness applies none)`);
  let ok = true;
  for (const [name, pass] of checks) {
    say(`  [${pass ? "PASS" : "FAIL"}] ${name}`);
    ok = ok && pass;
  }
  say(ok
    ? "DRY RUN OK — no writes. A separately approved run requires --execute --rollback-validation --branch-ref <ref>."
    : "DRY RUN FAILED — refusing.");
  process.exitCode = ok ? 0 : 1;
  return { ok, connectedToDatabase: false, checks: checks.map(([name, pass]) => ({ name, pass })) };
}

function loadPayload() {
  if (!fs.existsSync(PAYLOAD_PATH)) {
    throw new Error(`payload missing: ${path.relative(REPO_ROOT, PAYLOAD_PATH)} — run the uplift runner with --emit-payload first`);
  }
  return JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8"));
}

async function connect(pg, dbUrl) {
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60000,
  });
  await client.connect();
  return client;
}

export async function executeRollbackValidation(argv = process.argv.slice(2)) {
  const intent = executionIntent(argv);
  if (intent.forbidden.length) throw new Error(`forbidden_mode:${intent.forbidden.join(",")}`);
  if (!intent.execute || !intent.rollbackValidation) throw new Error("execute_requires_rollback_validation");

  try { process.loadEnvFile(rel(".env.local")); } catch { /* optional */ }
  const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL;
  const payload = loadPayload();
  const rows = payload.rows ?? [];
  const ctx = SA_HOUSE_PRICE_BATCH;
  const preconditions = assertExecutionPreconditions({
    execute: intent.execute,
    rollbackValidation: intent.rollbackValidation,
    dbUrl,
    branchRef: intent.branchRef,
    prodRef: ctx.prodRef,
    sourceSha: payload.resource_sha256,
    expectedSha: ctx.resourceSha256,
    schemaFingerprint: payload.schema_fingerprint,
    expectedFingerprint: ctx.schemaFingerprint,
    rowCount: rows.length,
    rowCap: ctx.rowCap,
    expectedRowCount: ctx.rowCap,
  });
  if (!preconditions.ok) throw new Error(`preconditions_not_met:${preconditions.errors.join(",")}`);
  const branch = validateBranchRef(dbUrl, { prodRef: ctx.prodRef, branchRef: intent.branchRef });
  if (!branch.ok) throw new Error(branch.reason);

  const { default: pg } = await import("pg");
  let validationClient;
  let result;
  let validationError;
  try {
    validationClient = await connect(pg, dbUrl);
    result = await runRollbackValidation({ db: validationClient, rows, ctx });
  } catch (error) {
    validationError = error;
  } finally {
    await validationClient?.end();
  }

  let residueClient;
  let residue;
  try {
    const beforeSnapshot = result?.beforeSnapshot ?? validationError?.beforeSnapshot;
    if (beforeSnapshot) {
      residueClient = await connect(pg, dbUrl);
      residue = await verifyRollbackResidue({ db: residueClient, rows, beforeSnapshot });
    }
  } finally {
    await residueClient?.end();
  }
  if (validationError) throw validationError;
  if (!residue?.ok) throw new Error("fresh_connection_residue_check_missing");

  say(`ROLLBACK VALIDATION PASSED on approved non-Production ref ${intent.branchRef}`);
  say(`  candidate core=${result.candidate_core_rows} mart=${result.candidate_mart_keys}`);
  say(`  simulated deltas core=${result.actual_core_delta} mart=${result.actual_mart_delta}; replay delta=${result.idempotent_replay_delta}`);
  say(`  RPC rows checked=${result.rpc_rows_checked}; direct-view rules checked=${result.direct_view_rows_checked}`);
  say(`  ROLLBACK verified from a fresh connection: net core=${residue.net_new_core_rows}, net mart=${residue.net_new_mart_rows}`);
  say("  No rows retained; no migration applied; Production refused by exact-ref guard.");
  return { ok: true, result, residue };
}

async function main() {
  const intent = executionIntent();
  if (intent.execute || intent.rollbackValidation || intent.forbidden.length) await executeRollbackValidation();
  else dryRun();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    say(`FAIL CLOSED: ${String(error?.message ?? error).slice(0, 400)}`);
    process.exitCode = 1;
  });
}
