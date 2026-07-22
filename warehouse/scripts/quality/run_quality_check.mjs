#!/usr/bin/env node
/**
 * Sprint 12, Workstream 9 — quality check orchestrator.
 *
 * Runs every applicable registered rule (meta.data_quality_rule), records
 * one meta.data_quality_result row per rule per run, opens/updates
 * meta.data_incident for failures (idempotently — a repeated failure of
 * the same rule against the same target updates the existing OPEN
 * incident rather than creating a duplicate), and writes
 * meta.data_quarantine_summary rows for rules whose failure means specific
 * rows should be quarantined (not deleted).
 *
 * Blocking rules that fail cause this script to exit non-zero — callers
 * (CI, the refresh engine) must treat that as "do not promote". Advisory
 * rules never affect the exit code, only visibility.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default (still RUNS every rule and prints the
 * report — dry-run only skips persisting data_quality_run/result/incident/
 * quarantine rows, since those writes are metadata about a check that just
 * happened, not data the rest of the warehouse depends on).
 *
 * Usage:
 *   node run_quality_check.mjs                              # dry run, all rules
 *   node run_quality_check.mjs --execute                    # all rules, persisted
 *   node run_quality_check.mjs --execute --dataset=<id>
 *   node run_quality_check.mjs --execute --domain=<domain>
 *   node run_quality_check.mjs --execute --jurisdiction=<code>
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { executeRule } from "./rule_engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function argValue(flag) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.split("=").slice(1).join("=") : null;
}
const datasetFilter = argValue("dataset");
const domainFilter = argValue("domain");
const jurisdictionFilter = argValue("jurisdiction");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`run_quality_check — ${EXECUTE ? "EXECUTE (results persisted)" : "DRY RUN (results printed, not persisted)"}`);
if (datasetFilter) console.log(`  scope: dataset=${datasetFilter}`);
if (domainFilter) console.log(`  scope: domain=${domainFilter}`);
if (jurisdictionFilter) console.log(`  scope: jurisdiction=${jurisdictionFilter}`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

// Legacy rule_ids (is_legacy=true) exist only so historical
// meta.data_quality_result rows from Sprints 9-12's loader scripts have a
// valid FK target -- they carry no target_schema/target_table/
// expected_threshold and are never executed by this engine.
let rules = await q("select * from meta.data_quality_rule where not is_legacy order by rule_id");
if (domainFilter) rules = rules.filter((r) => r.domain === domainFilter);
if (jurisdictionFilter) rules = rules.filter((r) => !r.jurisdiction_code || r.jurisdiction_code === jurisdictionFilter);
if (datasetFilter) {
  // rule catalogue rows aren't dataset-scoped directly (they're table-scoped) —
  // dataset filtering runs against the target_table via meta.dataset's
  // geography_available convention isn't a clean match, so this filters to
  // rules whose target_table's known dataset(s) include the requested one,
  // determined via meta.metric_lineage_registry / a simple name heuristic
  // for the datasets this script actually knows about.
  const { rows: datasetRows } = await client.query("select dataset_id from meta.dataset where dataset_id = $1", [datasetFilter]);
  if (datasetRows.length === 0) fail(`unknown dataset_id '${datasetFilter}'`);
  console.log(`  note: --dataset filtering runs all table-level rules for now (dataset '${datasetFilter}' confirmed registered) — see WS10 for per-dataset dependency-aware scoping`);
}

console.log(`\n  ${rules.length} rules selected to run`);

let qualityRunId = null;
if (EXECUTE) {
  const { rows } = await client.query(
    "insert into meta.data_quality_run (triggered_by, scope, status) values ($1,$2,'running') returning quality_run_id",
    [datasetFilter ? "dataset" : domainFilter ? "domain" : jurisdictionFilter ? "jurisdiction" : "manual", JSON.stringify({ dataset: datasetFilter, domain: domainFilter, jurisdiction: jurisdictionFilter })]
  );
  qualityRunId = rows[0].quality_run_id;
}

const results = [];
let rulesPassed = 0;
let rulesFailedBlocking = 0;
let rulesFailedAdvisory = 0;

for (const rule of rules) {
  let outcome;
  try {
    outcome = await executeRule(client, rule);
  } catch (err) {
    outcome = { passed: false, actualResult: { error: String(err.message ?? err).slice(0, 500) }, affectedRowCount: 0, evidence: [] };
    console.error(`  ! rule ${rule.rule_id} threw an error: ${outcome.actualResult.error}`);
  }
  const status = outcome.passed ? "passed" : "failed";
  if (outcome.passed) rulesPassed++;
  else if (rule.blocking) rulesFailedBlocking++;
  else rulesFailedAdvisory++;

  console.log(`  ${outcome.passed ? "✓" : rule.blocking ? "✗ BLOCKING" : "⚠ advisory"} ${rule.rule_id} (${rule.rule_family}) — affected=${outcome.affectedRowCount}`);

  results.push({ rule, outcome, status });

  if (EXECUTE) {
    const now = new Date().toISOString();
    const { rows: inserted } = await client.query(
      `insert into meta.data_quality_result
        (quality_run_id, rule_id, severity, status, failed_record_count, details, jurisdiction_code, geography_grain, blocking, expected_threshold, actual_result, first_detected_at, latest_detected_at, evidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13)
       returning quality_result_id`,
      [
        qualityRunId, rule.rule_id, rule.severity, status, outcome.affectedRowCount,
        JSON.stringify({ stage: "sprint12_ws9_quality_check" }), rule.jurisdiction_code, rule.geography_grain,
        rule.blocking, rule.expected_threshold, JSON.stringify(outcome.actualResult), now, JSON.stringify(outcome.evidence),
      ]
    );
    const resultId = inserted[0].quality_result_id;

    if (!outcome.passed) {
      // Idempotent incident handling: the partial unique index on
      // (unique_signature) WHERE status='open' means a second failure of
      // the same rule against the same target updates the existing open
      // incident instead of creating a duplicate.
      await client.query(
        `insert into meta.data_incident (rule_id, target_schema, target_table, jurisdiction_code, status, severity, summary, first_quality_result_id, latest_quality_result_id)
         values ($1,$2,$3,$4,'open',$5,$6,$7,$7)
         on conflict (unique_signature) where status = 'open' do update set
           latest_quality_result_id = excluded.latest_quality_result_id,
           occurrence_count = meta.data_incident.occurrence_count + 1,
           severity = excluded.severity`,
        [rule.rule_id, rule.target_schema, rule.target_table, rule.jurisdiction_code, rule.severity, `${rule.description} (${outcome.affectedRowCount} affected)`, resultId]
      );
    } else {
      // A rule that now passes auto-resolves any open incident for the same signature —
      // re-running a corrected load must not leave a stale open incident behind.
      await client.query(
        `update meta.data_incident set status = 'resolved', resolved_at = now(), resolution_notes = 'auto-resolved: rule passed on a subsequent run'
         where rule_id = $1 and coalesce(target_schema,'') = coalesce($2,'') and coalesce(target_table,'') = coalesce($3,'') and coalesce(jurisdiction_code,'') = coalesce($4,'') and status = 'open'`,
        [rule.rule_id, rule.target_schema, rule.target_table, rule.jurisdiction_code]
      );
    }

    // Quarantine: rules that identify specific bad rows (not aggregate
    // counts like row_count_anomaly/stale_source) record a quarantine
    // summary when they fail, WITHOUT deleting the underlying rows —
    // consistent with this project's established "quarantine, don't
    // discard" pattern (first used for Poor-quality geography
    // correspondence rows in WS4).
    const QUARANTINABLE_FAMILIES = new Set(["duplicate_natural_key", "orphan_geography", "negative_value", "range_check", "invalid_geometry", "future_dated_observation"]);
    if (!outcome.passed && QUARANTINABLE_FAMILIES.has(rule.rule_family) && outcome.affectedRowCount > 0) {
      await client.query(
        `insert into meta.data_quarantine_summary (rule_id, target_schema, target_table, reason, quarantined_count, sample_row_ids, quality_run_id)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [rule.rule_id, rule.target_schema, rule.target_table, rule.description, outcome.affectedRowCount, JSON.stringify(outcome.evidence), qualityRunId]
      );
    }
  }
}

if (EXECUTE) {
  await client.query(
    "update meta.data_quality_run set status='completed', completed_at=now(), rules_run=$2, rules_passed=$3, rules_failed_blocking=$4, rules_failed_advisory=$5 where quality_run_id=$1",
    [qualityRunId, rules.length, rulesPassed, rulesFailedBlocking, rulesFailedAdvisory]
  );
}

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  persisted: EXECUTE,
  quality_run_id: qualityRunId,
  scope: { dataset: datasetFilter, domain: domainFilter, jurisdiction: jurisdictionFilter },
  rules_run: rules.length,
  rules_passed: rulesPassed,
  rules_failed_blocking: rulesFailedBlocking,
  rules_failed_advisory: rulesFailedAdvisory,
  results: results.map((r) => ({ ruleId: r.rule.rule_id, ruleFamily: r.rule.rule_family, severity: r.rule.severity, blocking: r.rule.blocking, status: r.status, affectedRowCount: r.outcome.affectedRowCount, actualResult: r.outcome.actualResult })),
};
await client.end();
fs.writeFileSync(rel("warehouse", "reports", "quality_check_report.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`\nrules_run=${rules.length} passed=${rulesPassed} failed_blocking=${rulesFailedBlocking} failed_advisory=${rulesFailedAdvisory}`);
console.log("Run report written: warehouse/reports/quality_check_report.json");

if (rulesFailedBlocking > 0) {
  console.error(`\n${rulesFailedBlocking} BLOCKING rule(s) failed — this data must NOT be promoted.`);
  process.exit(1);
}
