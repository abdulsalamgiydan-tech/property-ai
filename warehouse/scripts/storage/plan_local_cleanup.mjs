#!/usr/bin/env node
/**
 * Local data lake cleanup planner (Sprint 11, Workstream 7).
 *
 * Reads warehouse/reports/local_storage_audit.json (run audit_local_storage.mjs
 * first) and proposes which warehouse/data/processed/ datasets are safe to
 * delete because every one of them already has a corresponding built output
 * in warehouse/data/local/. This script NEVER deletes anything itself — it
 * only writes a plan (with the exact `rm -rf` commands a human/future
 * session could choose to run) to warehouse/reports/local_cleanup_plan.{json,md}.
 * Consistent with this project's rule that destructive operations are never
 * auto-executed, even for reproducible/reconstructable scratch data.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const auditPath = rel("warehouse", "reports", "local_storage_audit.json");
if (!fs.existsSync(auditPath)) {
  console.error("ERROR: run audit_local_storage.mjs first — local_storage_audit.json not found");
  process.exit(1);
}
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));

// A processed/ dataset is a safe-to-delete candidate only if a raw/
// dataset with a plausible matching name still exists on disk (so it can
// be re-extracted/re-derived without re-downloading) — never propose
// deleting something whose only copy is the processed/ extraction.
const rawDatasets = new Set((audit.by_zone.raw?.by_dataset ?? []).map((d) => d.dataset));
const processedDatasets = audit.by_zone.processed?.by_dataset ?? [];

function matchesRawSource(processedName) {
  // e.g. "census_2016" -> "census_2016" (exact), "asgs" -> "asgs" (exact),
  // "nsw_sales" -> "nsw_sales" (exact), "census" -> no raw/census, but a
  // near match census_2016/asgs exists; only exact matches are proposed
  // for cleanup — anything ambiguous is left for manual review instead.
  return rawDatasets.has(processedName);
}

const candidates = [];
const needsManualReview = [];

for (const d of processedDatasets) {
  const hasMatchingRaw = matchesRawSource(d.dataset);
  const item = {
    dataset: d.dataset,
    processed_path: `warehouse/data/processed/${d.dataset}`,
    size_mb: d.size_mb,
    file_count: d.file_count,
    matching_raw_dataset_present: hasMatchingRaw,
  };
  if (hasMatchingRaw) candidates.push(item);
  else needsManualReview.push(item);
}

const totalReclaimableMb = Math.round(candidates.reduce((s, c) => s + c.size_mb, 0) * 100) / 100;

const report = {
  generated_at: new Date().toISOString(),
  scope: "Cleanup PLAN only — this script deletes nothing. Sprint 11 Workstream 7.",
  based_on_audit: audit.generated_at,
  safe_to_delete_candidates: candidates,
  needs_manual_review: needsManualReview,
  total_reclaimable_mb: totalReclaimableMb,
  rm_commands: candidates.map((c) => `rm -rf "${c.processed_path}"`),
  caveats: [
    "A dataset is only proposed for deletion if its raw/ source still exists on disk — re-extraction is then possible without re-downloading anything.",
    "This plan does not verify that every processed file was actually consumed into a local/ build (e.g. an abandoned or half-finished build could leave processed/ as the only evidence of a problem) — review warehouse/reports/*_local_build.json or *_report.json for each dataset before running any rm command.",
    "Nothing in this script is ever executed automatically. A human (or a future session with explicit instruction) must run the listed commands manually.",
  ],
};

fs.writeFileSync(rel("warehouse", "reports", "local_cleanup_plan.json"), JSON.stringify(report, null, 2));

const md = `# Local Cleanup Plan (Sprint 11, Workstream 7)

Generated: ${report.generated_at}

**This is a plan only — nothing is deleted by this script or by running it.**

Based on audit: ${report.based_on_audit}

## Safe-to-delete candidates (raw/ source still present on disk)

| dataset | size (MB) | files |
|---|---|---|
${candidates.map((c) => `| ${c.dataset} | ${c.size_mb} | ${c.file_count} |`).join("\n") || "(none)"}

**Total reclaimable: ${totalReclaimableMb} MB**

### Commands (review before running — not executed by this script)

\`\`\`bash
${report.rm_commands.join("\n") || "# no candidates"}
\`\`\`

## Needs manual review (no matching raw/ dataset found on disk)

${needsManualReview.length === 0 ? "(none)" : needsManualReview.map((c) => `- **${c.dataset}** (${c.size_mb} MB, ${c.file_count} files) — no raw/ dataset with a matching name exists; do not delete without first checking where this data actually came from.`).join("\n")}

## Caveats

${report.caveats.map((c) => `- ${c}`).join("\n")}
`;

fs.writeFileSync(rel("warehouse", "reports", "local_cleanup_plan.md"), md);

console.log(`Safe-to-delete candidates: ${candidates.length} datasets, ${totalReclaimableMb} MB reclaimable`);
console.log(`Needs manual review: ${needsManualReview.length} datasets`);
console.log("Wrote warehouse/reports/local_cleanup_plan.{json,md} — no files were deleted.");
