#!/usr/bin/env node
/**
 * GUARDED validation harness for the SA metropolitan house-price batch
 * (Official Coverage Uplift 1.1). Executes the VALIDATION_APPROVAL_PACKET later.
 *
 * SAFETY MODEL:
 *   - DRY-RUN by DEFAULT: no database connection at all. Verifies the batch
 *     checksum / schema fingerprint / row cap against the committed report and
 *     prints a sanitised plan, then stops.
 *   - Writing requires BOTH `--execute` AND a non-Production branch ref supplied
 *     via `--branch-ref <ref>`, matched against WAREHOUSE_VALIDATION_DB_URL.
 *   - Refuses if the URL references the Production ref, is missing, or does not
 *     reference the given branch ref. The URL is NEVER printed.
 *   - Applies additive migrations 056/057/058, loads inside ONE transaction with
 *     the exact existing target schema, enforces the row cap, runs post-load /
 *     idempotency / conflict / rollback checks, and supports scoped cleanup.
 *   - `pg` is imported DYNAMICALLY only on --execute, so unit tests (and this
 *     dry-run) need no database driver.
 *   - Prints only sanitised counts and identifiers; never secrets.
 *
 * Usage:
 *   node warehouse/scripts/promotion/validate_sa_house_price_branch.mjs           # dry run
 *   node warehouse/scripts/promotion/validate_sa_house_price_branch.mjs --execute --branch-ref <ref> [--cleanup]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SA_HOUSE_PRICE_BATCH, assertExecutionPreconditions, buildScopedSql,
  expectedMartRowCount, officialObservationValues,
  sanitise, validateBranchRef,
} from "./saHousePricePromotion.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const rel = (...p) => path.join(REPO_ROOT, ...p);
const REPORT_PATH = rel("warehouse", "reports", "sa_metro_house_coverage_uplift.json");
const PAYLOAD_PATH = rel("warehouse", "data", "local", "coverage_uplift", "sa_house_price_payload.json");

const arg = (name) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : undefined; };
const has = (name) => process.argv.includes(name);
function say(...parts) { console.log(sanitise(parts.join(" "))); }

function loadReport() {
  if (!fs.existsSync(REPORT_PATH)) throw new Error(`coverage report missing: ${path.relative(REPO_ROOT, REPORT_PATH)} — run the uplift runner first`);
  return JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
}

function dryRun() {
  const report = loadReport();
  const ctx = SA_HOUSE_PRICE_BATCH;
  const coreRows = report.counts.accepted_observations;
  const checks = [
    ["checksum_matches_report", report.acquisition.sha256 === ctx.resourceSha256],
    ["schema_fingerprint_matches_report", report.acquisition.schema_fingerprint === ctx.schemaFingerprint],
    ["reporting_period_matches", report.reporting_period_end === ctx.reportingPeriodEnd],
    ["within_row_cap", coreRows <= ctx.rowCap],
    ["classification_split_direct_derived", report.classification.direct > 0 && report.classification.derived > 0],
    ["target_schema_supports_batch", report.target_compatibility?.schema_supports_batch === true],
  ];
  say("SA house-price validation harness — DRY RUN (no database connection)");
  say(`  source=${ctx.sourceId} sha=${ctx.resourceSha256.slice(0, 12)} period=${ctx.reportingPeriodEnd}`);
  say(`  core rows=${coreRows} (cap ${ctx.rowCap})  direct=${report.classification.direct} derived=${report.classification.derived}`);
  say(`  target=${report.target_compatibility?.target_table}`);
  say(`  migrations required (additive, not applied): ${ctx.migrations.map((m) => path.basename(m)).join(", ")}`);
  let ok = true;
  for (const [name, pass] of checks) { say(`  [${pass ? "PASS" : "FAIL"}] ${name}`); ok = ok && pass; }
  say(ok ? "\nDRY RUN OK — plan valid. Execution NOT approved; pass --execute --branch-ref <ref> to load a non-Production branch." : "\nDRY RUN FAILED — refusing.");
  process.exitCode = ok ? 0 : 1;
  return { ok, connectedToDatabase: false, checks: checks.map(([name, pass]) => ({ name, pass })) };
}

async function execute() {
  const ctx = SA_HOUSE_PRICE_BATCH;
  const branchRef = arg("--branch-ref");
  try { process.loadEnvFile(rel(".env.local")); } catch { /* optional */ }
  const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL;

  if (!fs.existsSync(PAYLOAD_PATH)) { say(`FAIL CLOSED: payload missing (${path.relative(REPO_ROOT, PAYLOAD_PATH)}) — run the uplift runner with --emit-payload first`); process.exit(1); }
  const payload = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8"));
  const rows = payload.rows ?? [];

  const pre = assertExecutionPreconditions({
    execute: true, dbUrl, branchRef, prodRef: ctx.prodRef,
    sourceSha: payload.resource_sha256, expectedSha: ctx.resourceSha256,
    schemaFingerprint: payload.schema_fingerprint, expectedFingerprint: ctx.schemaFingerprint,
    rowCount: rows.length, rowCap: ctx.rowCap,
  });
  if (!pre.ok) { say(`FAIL CLOSED: preconditions not met: ${pre.errors.join(", ")}`); process.exit(1); }

  const branch = validateBranchRef(dbUrl, { prodRef: ctx.prodRef, branchRef });
  if (!branch.ok) { say(`FAIL CLOSED: ${branch.reason}`); process.exit(1); }

  const { default: pg } = await import("pg");
  const { INSERT_OBSERVATION, INSERT_MART, POSTLOAD_VALIDATIONS } = await import("./officialPromotion.mjs");
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
  await client.connect();
  const n = (r) => Number(Object.values(r.rows[0])[0]);
  const sql = buildScopedSql();
  const checks = [];
  try {
    const who = (await client.query("select current_database() db, current_user usr")).rows[0];
    say(`EXECUTE on branch ref ${branchRef} (production ref refused in code) db=${who.db} user=${who.usr}`);

    for (const m of ctx.migrations) await client.query(fs.readFileSync(rel(m), "utf8"));

    if (has("--cleanup")) {
      await client.query("begin");
      await client.query(sql.cleanupMart, [ctx.sourceId, ctx.resourceSha256]);
      await client.query(sql.cleanupCore, [ctx.sourceId, ctx.resourceSha256]);
      await client.query("commit");
      const c = n(await client.query(sql.beforeCore, [ctx.sourceId, ctx.resourceSha256]));
      checks.push(["scoped_cleanup_removed_batch", c === 0]);
    }

    const beforeCore = n(await client.query(sql.beforeCore, [ctx.sourceId, ctx.resourceSha256]));
    await client.query("begin");
    for (const r of rows) await client.query(INSERT_OBSERVATION, officialObservationValues(r));
    for (const r of rows) await client.query(INSERT_MART, [r.id]);
    await client.query("commit");
    const afterCore = n(await client.query(sql.beforeCore, [ctx.sourceId, ctx.resourceSha256]));
    checks.push(["core_rows_within_cap", afterCore - beforeCore <= ctx.rowCap]);
    checks.push(["expected_mart_rows", expectedMartRowCount(rows) <= ctx.rowCap]);
    for (const v of POSTLOAD_VALIDATIONS) checks.push([`postload_${v.name}`, n(await client.query(v.sql)) === 0]);

    // idempotent re-load adds nothing
    await client.query("begin");
    for (const r of rows) await client.query(INSERT_OBSERVATION, officialObservationValues(r));
    await client.query("commit");
    checks.push(["idempotent_reload", n(await client.query(sql.beforeCore, [ctx.sourceId, ctx.resourceSha256])) === afterCore]);

    const allOk = checks.every(([, ok]) => ok);
    for (const [name, ok] of checks) say(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
    say(allOk ? "ALL CHECKS PASSED — batch loaded on the branch only; no promotion beyond it." : "ONE OR MORE CHECKS FAILED");
    process.exitCode = allOk ? 0 : 1;
  } catch (e) {
    try { await client.query("rollback"); } catch { /* no active txn */ }
    say(`load failed: ${sanitise(String(e.message).slice(0, 300))}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

async function main() {
  if (has("--execute")) await execute();
  else dryRun();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.log(sanitise(`harness failed: ${e.message}`)); process.exit(1); });
}

export { dryRun };
