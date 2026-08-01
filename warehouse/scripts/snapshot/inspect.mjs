#!/usr/bin/env node
/**
 * warehouse:snapshot:inspect (Sprint 18.2, Phase 7)
 *
 * Pure local file/manifest validation -- no database connection at all.
 * Cheapest, safest command in the module; usable offline as a pre-import
 * gate. import.mjs runs these same checks inline before ever touching a
 * database, so a snapshot that fails inspection is never imported.
 *
 * Usage:
 *   node warehouse/scripts/snapshot/inspect.mjs [--snapshot-id=<id>]
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  TABLE_ALLOW_LIST,
  parseArgs,
  rel,
  snapshotDir,
  manifestPath,
  tableFilePath,
  sha256File,
  readJson,
  writeJsonAtomic,
} from "./lib.mjs";

function latestSnapshotId() {
  const root = rel("warehouse", "data", "snapshots");
  if (!fs.existsSync(root)) throw new Error(`No snapshots directory found at ${root}`);
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, mtime: fs.statSync(path.join(root, d.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (dirs.length === 0) throw new Error(`No snapshot directories found under ${root}`);
  return dirs[0].name;
}

async function countRowsAndCheckPk(filePath, columns, primaryKey) {
  const pkIndexes = primaryKey.map((k) => columns.indexOf(k));
  if (pkIndexes.some((i) => i === -1)) {
    return { rowCount: 0, duplicatePkCount: -1, error: "primary key column not found in recorded columns" };
  }
  const seen = new Set();
  let rowCount = 0;
  let duplicatePkCount = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length === 0) continue;
    rowCount += 1;
    const fields = line.split("\t");
    const key = pkIndexes.map((i) => fields[i]).join("");
    if (seen.has(key)) duplicatePkCount += 1;
    else seen.add(key);
  }
  return { rowCount, duplicatePkCount };
}

/**
 * Runs every inspection check for a snapshot and returns { ok, checks,
 * manifest } without writing a report or printing anything -- the shared
 * core that both this script's main() and import.mjs's pre-flight call.
 */
async function runInspectionChecks(snapshotId) {
  const dir = snapshotDir(snapshotId);
  if (!fs.existsSync(dir)) throw new Error(`Snapshot directory not found: ${dir}`);

  const tablesDir = path.join(dir, "tables");
  const partialFiles = fs.existsSync(tablesDir)
    ? fs.readdirSync(tablesDir).filter((f) => f.endsWith(".copy.partial"))
    : [];
  if (partialFiles.length > 0) {
    throw new Error(`Snapshot directory contains partial files (${partialFiles.join(", ")}) -- refusing to inspect an incomplete export`);
  }

  const manifest = readJson(manifestPath(snapshotId));
  const checks = [];
  let ok = true;

  function check(label, pass, detail) {
    checks.push({ label, pass, detail: detail ?? null });
    if (!pass) ok = false;
  }

  // Every allow-listed table present in the manifest, no extras.
  const manifestTables = new Set(manifest.tables.map((t) => t.fullName));
  const missing = TABLE_ALLOW_LIST.filter((t) => !manifestTables.has(t));
  check("all allow-listed tables present in manifest", missing.length === 0, missing.join(", ") || undefined);

  const extra = [...manifestTables].filter((t) => !TABLE_ALLOW_LIST.includes(t));
  check("no tables beyond the allow-list present in manifest", extra.length === 0, extra.join(", ") || undefined);

  for (const entry of manifest.tables) {
    const filePath = tableFilePath(snapshotId, entry.fullName);
    if (!fs.existsSync(filePath)) {
      check(`${entry.fullName}: file exists`, false, filePath);
      continue;
    }
    const actualSha = sha256File(filePath);
    check(`${entry.fullName}: file SHA-256 matches manifest`, actualSha === entry.file_sha256);

    const { rowCount, duplicatePkCount } = await countRowsAndCheckPk(filePath, entry.columns, entry.primary_key);
    check(`${entry.fullName}: row count matches manifest (${entry.row_count})`, rowCount === entry.row_count, `file has ${rowCount} rows`);
    check(`${entry.fullName}: primary key is unique within file`, duplicatePkCount === 0, `${duplicatePkCount} duplicate key(s)`);
  }

  return { ok, checks, manifest };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshotId = args["snapshot-id"] || latestSnapshotId();
  const { ok, checks } = await runInspectionChecks(snapshotId);

  const summary = { status: ok ? "pass" : "fail", snapshot_id: snapshotId, checks };
  const reportPath = rel("warehouse", "reports", `snapshot_inspect_${snapshotId}.json`);
  await writeJsonAtomic(reportPath, summary);

  for (const c of checks) {
    console.log(`  ${c.pass ? "ok  " : "FAIL"} ${c.label}${c.detail ? ` -- ${c.detail}` : ""}`);
  }
  console.log("");
  console.log(ok ? "Snapshot inspection passed" : "Snapshot inspection FAILED");
  if (!ok) process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`snapshot inspect failed: ${error.message}`);
    process.exit(1);
  });
}

export { countRowsAndCheckPk, latestSnapshotId, runInspectionChecks };
