#!/usr/bin/env node
/**
 * Census demographics source discovery (Sprint 9, Phase 1).
 *
 * Verifies the three additional GCP tables (G01 population, G02 medians/
 * income, G35 household composition) exist in the SAME official ABS
 * DataPack files Sprint 3 already downloaded, hash-verified and extracted —
 * no new downloads, no re-extraction. Confirms expected columns are present
 * before any build script relies on them.
 *
 * Outputs:
 *   warehouse/reports/census_demographics_source_manifest.json
 *   warehouse/reports/census_demographics_source_manifest.md
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const reportsDir = path.join(repoRoot, "warehouse", "reports");
const RAW_DIR = path.join(repoRoot, "warehouse", "data", "raw", "census", "2021", "datapacks");
const PROCESSED_DIR = path.join(repoRoot, "warehouse", "data", "processed", "census", "2021");
const SPRINT3_INVENTORY = path.join(reportsDir, "census_dwelling_download_inventory.json");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const GEOS = [
  { level: "SAL", zip: "2021_GCP_SAL_for_AUS_short-header.zip", folder: "2021 Census GCP Suburbs and Localities for AUS" },
  { level: "POA", zip: "2021_GCP_POA_for_AUS_short-header.zip", folder: "2021 Census GCP Postal Areas for AUS" },
];
const TABLES = {
  G01: ["Tot_P_P"],
  G02: ["Median_age_persons", "Median_tot_hhd_inc_weekly", "Median_tot_prsnl_inc_weekly", "Median_tot_fam_inc_weekly", "Average_household_size", "Median_rent_weekly", "Median_mortgage_repay_monthly"],
  G35: ["Total_Total", "Total_FamHhold", "Num_Psns_UR_1_Total"],
};

if (!fs.existsSync(SPRINT3_INVENTORY)) fail("Sprint 3 census_dwelling_download_inventory.json missing — cannot confirm prior provenance");

console.log("Verifying G01/G02/G35 in the already-downloaded + already-extracted official ABS GCP DataPacks...");

const results = [];
for (const geo of GEOS) {
  const zipPath = path.join(RAW_DIR, geo.zip);
  const extractedDir = path.join(PROCESSED_DIR, geo.level, geo.folder);
  if (!fs.existsSync(zipPath)) fail(`${geo.zip} missing on disk — Sprint 3's raw file is expected to still be present`);
  if (!fs.existsSync(extractedDir)) fail(`${extractedDir} missing — Sprint 3's extracted DataPack is expected to still be present`);
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");

  const tableResults = {};
  for (const [table, expectedCols] of Object.entries(TABLES)) {
    const csvPath = path.join(extractedDir, `2021Census_${table}_AUST_${geo.level}.csv`);
    if (!fs.existsSync(csvPath)) {
      tableResults[table] = { found: false };
      continue;
    }
    const header = fs.readFileSync(csvPath, "utf8").split(/\r?\n/)[0].split(",");
    const missing = expectedCols.filter((c) => !header.includes(c));
    tableResults[table] = { found: true, columns_confirmed: expectedCols.length - missing.length, columns_expected: expectedCols.length, missing };
  }
  const allOk = Object.values(tableResults).every((t) => t.found && t.missing.length === 0);
  console.log(`  ${geo.level}: sha256 ${sha256.slice(0, 12)}... — ${Object.entries(tableResults).map(([t, r]) => `${t}:${r.found ? (r.missing.length === 0 ? "ok" : `MISSING ${r.missing.join(",")}`) : "NOT FOUND"}`).join(", ")}`);
  results.push({ level: geo.level, zip: geo.zip, sha256, extracted_dir: path.relative(repoRoot, extractedDir), tables: tableResults, verified: allOk });
}

const allVerified = results.every((r) => r.verified);
if (!allVerified) fail("one or more expected G01/G02/G35 columns not found — resolve before building the local store (hard stop)");

const manifestPath = path.join(reportsDir, "census_demographics_source_manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.generated_at = new Date().toISOString();
manifest.live_verification = results;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`\nAll G01/G02/G35 columns confirmed present for both SAL and POA.`);
console.log("Manifest updated with live verification evidence: warehouse/reports/census_demographics_source_manifest.json");
console.log("No new files downloaded, nothing re-extracted; no database contacted.");
