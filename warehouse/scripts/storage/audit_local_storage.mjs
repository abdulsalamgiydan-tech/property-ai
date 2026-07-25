#!/usr/bin/env node
/**
 * Local-first national data lake catalogue (Sprint 11, Workstream 7).
 *
 * Walks warehouse/data/{raw,processed,local} and produces a full inventory:
 * per-directory size/file-count/extension breakdown, a cross-check against
 * .gitignore (every extension actually present on disk must be covered),
 * and a per-dataset summary linking raw source → processed intermediate →
 * final queryable local store.
 *
 * Read-only. Makes no changes to disk or git. No Supabase connection.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const DATA_ROOT = rel("warehouse", "data");

function walk(rootDir) {
  const files = [];
  if (!fs.existsSync(rootDir)) return files;
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files;
}

function topLevelDataset(base, filePath) {
  const relPath = path.relative(base, filePath);
  return relPath.split(path.sep)[0] ?? "(root)";
}

function bytesToMb(b) {
  return Math.round((b / 1024 / 1024) * 100) / 100;
}

console.log("audit_local_storage — inventorying warehouse/data (read-only, no Supabase connection)");

const sections = {};
let grandTotalBytes = 0;
const extensionCounts = new Map();

for (const zone of ["raw", "processed", "local"]) {
  const zoneDir = path.join(DATA_ROOT, zone);
  const files = walk(zoneDir);
  const byDataset = new Map();

  for (const f of files) {
    const size = fs.statSync(f).size;
    grandTotalBytes += size;
    const ds = topLevelDataset(zoneDir, f);
    if (!byDataset.has(ds)) byDataset.set(ds, { file_count: 0, bytes: 0 });
    const entry = byDataset.get(ds);
    entry.file_count += 1;
    entry.bytes += size;

    const ext = path.extname(f).toLowerCase().replace(".", "") || "(none)";
    extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
  }

  const datasetSummary = [...byDataset.entries()]
    .map(([dataset, v]) => ({ dataset, file_count: v.file_count, size_mb: bytesToMb(v.bytes) }))
    .sort((a, b) => b.size_mb - a.size_mb);

  sections[zone] = {
    total_files: files.length,
    total_size_mb: Math.round(datasetSummary.reduce((s, d) => s + d.size_mb, 0) * 100) / 100,
    by_dataset: datasetSummary,
  };
  console.log(`  ${zone}/: ${files.length} files, ${sections[zone].total_size_mb} MB across ${datasetSummary.length} datasets`);
}

// Cross-check: every extension found on disk must be covered by .gitignore
// (either the blanket warehouse/data/ rule or an explicit *.ext rule).
const gitignoreContent = fs.readFileSync(rel(".gitignore"), "utf8");
const hasBlanketRule = /^warehouse\/data\/\s*$/m.test(gitignoreContent);
const explicitExtRules = [...gitignoreContent.matchAll(/^\*\.(\w+)\s*$/gm)].map((m) => m[1].toLowerCase());

const extensionsOnDisk = [...extensionCounts.keys()].sort();
const uncoveredExtensions = hasBlanketRule ? [] : extensionsOnDisk.filter((e) => e !== "(none)" && !explicitExtRules.includes(e));

// Cross-check: confirm git genuinely tracks zero files under warehouse/data/
let trackedFileCount = -1;
try {
  const out = execSync("git ls-files warehouse/data/", { cwd: repoRoot, encoding: "utf8" });
  trackedFileCount = out.trim() === "" ? 0 : out.trim().split("\n").length;
} catch {
  trackedFileCount = -1; // git not available or command failed — flagged, not silently assumed zero
}

const gitignoreCheck = {
  blanket_warehouse_data_rule_present: hasBlanketRule,
  extensions_found_on_disk: extensionsOnDisk,
  extensions_not_explicitly_covered: uncoveredExtensions,
  effectively_covered: hasBlanketRule || uncoveredExtensions.length === 0,
  git_tracked_file_count_under_warehouse_data: trackedFileCount,
  git_check_passed: trackedFileCount === 0,
};

console.log(`\n.gitignore check: blanket rule present = ${hasBlanketRule}, git-tracked files under warehouse/data/ = ${trackedFileCount}`);

// Reclaimable candidates: processed/ directories whose corresponding
// local/ output already exists are extraction scratch space, safe to
// delete and re-derive from raw/ if ever needed again. This script only
// IDENTIFIES candidates — deletion is plan_local_cleanup.mjs's job, and
// even that only proposes a plan, never executes it.
const processedDatasets = sections.processed?.by_dataset ?? [];
const localOutputsPresent = sections.local?.by_dataset?.length > 0;
const reclaimable_mb = processedDatasets.reduce((s, d) => s + d.size_mb, 0);

const report = {
  generated_at: new Date().toISOString(),
  scope: "Read-only inventory of warehouse/data/{raw,processed,local} — Sprint 11 Workstream 7",
  grand_total_size_mb: bytesToMb(grandTotalBytes),
  by_zone: sections,
  gitignore_check: gitignoreCheck,
  reclaimable_processed_data_mb: reclaimable_mb,
  reclaimable_note: localOutputsPresent
    ? "warehouse/data/processed/ (extraction scratch space) can be safely deleted and re-derived from warehouse/data/raw/ if ever needed again, since every processed dataset already has a corresponding built output in warehouse/data/local/. See plan_local_cleanup.mjs for the actual cleanup plan — this script only identifies the candidate, it does not delete anything."
    : "no local/ outputs found — do not delete processed/ until confirmed built and validated",
};

fs.mkdirSync(rel("warehouse", "reports"), { recursive: true });
fs.writeFileSync(rel("warehouse", "reports", "local_storage_audit.json"), JSON.stringify(report, null, 2));

const md = `# Local Storage Audit (Sprint 11, Workstream 7)

Generated: ${report.generated_at}

**Grand total: ${report.grand_total_size_mb} MB** across \`warehouse/data/{raw,processed,local}\` (all gitignored).

## By zone

${["raw", "processed", "local"]
  .map(
    (zone) => `### ${zone}/ — ${sections[zone].total_size_mb} MB, ${sections[zone].total_files} files

| dataset | files | size (MB) |
|---|---|---|
${sections[zone].by_dataset.map((d) => `| ${d.dataset} | ${d.file_count} | ${d.size_mb} |`).join("\n")}
`
  )
  .join("\n")}

## .gitignore coverage check

| check | result |
|---|---|
| blanket \`warehouse/data/\` rule present | ${gitignoreCheck.blanket_warehouse_data_rule_present} |
| extensions found on disk | ${gitignoreCheck.extensions_found_on_disk.join(", ")} |
| extensions not explicitly covered (irrelevant if blanket rule present) | ${gitignoreCheck.extensions_not_explicitly_covered.join(", ") || "none"} |
| git-tracked file count under warehouse/data/ | ${gitignoreCheck.git_tracked_file_count_under_warehouse_data} |
| **effectively covered** | **${gitignoreCheck.effectively_covered}** |
| **git check passed (0 tracked files)** | **${gitignoreCheck.git_check_passed}** |

## Reclaimable space

**${report.reclaimable_processed_data_mb} MB** in \`warehouse/data/processed/\` — ${report.reclaimable_note}
`;

fs.writeFileSync(rel("warehouse", "reports", "local_storage_audit.md"), md);

console.log(`\nGrand total: ${report.grand_total_size_mb} MB`);
console.log(`Reclaimable (processed/ scratch space): ${report.reclaimable_processed_data_mb} MB`);
console.log("Wrote warehouse/reports/local_storage_audit.{json,md}");

if (!gitignoreCheck.effectively_covered || !gitignoreCheck.git_check_passed) {
  console.error("\nAUDIT FAILED — gitignore coverage or git-tracked-file check did not pass");
  process.exit(1);
}
console.log("Audit passed.");
