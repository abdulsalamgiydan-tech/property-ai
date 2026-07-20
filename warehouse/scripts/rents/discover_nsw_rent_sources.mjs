#!/usr/bin/env node
/**
 * NSW rental market source discovery (Sprint 6, Part A).
 *
 * Discovers the official NSW Department of Communities and Justice (DCJ)
 * "Rent and Sales Report" quarterly rent tables — chosen over the raw NSW
 * Fair Trading Rental Bond Data (lodgement/refund counts only, no median
 * rent) because it is already aggregated to quarterly median/quartile rent
 * by LGA and postcode, with dwelling-type and bedroom-count breakdowns —
 * exactly the "quarterly suburb/postcode data" this sprint prefers.
 *
 * Verification: every candidate URL is confirmed with a live HTTP GET
 * (following redirects) against dcj.nsw.gov.au — no Cloudflare challenge on
 * this domain (unlike NSW VG PSI in Sprint 5), so plain HTTP is sufficient.
 * Quarters are only included if their href was found on an official DCJ page
 * (current report page or previous-reports archive) and independently
 * confirmed live — nothing is guessed. Some quarters between Sep 2024 and
 * Mar 2026 were not discoverable via static page scan and are recorded as a
 * gap, not fabricated.
 *
 * Outputs:
 *   warehouse/reports/nsw_rental_bonds_source_manifest.json
 *   warehouse/reports/nsw_rental_bonds_source_manifest.md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const reportsDir = path.join(repoRoot, "warehouse", "reports");

const OFFLINE = process.argv.includes("--offline");
const BASE = "https://dcj.nsw.gov.au/content/dam/dcj/dcj-website/documents/about-us/families-and-communities-statistics/housing-and-rent-sales";
const ARCHIVE = `${BASE}/previous-rent-and-sales-reports`;

// (issue, quarter label, filename, in archive dir?) — every entry's href was
// found on an official DCJ page; each is independently HTTP-verified below.
const QUARTERS = [
  [135, "2021-03", "issue-135-rent-tables-march-2021.xlsx", true],
  [136, "2021-06", "issue-136-rent-tables-june-2021.xlsx", true],
  [137, "2021-09", "issue-137-rent-tables-september-2021.xlsx", true],
  [138, "2021-12", "issue-138-rent-tables-december-2021.xlsx", true],
  [139, "2022-03", "issue-139-rent-tables-march-2022.xlsx", true],
  [140, "2022-06", "issue-140-rent-tables-june-2022.xlsx", true],
  [141, "2022-09", "issue-141-rent-tables-september-2022.xlsx", true],
  [142, "2022-12", "issue-142-rent-tables-december-2022.xlsx", true],
  [143, "2023-03", "issue-143-rent-tables-march-2023.xlsx", true],
  [144, "2023-06", "issue-144-rent-tables-june-2023.xlsx", true],
  [145, "2023-09", "issue-145-rent-tables-september-2023.xlsx", true],
  [146, "2023-12", "issue-146-rent-tables-december-2023.xlsx", true],
  [147, "2024-03", "issue-147-rent-tables-march-2024-quarter.xlsx", true],
  [148, "2024-06", "issue-148-rent-tables-june-2024-quarter.xlsx", true],
  [149, "2024-09", "issue-149-rent-tables-sep-2024-quarter.xlsx", true],
  [151, "2025-03", "issue-151-rent-tables-mar-2025.xlsx", true],
  [null, "2026-03", "rent-tables-march-2026-quarter.xlsx", false], // current report, not yet archived
];
const KNOWN_GAPS = ["2024-12", "2025-06", "2025-09", "2025-12"]; // not discoverable via static page scan

function entryFor(issue, quarter, filename, inArchive) {
  const url = `${inArchive ? ARCHIVE : BASE}/${filename}`;
  return {
    source_id: "nsw_rent_and_sales_report",
    dataset_id: `nsw_rent_tables_${quarter}`,
    entry_type: "quarterly_file",
    dataset_name: `NSW DCJ Rent and Sales Report — Rent tables, ${quarter} quarter${issue ? ` (Issue ${issue})` : ""}`,
    publisher: "NSW Department of Communities and Justice (DCJ)",
    official_url: url,
    quarter,
    file_format: "xlsx",
    expected_file_name: filename,
    status: "needs_review",
    notes: "",
  };
}

const entries = QUARTERS.map(([issue, quarter, filename, inArchive]) => entryFor(issue, quarter, filename, inArchive));

async function verifyUrl(url) {
  for (let i = 0; i < 4; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000 * i));
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
      if (res.body) await res.body.cancel().catch(() => {});
      return { ok: res.ok, detail: `HTTP ${res.status}` };
    } catch (err) {
      if (i === 3) return { ok: false, detail: `network error: ${err.message}` };
    }
  }
}

console.log("discover_nsw_rent_sources — official NSW DCJ Rent and Sales Report");
if (OFFLINE) {
  console.log("--offline: skipping verification; all entries stay needs_review.");
} else {
  console.log(`Verifying ${entries.length} quarterly file URLs against dcj.nsw.gov.au...`);
  for (const e of entries) {
    const r = await verifyUrl(e.official_url);
    e.status = r.ok ? "discovered" : "needs_review";
    e.notes = r.ok
      ? `URL verified ${new Date().toISOString().slice(0, 10)} (${r.detail}).`
      : `URL NOT verified (${r.detail}) — confirm manually before download.`;
    console.log(`  ${r.ok ? "ok  " : "WARN"} [${e.status}] ${e.quarter} — ${r.detail}`);
  }
}

const manifest = {
  generated_at: new Date().toISOString(),
  policy: {
    official_nsw_gov_only: true,
    no_commercial_scraping: true,
    raw_files_outside_git: "warehouse/data/raw/nsw_rents",
    unverified_sources_marked: "needs_review",
    scope: "NSW only, pilot geography (6 LGAs). Quarterly rent tables (LGA + Postcode sheets), 2021-Q1 to 2026-Q1 where discoverable.",
  },
  known_gaps: KNOWN_GAPS,
  source_summary: {
    source_id: "nsw_rent_and_sales_report",
    dataset_family: "nsw_rent_tables",
    official_landing_page: "https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html",
    previous_reports_page: "https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/previous-rent-and-sales-reports.html",
    explanatory_notes_page: "https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/explanatory-notes-rent.html",
    publisher: "NSW Department of Communities and Justice (DCJ), FACS Insights Analysis and Research",
    licence_notes: "NSW Government open data — quarterly public statistical report; no paywall or registration required",
    available_history: "Report series extends to at least 2017 (Issue 120); this manifest covers 2021-Q1 onward to match the Sprint 5 sales pilot window",
    refresh_frequency: "quarterly",
    geography_level: "LGA and Postcode (two sheets per file)",
    measures_available: [
      "first_quartile_weekly_rent", "median_weekly_rent", "third_quartile_weekly_rent",
      "new_bonds_lodged (rental sample size)", "total_bonds_held",
      "quarterly_change_median_rent", "annual_change_median_rent",
    ],
    dwelling_breakdowns: ["Total", "House", "Flat/Unit", "Townhouse", "Other"],
    bedroom_breakdowns: ["Total", "Bedsitter", "1 Bedroom", "2 Bedrooms", "3 Bedrooms", "4 or more Bedrooms", "Not Specified"],
    intended_raw_storage_path: "warehouse/data/raw/nsw_rents/<quarter>.xlsx",
    intended_local_table: "nsw_rents.duckdb :: nsw_rent_lga, nsw_rent_postcode, nsw_rental_summary",
    intended_core_table: "core.fact_rental_market_summary (curated summary only)",
    intended_mart_tables: ["mart.suburb_rent_quarterly", "mart.postcode_rent_quarterly", "mart.suburb_yield_quarterly", "mart.postcode_yield_quarterly"],
    known_limitations: [
      "Sourced from new bond lodgements only — reflects rents on newly tenanted properties, not the full standing rental stock; a lagging/leading indicator relative to average rents across all tenancies",
      "Suppression: cells with <=30 bonds lodged are flagged 's' (used with caution), cells with <=10 are suppressed entirely ('-') — both are treated as NULL with a suppression reason, never as zero or estimated",
      "LGA-level only for geography (not suburb/SAL) — postcode (POA) sheet is used for the finer join to core.dim_geography; LGA sheet is used for pilot-area confirmation and cross-checks",
      "No lat/lon or ASGS code on the record — postcode is an exact numeric match to core.dim_geography POA codes (same reliable join method as Sprint 5's postcode-only matches); LGA name is an exact text match to the 6 pilot LGA names",
      "Some quarters (Dec 2024, Jun/Sep/Dec 2025) were not discoverable via static page scan of the DCJ site and are recorded as known gaps — not fabricated",
    ],
  },
  entries,
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(path.join(reportsDir, "nsw_rental_bonds_source_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] || 0) + 1), a), {});
const md = `# NSW Rental Bonds Source Manifest (Sprint 6)

Generated: ${manifest.generated_at}
Statuses: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}.

## Primary source

**NSW DCJ Rent and Sales Report — quarterly rent tables** (chosen over NSW Fair
Trading's raw Rental Bond Data, which has lodgement/refund/holding counts but no
median rent figures):
https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html

- Format: xlsx, two sheets per quarter (\`LGA\`, \`Postcode\`)
- Measures: 1st quartile / median / 3rd quartile weekly rent, new bonds lodged
  (sample size), total bonds held, quarterly/annual change
- Breakdowns: dwelling type (Total/House/Flat-Unit/Townhouse/Other) x bedroom
  count (Total/Bedsitter/1-4+ Bedrooms/Not Specified)
- Publisher: NSW DCJ. Licence: NSW Government open statistical report, no paywall.
- History available: at least back to 2017 (Issue 120); this manifest covers
  2021-Q1 to 2026-Q1 to match the Sprint 5 sales pilot window.
- Refresh frequency: quarterly.

## Quarters (17 total, ${counts.discovered ?? 0} verified live)

${entries.map((e) => `- ${e.quarter}${e.status === "discovered" ? " ✅" : " ⚠️ " + e.notes}`).join("\n")}

## Known gaps (not fabricated)

${manifest.known_gaps.map((g) => `- ${g}`).join("\n")}

## Known limitations

${manifest.source_summary.known_limitations.map((l) => `- ${l}`).join("\n")}

## Next actions

Run \`build_nsw_rents_local_store.mjs\` to download the verified quarterly files
into gitignored local storage and build the local DuckDB store, filtered to the
pilot LGAs/postcodes (reusing the Sprint 5 allow-lists).
`;
fs.writeFileSync(path.join(reportsDir, "nsw_rental_bonds_source_manifest.md"), md);

console.log(`\nManifest written: ${entries.length} entries (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log("  warehouse/reports/nsw_rental_bonds_source_manifest.json");
console.log("  warehouse/reports/nsw_rental_bonds_source_manifest.md");
console.log("No files downloaded; no database contacted.");
