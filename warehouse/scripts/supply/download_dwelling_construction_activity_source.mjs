#!/usr/bin/env node
/**
 * ABS Building Activity Survey — commencements/completions inventory
 * checker (Sprint 12, Workstream 3).
 *
 * Fills 2 of the top-priority national supply gaps from the Sprint 12
 * checkpoint: dwelling commencements and completions. cat. 8752.0
 * "Building Activity, Australia", Tables 36 (commencements, Original,
 * states/territories) and 39 (completions, same grain), current release
 * March 2026 quarter.
 *
 * Same pattern as download_abs_tvd_source.mjs (Sprint 12 WS2): Node's
 * built-in fetch is unreliable against abs.gov.au in this environment
 * (transient TLS/connection errors), plain curl with a UA header is
 * reliable — this script verifies what's already on disk rather than
 * fetching it itself.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const RAW_DIR = path.join(repoRoot, "warehouse", "data", "raw", "abs_building_activity");

const SOURCES = [
  {
    table: "36",
    file: "table36.xlsx",
    title: "Number of Dwelling Unit Commencements by Sector, States and Territories: Original",
    stage: "commenced",
    url: "https://www.abs.gov.au/statistics/industry/building-and-construction/building-activity-australia/mar-2026/87520036.xlsx",
  },
  {
    table: "39",
    file: "table39.xlsx",
    title: "Number of Dwelling Unit Completions by Sector, States and Territories: Original",
    stage: "completed",
    url: "https://www.abs.gov.au/statistics/industry/building-and-construction/building-activity-australia/mar-2026/87520039.xlsx",
  },
];

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const results = [];
for (const s of SOURCES) {
  const destPath = path.join(RAW_DIR, s.file);
  if (!fs.existsSync(destPath)) {
    results.push({ ...s, status: "missing", fetch_command: `curl -sL -A "Mozilla/5.0 (research tool)" -o "warehouse/data/raw/abs_building_activity/${s.file}" "${s.url}"` });
    continue;
  }
  const buf = fs.readFileSync(destPath);
  const isGenuine = buf.subarray(0, 4).equals(ZIP_MAGIC);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  results.push({ ...s, status: isGenuine && buf.length > 10000 ? "present_verified" : "present_but_invalid", bytes: buf.length, sha256 });
}

console.log(JSON.stringify({ generated_at: new Date().toISOString(), raw_dir: "warehouse/data/raw/abs_building_activity (gitignored)", results }, null, 2));
fs.mkdirSync(path.join(repoRoot, "warehouse", "reports"), { recursive: true });
fs.writeFileSync(path.join(repoRoot, "warehouse", "reports", "abs_dwelling_construction_activity_download_inventory.json"), JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2) + "\n");

const bad = results.filter((r) => r.status !== "present_verified");
if (bad.length > 0) {
  console.error(`\n${bad.length} file(s) missing or invalid.`);
  process.exit(1);
}
