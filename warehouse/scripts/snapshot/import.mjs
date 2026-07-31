#!/usr/bin/env node
/**
 * warehouse:snapshot:import (Sprint 18.2, Phase 7)
 *
 * Loads a frozen snapshot's data into an already-migrated target database.
 * This tool loads data -- it never creates tables (that is Phase 8's job,
 * kept as a separate concern: import.mjs hard-fails if a target table
 * doesn't already exist rather than attempting CREATE TABLE).
 *
 * The target connection string is read from a NAMED ENVIRONMENT VARIABLE
 * (never a literal CLI argument, so it can never appear in shell history or
 * `ps aux`). Targeting Production requires a double opt-in: the
 * --i-acknowledge-production-target CLI flag AND SNAPSHOT_ALLOW_PRODUCTION_TARGET=true
 * set together -- neither alone is enough (see lib.mjs#assertNotProduction).
 *
 * Usage:
 *   node warehouse/scripts/snapshot/import.mjs --snapshot-id=<id> --target-url-env=<ENV_VAR_NAME> [--target-label=<text>]
 */

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import {
  loadLocalEnv,
  parseArgs,
  assertNotProduction,
  describeTarget,
  tableFilePath,
  rel,
  targetKey,
  writeJsonAtomic,
  ProgressCheckpoint,
  applyStatementTimeout,
} from "./lib.mjs";
import { runInspectionChecks } from "./inspect.mjs";

async function targetTableMatches(client, schema, table, expectedColumns) {
  const regclass = await client.query(`select to_regclass($1) as reg`, [`${schema}.${table}`]);
  if (!regclass.rows[0].reg) return { exists: false };
  const cols = await client.query(
    `select column_name from information_schema.columns
     where table_schema = $1 and table_name = $2
     order by ordinal_position`,
    [schema, table]
  );
  const actualColumns = cols.rows.map((r) => r.column_name);
  const missing = expectedColumns.filter((c) => !actualColumns.includes(c));
  return { exists: true, missingColumns: missing };
}

async function importTable(client, snapshotId, entry) {
  const filePath = tableFilePath(snapshotId, entry.fullName);
  const colList = entry.columns.map((c) => `"${c}"`).join(", ");

  await client.query("begin");
  try {
    await new Promise((resolve, reject) => {
      const stream = client.query(copyFrom(`COPY "${entry.schema}"."${entry.table}" (${colList}) FROM STDIN`));
      const src = fs.createReadStream(filePath);
      // If the source file read fails partway, the COPY sub-protocol on the
      // server side must be explicitly aborted via stream.destroy() --
      // otherwise the connection (and a real Postgres backend) is left
      // stuck in an active COPY-receiving state indefinitely, since the
      // server is still waiting for CopyDone/CopyFail that will now never
      // arrive. Found as a real bug during Sprint 18.2 Phase 7 rehearsal
      // (a missing source file left a warehouse-validation backend running
      // an active COPY for the full statement_timeout window before this
      // fix, and forever without the statement_timeout safety net either).
      stream.on("error", reject);
      src.on("error", (err) => {
        stream.destroy(err);
        reject(err);
      });
      stream.on("finish", resolve);
      src.pipe(stream);
    });
    const countRes = await client.query(`select count(*)::bigint as n from "${entry.schema}"."${entry.table}"`);
    const actualCount = Number(countRes.rows[0].n);
    if (actualCount !== entry.row_count) {
      await client.query("rollback");
      return { status: "FAILED", reason: `expected ${entry.row_count} rows, target has ${actualCount} after copy` };
    }
    await client.query("commit");
    return { status: "done", row_count: actualCount };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { status: "FAILED", reason: error.message };
  }
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));

  const snapshotId = args["snapshot-id"];
  if (!snapshotId) throw new Error("--snapshot-id is required");

  const envName = args["target-url-env"];
  if (!envName) throw new Error("--target-url-env=<ENV_VAR_NAME> is required (the connection string itself is never a CLI argument)");

  const targetUrl = process.env[envName];
  if (!targetUrl) throw new Error(`Environment variable ${envName} is not set`);

  assertNotProduction(targetUrl, { cliAcknowledged: Boolean(args["i-acknowledge-production-target"]) });

  const targetInfo = describeTarget(targetUrl);
  const targetLabel = args["target-label"] || targetInfo.knownRef;
  console.log(JSON.stringify({ status: "starting", snapshot_id: snapshotId, target_host: targetInfo.host, target_label: targetLabel }));

  // Never proceed from an unverified snapshot.
  const inspection = await runInspectionChecks(snapshotId);
  if (!inspection.ok) {
    throw new Error(`Snapshot ${snapshotId} failed inspection -- run warehouse:snapshot:inspect for detail. Refusing to import.`);
  }
  const manifest = inspection.manifest;

  const hostKey = targetKey(targetUrl);
  const checkpoint = new ProgressCheckpoint(snapshotId, hostKey);
  if (checkpoint.isCompleted()) {
    console.log(JSON.stringify({ status: "already_completed", snapshot_id: snapshotId, target_host: targetInfo.host }));
    return;
  }

  const priorState = checkpoint.load();
  // tables_done persists across resumed runs (already durably committed);
  // tables_failed does NOT -- a resumed run always retries a table that
  // failed previously, since the operator presumably fixed the cause.
  let state = {
    snapshot_id: snapshotId,
    target_host: targetInfo.host,
    started_at: priorState?.started_at ?? new Date().toISOString(),
    tables_done: priorState?.tables_done ?? [],
    tables_failed: [],
  };
  await checkpoint.save(state);

  const client = new Client({ connectionString: targetUrl });
  await client.connect();
  await applyStatementTimeout(client);

  const startedAt = performance.now();
  try {
    for (const entry of manifest.tables) {
      if (state.tables_done.includes(entry.fullName)) continue;

      const check = await targetTableMatches(client, entry.schema, entry.table, entry.columns);
      if (!check.exists) {
        throw new Error(`Target is missing table ${entry.fullName} -- apply Phase 8 bootstrap migrations first`);
      }
      if (check.missingColumns.length > 0) {
        throw new Error(`Target table ${entry.fullName} is missing columns: ${check.missingColumns.join(", ")}`);
      }

      const result = await importTable(client, snapshotId, entry);
      if (result.status === "done") {
        state.tables_done.push(entry.fullName);
        console.log(JSON.stringify({ status: "table_imported", table: entry.fullName, row_count: result.row_count }));
      } else {
        state.tables_failed.push(entry.fullName);
        console.error(JSON.stringify({ status: "table_failed", table: entry.fullName, reason: result.reason }));
      }
      await checkpoint.save(state);
    }
  } finally {
    await client.end().catch(() => {});
  }

  const expected = manifest.tables.map((t) => t.fullName);
  const accounted = new Set([...state.tables_done, ...state.tables_failed]);
  const unaccounted = expected.filter((t) => !accounted.has(t));
  if (unaccounted.length > 0) {
    throw new Error(`Import exited without a terminal state for: ${unaccounted.join(", ")} -- this is a bug, not a silent skip`);
  }

  state.finished_at = new Date().toISOString();
  state.duration_ms = Math.round(performance.now() - startedAt);

  const reportPath = rel("warehouse", "reports", `snapshot_import_${snapshotId}_${hostKey}.json`);
  await writeJsonAtomic(reportPath, state);

  if (state.tables_failed.length > 0) {
    throw new Error(`Import completed with failures: ${state.tables_failed.join(", ")} -- see ${reportPath}`);
  }

  await checkpoint.complete(state);
  console.log(JSON.stringify({ status: "pass", snapshot_id: snapshotId, tables_done: state.tables_done.length, duration_ms: state.duration_ms }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`snapshot import failed: ${error.message}`);
    process.exit(1);
  });
}

export { targetTableMatches, importTable };
