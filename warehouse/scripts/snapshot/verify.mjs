#!/usr/bin/env node
/**
 * warehouse:snapshot:verify (Sprint 18.2, Phase 7)
 *
 * Independent post-import audit comparing a LIVE target database against a
 * snapshot's manifest -- deliberately separate from import.mjs so it can be
 * re-run anytime as a standalone correctness audit (e.g. days after import,
 * to confirm nothing drifted), not just immediately after loading.
 *
 * Checks both row count AND a content-level checksum: row count alone can't
 * catch "right count, wrong values" -- the checksum can.
 *
 * Usage:
 *   node warehouse/scripts/snapshot/verify.mjs --snapshot-id=<id> --target-url-env=<ENV_VAR_NAME>
 *   node warehouse/scripts/snapshot/verify.mjs --snapshot-id=<id> --target-pg-env
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  loadLocalEnv,
  parseArgs,
  resolveTarget,
  manifestPath,
  readJson,
  rel,
  writeJsonAtomic,
  applyStatementTimeout,
} from "./lib.mjs";

async function verifyTable(client, entry) {
  const pkList = entry.primary_key.map((c) => `"${c}"`).join(", ");
  // Hash only the manifest's exported column set, matching export.mjs's
  // digest exactly -- `t::text` would include any column the target
  // deliberately never has (e.g. core.dim_geography.geom), making the
  // digest permanently unmatchable even when every exported column's data
  // is byte-identical. Same real bug and fix as export.mjs's digest query.
  const colList = entry.columns.map((c) => `"${c}"`).join(", ");
  const countRes = await client.query(`select count(*)::bigint as n from "${entry.schema}"."${entry.table}"`);
  const actualRows = Number(countRes.rows[0].n);
  const digestRes = await client.query(
    `select md5(string_agg(md5(row(${colList})::text), '' order by ${pkList})) as digest
     from "${entry.schema}"."${entry.table}"`
  );
  const actualDigest = digestRes.rows[0].digest;
  return {
    table: entry.fullName,
    expected_rows: entry.row_count,
    actual_rows: actualRows,
    rows_match: actualRows === entry.row_count,
    expected_digest: entry.content_digest,
    actual_digest: actualDigest,
    digest_match: actualDigest === entry.content_digest,
  };
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));

  const snapshotId = args["snapshot-id"];
  if (!snapshotId) throw new Error("--snapshot-id is required");

  const { clientConfig, targetInfo, hostKey } = resolveTarget(args);
  console.log(JSON.stringify({ status: "starting", snapshot_id: snapshotId, target_host: targetInfo.host }));

  const manifest = readJson(manifestPath(snapshotId));
  const client = new Client(clientConfig);
  await client.connect();
  await applyStatementTimeout(client);

  const results = [];
  try {
    for (const entry of manifest.tables) {
      const result = await verifyTable(client, entry);
      results.push(result);
      console.log(
        JSON.stringify({
          status: result.rows_match && result.digest_match ? "table_pass" : "table_FAIL",
          table: result.table,
          rows: `${result.actual_rows}/${result.expected_rows}`,
        })
      );
    }
  } finally {
    await client.end().catch(() => {});
  }

  const allPass = results.every((r) => r.rows_match && r.digest_match);
  const reportPath = rel("warehouse", "reports", `snapshot_verify_${snapshotId}_${hostKey}.json`);
  await writeJsonAtomic(reportPath, { status: allPass ? "pass" : "fail", snapshot_id: snapshotId, target_host: targetInfo.host, tables: results });

  console.log(allPass ? "Snapshot verification passed" : "Snapshot verification FAILED");
  if (!allPass) process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`snapshot verify failed: ${error.message}`);
    process.exit(1);
  });
}

export { verifyTable };
