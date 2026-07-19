#!/usr/bin/env node
/**
 * ASGS backbone loader — DRY-RUN ONLY (Sprint 2, Part B).
 *
 * This script currently only *describes and verifies* the load plan. It has
 * no database code and no download code; running it changes nothing anywhere.
 * The real implementation lands only after the plan and inputs are approved,
 * and will target the warehouse-validation Supabase branch — never production.
 *
 * Plan reference: warehouse/docs/SPRINT_2_ASGS_GEOGRAPHY_BACKBONE.md
 * Inputs (future): warehouse/reports/asgs_source_manifest.json (reviewed),
 *   raw ABS files in warehouse/data/raw/asgs/ (gitignored), DB connection
 *   from environment variables (never printed, never committed).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const RAW_DIR = "warehouse/data/raw/asgs";
const MANIFEST = "warehouse/reports/asgs_source_manifest.json";

const LOAD_SEQUENCE = [
  ["read raw", `Read raw ABS files from ${RAW_DIR}/ (gitignored; downloaded only after manifest review)`],
  ["preserve", "Preserve originals untouched outside git; re-downloads go to a new dated folder, never overwrite"],
  ["hash", "SHA-256 hash every file into meta.source_file (url, format, period, hash) under a meta.load_run"],
  ["stage geographies", "Load boundary files into staging.asgs_geography (typed, raw_attributes jsonb kept)"],
  ["stage correspondences", "Load SA1 allocation files into staging.asgs_correspondence; derive SA2->SAL/POA/LGA by aggregation"],
  ["transform geometry", "ST_Transform source geometries (GDA2020/GDA94) to EPSG:4326; ST_IsValid failures quarantined, not fixed"],
  ["load dim", "Upsert core.dim_geography on (geography_type, geography_code, boundary_version); parents only within SA1->...->STATE"],
  ["load hierarchy", "Insert containment rows into core.bridge_geography_relationship (verified by join, not code parsing)"],
  ["load correspondence", "Insert weighted rows into core.bridge_geography_correspondence (dwelling > population > area; method + confidence recorded)"],
  ["quality results", "Write every gate outcome to meta.data_quality_result (duplicates=0, invalid geoms quarantined, weights reconcile ±0.001, NULLs stay NULL)"],
  ["coverage results", "Write expected-vs-actual area counts per level to meta.coverage_result; gaps documented, never zero-filled"],
];

console.log("load_asgs_backbone — DRY RUN (no database, no downloads, no changes)\n");

console.log("Planned load sequence:");
LOAD_SEQUENCE.forEach(([step, detail], i) => {
  console.log(`  ${String(i + 1).padStart(2)}. [${step}] ${detail}`);
});

console.log("\nPreflight status:");
const manifestPath = path.join(repoRoot, MANIFEST);
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const counts = manifest.entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`  manifest: ${manifest.entries.length} entries (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
  const unresolved = manifest.entries.filter((e) => e.status !== "discovered");
  for (const e of unresolved) console.log(`    needs_review: ${e.dataset_id}`);
} else {
  console.log(`  manifest: MISSING — run discover_asgs_sources.mjs first`);
}
const rawDir = path.join(repoRoot, RAW_DIR);
console.log(
  fs.existsSync(rawDir)
    ? `  raw dir: ${RAW_DIR} exists`
    : `  raw dir: ${RAW_DIR} not present yet (created at download time; gitignored)`
);

console.log("\nBlocked until approved:");
console.log("  - downloading boundary/allocation files (large; land outside git)");
console.log("  - any database write (target: warehouse-validation branch ONLY, never production)");
console.log("\nDry run complete — nothing was downloaded, contacted or changed.");
