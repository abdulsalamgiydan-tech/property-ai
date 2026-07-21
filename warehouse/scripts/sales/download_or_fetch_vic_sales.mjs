#!/usr/bin/env node
/**
 * Victoria VPSR sales raw-file inventory checker (Sprint 10, Phase 5).
 *
 * VPSR's file host (www.land.vic.gov.au) sits behind a Cloudflare JS
 * challenge that a headless script cannot pass (confirmed: plain HTTPS and
 * default headless browser navigation both return HTTP 403 / a challenge
 * page). The project's established resolution is a headed browser session
 * via gstack's /browse skill (same technique used for NSW's
 * valuergeneral.nsw.gov.au in Sprint 5) — an interactive step, not one this
 * script automates.
 *
 * This script instead verifies what's already on disk: computes SHA-256 for
 * each expected raw file, confirms it's a genuine OLE2 document (not an
 * HTML challenge page), and reports what's missing with the exact command
 * to fetch it.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const RAW_DIR = path.join(repoRoot, "warehouse", "data", "raw", "vic_sales", "vpsr");

const EXPECTED = [
  { file: "median_house_q4_2025.xls", url: "https://www.land.vic.gov.au/__data/assets/excel_doc/0030/773742/median-house-q4-2025.xls" },
  { file: "median_unit_q4_2025.xls", url: "https://www.land.vic.gov.au/__data/assets/excel_doc/0031/773743/median-unit-q4-2025.xls" },
  { file: "median_land_q4_2025.xls", url: "https://www.land.vic.gov.au/__data/assets/excel_doc/0032/773744/median-land-q4-2025.xls" },
];

const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const results = [];
for (const { file, url } of EXPECTED) {
  const filePath = path.join(RAW_DIR, file);
  if (!fs.existsSync(filePath)) {
    results.push({ file, status: "missing", url, fetch_command: `gstack /browse --headed download "${url}" "${filePath}" --navigate` });
    continue;
  }
  const buf = fs.readFileSync(filePath);
  const isGenuine = buf.subarray(0, 8).equals(OLE2_MAGIC);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  results.push({
    file,
    status: isGenuine ? "present_verified" : "present_but_not_ole2 — likely a Cloudflare challenge page, re-fetch",
    bytes: buf.length,
    sha256,
    url,
  });
}

console.log(JSON.stringify({ generated_at: new Date().toISOString(), raw_dir: "warehouse/data/raw/vic_sales/vpsr (gitignored)", results }, null, 2));

const missing = results.filter((r) => r.status !== "present_verified");
if (missing.length > 0) {
  console.error(`\n${missing.length} file(s) missing or invalid — see fetch_command above for each.`);
  process.exit(1);
}
console.log("\nAll expected VPSR raw files present and verified as genuine OLE2 documents.");
