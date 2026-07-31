#!/usr/bin/env node
/**
 * warehouse:snapshot:export (Sprint 18.2, Phase 7)
 *
 * Exports the 21-table minimum launch contract from warehouse-validation
 * into a gitignored local snapshot package under
 * warehouse/data/snapshots/<snapshot-id>/. Source is always
 * WAREHOUSE_VALIDATION_DB_URL -- this command has no target/destination at
 * all, which removes an entire class of misconfiguration.
 *
 * All 21 tables are read inside a single REPEATABLE READ READ ONLY
 * transaction, so the whole snapshot is captured from one consistent
 * point-in-time view (core.dim_geography and the 20 dependent mart/meta
 * tables must be mutually consistent).
 *
 * Usage:
 *   node warehouse/scripts/snapshot/export.mjs [--snapshot-id=<id>] [--label=<text>]
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { to as copyTo } from "pg-copy-streams";
import {
  BRANCH_REF,
  PROD_REF,
  TABLE_ALLOW_LIST,
  loadLocalEnv,
  parseArgs,
  snapshotDir,
  tableFilePath,
  manifestPath,
  checksumsPath,
  sha256File,
  writeJsonAtomic,
  applyStatementTimeout,
} from "./lib.mjs";

async function tableColumnsAndKey(client, schema, table) {
  const cols = await client.query(
    `select column_name from information_schema.columns
     where table_schema = $1 and table_name = $2
     order by ordinal_position`,
    [schema, table]
  );
  if (cols.rows.length === 0) {
    throw new Error(`Table ${schema}.${table} not found on source -- allow-list is stale`);
  }
  const pk = await client.query(
    `select kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
     where tc.table_schema = $1 and tc.table_name = $2 and tc.constraint_type = 'PRIMARY KEY'
     order by kcu.ordinal_position`,
    [schema, table]
  );
  if (pk.rows.length === 0) {
    throw new Error(`Table ${schema}.${table} has no primary key -- cannot order export deterministically`);
  }
  return {
    columns: cols.rows.map((r) => r.column_name),
    primaryKey: pk.rows.map((r) => r.column_name),
  };
}

async function exportTable(client, snapshotId, outDir, fullName) {
  const [schema, table] = fullName.split(".");
  const { columns, primaryKey } = await tableColumnsAndKey(client, schema, table);
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const pkList = primaryKey.map((c) => `"${c}"`).join(", ");

  const countRes = await client.query(`select count(*)::bigint as n from "${schema}"."${table}"`);
  const rowCount = Number(countRes.rows[0].n);

  const filePath = tableFilePath(snapshotId, fullName);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });

  const copySql = `COPY (select ${colList} from "${schema}"."${table}" order by ${pkList}) TO STDOUT`;
  await new Promise((resolve, reject) => {
    const stream = client.query(copyTo(copySql));
    const dest = fs.createWriteStream(filePath);
    // If the destination write fails partway (disk full, permissions), the
    // source COPY TO stream must be explicitly destroyed -- otherwise the
    // server-side COPY sub-protocol is left half-finished indefinitely
    // (found as a real bug on the mirror-image copyFrom path in import.mjs
    // during Phase 7 rehearsal; fixed symmetrically here as prevention).
    stream.on("error", reject);
    dest.on("error", (err) => {
      stream.destroy(err);
      reject(err);
    });
    dest.on("finish", resolve);
    stream.pipe(dest);
  });

  const digestRes = await client.query(
    `select md5(string_agg(md5(t::text), '' order by ${pkList})) as digest
     from "${schema}"."${table}" t`
  );

  return {
    schema,
    table,
    fullName,
    row_count: rowCount,
    columns,
    primary_key: primaryKey,
    file: path.relative(outDir, filePath).split(path.sep).join("/"),
    file_sha256: sha256File(filePath),
    content_digest: digestRes.rows[0].digest,
  };
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));

  const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
  if (!dbUrl) throw new Error("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
  if (dbUrl.includes(PROD_REF)) throw new Error("connection string references PRODUCTION -- refusing (hard stop)");
  if (!dbUrl.includes(BRANCH_REF)) {
    throw new Error(`connection string is not the warehouse-validation branch (${BRANCH_REF}) -- refusing (hard stop)`);
  }

  const snapshotId =
    args["snapshot-id"] ||
    `wh-snap-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(4).toString("hex")}-min21`;
  const outDir = snapshotDir(snapshotId);
  if (fs.existsSync(outDir)) {
    throw new Error(`Snapshot directory already exists: ${outDir} -- choose a different --snapshot-id`);
  }
  await fsp.mkdir(path.join(outDir, "tables"), { recursive: true });

  console.log(JSON.stringify({ status: "starting", snapshot_id: snapshotId, source_ref: BRANCH_REF }));

  const client = new Client({ connectionString: dbUrl });
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const tables = [];

  try {
    await client.connect();
    await applyStatementTimeout(client);
    await client.query("begin isolation level repeatable read read only");

    // tableColumnsAndKey() throws if a table is missing on the source, so
    // this loop itself is the cross-check against the live DB -- it never
    // trusts TABLE_ALLOW_LIST blindly.
    for (const fullName of TABLE_ALLOW_LIST) {
      const entry = await exportTable(client, snapshotId, outDir, fullName);
      tables.push(entry);
      console.log(JSON.stringify({ status: "table_exported", table: fullName, row_count: entry.row_count }));
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    // Remove partial output so a failed run is never mistaken for complete.
    await fsp.rm(outDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  const totalRowCount = tables.reduce((sum, t) => sum + t.row_count, 0);
  const manifest = {
    snapshot_id: snapshotId,
    label: args.label || null,
    generated_at: startedAt,
    duration_ms: Math.round(performance.now() - started),
    source: { project_ref: BRANCH_REF, label: "warehouse-validation" },
    table_allow_list: TABLE_ALLOW_LIST,
    tables,
    total_row_count: totalRowCount,
    format: "postgres-copy-text-v1",
    tool_versions: { node: process.version },
  };

  await writeJsonAtomic(manifestPath(snapshotId), manifest);
  await writeJsonAtomic(
    checksumsPath(snapshotId),
    Object.fromEntries(tables.map((t) => [t.fullName, { sha256: t.file_sha256, digest: t.content_digest, row_count: t.row_count }]))
  );

  console.log(
    JSON.stringify({
      status: "pass",
      snapshot_id: snapshotId,
      total_row_count: totalRowCount,
      tables: tables.length,
      out_dir: path.relative(process.cwd(), outDir),
    })
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`snapshot export failed: ${error.message}`);
    process.exit(1);
  });
}

export { tableColumnsAndKey, exportTable };
