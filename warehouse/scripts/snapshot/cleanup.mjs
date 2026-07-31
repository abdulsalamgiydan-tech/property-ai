#!/usr/bin/env node
/**
 * warehouse:snapshot:cleanup (Sprint 18.2, Phase 7)
 *
 * Deletes a local snapshot directory. --snapshot-id is required and there
 * is deliberately no --all/bulk-delete mode -- one invocation per snapshot,
 * a guard against fat-fingering a mass deletion. Dry-run by default:
 * without --force this only reports what would be deleted.
 *
 * Refuses to delete a snapshot that has an unfinished (non-.completed.json)
 * import in progress, protecting the only source-of-truth for a resumable
 * restore.
 *
 * Usage:
 *   node warehouse/scripts/snapshot/cleanup.mjs --snapshot-id=<id> [--force]
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, snapshotDir, importStateDir } from "./lib.mjs";

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(full) : fs.statSync(full).size;
  }
  return total;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshotId = args["snapshot-id"];
  if (!snapshotId) throw new Error("--snapshot-id is required (no bulk/--all mode)");

  const dir = snapshotDir(snapshotId);
  if (!fs.existsSync(dir)) throw new Error(`Snapshot directory not found: ${dir}`);

  const stateDir = importStateDir(snapshotId);
  if (fs.existsSync(stateDir)) {
    const files = fs.readdirSync(stateDir);
    const inProgress = files.filter((f) => f.endsWith(".progress.json"));
    if (inProgress.length > 0) {
      throw new Error(
        `Refusing to delete ${snapshotId} -- unfinished import(s) in progress: ${inProgress.join(", ")}. ` +
          "Finish or explicitly abandon the import before cleaning up."
      );
    }
  }

  const sizeBytes = dirSizeBytes(dir);
  const force = Boolean(args.force);

  console.log(JSON.stringify({ status: force ? "deleting" : "dry_run", snapshot_id: snapshotId, size_bytes: sizeBytes, dir: path.relative(process.cwd(), dir) }));

  if (!force) {
    console.log("Dry run only -- pass --force to actually delete.");
    return;
  }

  await fsp.rm(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ status: "deleted", snapshot_id: snapshotId, size_bytes: sizeBytes }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`snapshot cleanup failed: ${error.message}`);
    process.exit(1);
  });
}
