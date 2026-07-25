#!/usr/bin/env node
/**
 * ABS Total Value of Dwellings — Table 2 inventory checker (Sprint 12, Workstream 2).
 *
 * Discovered while investigating TAS/ACT/NT sales coverage: ABS's
 * "Residential Property Price Indexes: Eight Capital Cities" (cat. 6432.0)
 * ceased after the December 2021 issue, replaced by "Total Value of
 * Dwellings" — a live quarterly publication (confirmed: latest release
 * March Quarter 2026, released 9 June 2026) that continues median price
 * and transfer-count series per state/territory, split "capital city" vs
 * "rest of state" — exactly the ASGS GCCSA grain this project already has
 * loaded for every jurisdiction. This is the official-aggregate fallback
 * source for TAS/NT/ACT sales (mission Workstream 2, item 7 — "official
 * aggregate price series where transaction records are unavailable"),
 * since none of the three has a free bulk transaction-level source.
 *
 * Node's built-in fetch hit a repeatable ECONNRESET/SSL error against
 * abs.gov.au in this environment (a TLS-handshake/client quirk, not bot
 * protection — plain curl with a UA header succeeds reliably against the
 * same URL, confirmed live). Rather than fight that from inside a script,
 * this follows the same pattern already established for VIC's Cloudflare-
 * protected host (download_or_fetch_vic_sales.mjs): the actual fetch is a
 * manual/shell step, and this script's job is to verify what's on disk —
 * content-type-correct signature, plausible size, checksum — never to
 * trust an HTTP 200 blindly (this project's non-negotiable principle 8).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const RAW_DIR = path.join(repoRoot, "warehouse", "data", "raw", "abs_total_value_dwellings");

const SOURCE = {
  url: "https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings/mar-quarter-2026/643202.xlsx",
  file: "643202_table2_median_price_transfers_mar_qtr_2026.xlsx",
  page_url: "https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings/mar-quarter-2026",
  catalogue_number: "6432.0",
  reference_period: "March Quarter 2026",
  released: "2026-06-09",
  fetch_command_if_missing:
    'curl -sL -A "Mozilla/5.0 (research tool)" -o "warehouse/data/raw/abs_total_value_dwellings/643202_table2_median_price_transfers_mar_qtr_2026.xlsx" "https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings/mar-quarter-2026/643202.xlsx"',
};

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // xlsx is a zip container
const destPath = path.join(RAW_DIR, SOURCE.file);

if (!fs.existsSync(destPath)) {
  console.error(`MISSING: ${destPath}`);
  console.error(`Fetch it with:\n  ${SOURCE.fetch_command_if_missing}`);
  process.exit(1);
}

const buf = fs.readFileSync(destPath);
const isGenuineXlsx = buf.subarray(0, 4).equals(ZIP_MAGIC);
const plausibleSize = buf.length >= 10_000;
const sha256 = crypto.createHash("sha256").update(buf).digest("hex");

const inventory = {
  generated_at: new Date().toISOString(),
  source: SOURCE,
  file: SOURCE.file,
  raw_dir: "warehouse/data/raw/abs_total_value_dwellings (gitignored)",
  bytes: buf.length,
  sha256,
  validation: {
    file_signature_is_zip_xlsx: isGenuineXlsx,
    plausible_size: plausibleSize,
  },
  status: isGenuineXlsx && plausibleSize ? "present_verified" : "present_but_invalid — re-fetch, likely an HTML error page saved instead of the real file",
};
fs.mkdirSync(path.join(repoRoot, "warehouse", "reports"), { recursive: true });
fs.writeFileSync(path.join(repoRoot, "warehouse", "reports", "abs_tvd_download_inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
console.log(JSON.stringify(inventory, null, 2));

if (!isGenuineXlsx || !plausibleSize) {
  console.error("\nValidation failed — see status above.");
  process.exit(1);
}
console.log("\nWrote warehouse/reports/abs_tvd_download_inventory.json");
