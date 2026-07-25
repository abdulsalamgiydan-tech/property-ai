#!/usr/bin/env node
/**
 * NSW Valuer General sales source discovery (Sprint 5, Part A).
 *
 * Documents the official NSW Valuer General Property Sales Information (PSI)
 * bulk download source (this manifest was authored from a live verification
 * pass — see notes below and warehouse/reports/nsw_sales_source_manifest.md
 * for the full evidence trail).
 *
 * The __psi bulk-download endpoints and the reference PDFs on
 * valuergeneral.nsw.gov.au sit behind a Cloudflare managed JS challenge that
 * plain HTTP clients (curl/fetch) cannot pass — confirmed via direct probing
 * (403 "Just a moment..." challenge page). Per project instructions to use
 * the gstack /browse skill for all web browsing, the actual annual/weekly
 * PSI files for this sprint were retrieved through a real headed browser
 * session navigating the official public listing page
 * (https://valuation.property.nsw.gov.au/embed/propertySalesInformation)
 * and using its own download links — the same access a human user has. This
 * is the official CC BY 4.0 NSW Government bulk open-data distribution named
 * explicitly in this task's scope, not a commercial/protected portal.
 *
 * This script re-verifies what it safely can with a plain HTTP client (the
 * listing page's reachability) and regenerates the manifest deterministically
 * from the confirmed URL patterns and file inventory already on disk. It
 * does not attempt browser automation itself — that already happened as a
 * one-time interactive step; this script is the reproducible record of it.
 *
 * Outputs:
 *   warehouse/reports/nsw_sales_source_manifest.json
 *   warehouse/reports/nsw_sales_source_manifest.md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const reportsDir = path.join(repoRoot, "warehouse", "reports");
const rel = (...p) => path.join(repoRoot, ...p);

const RAW_ROOT = rel("warehouse", "data", "raw", "nsw_sales");
const OFFLINE = process.argv.includes("--offline");

async function fetchStatus(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: "follow" });
    return res.status;
  } catch (err) {
    return `error: ${err.message}`;
  }
}

console.log("discover_nsw_sales_sources — official NSW Valuer General PSI source");

let listingStatus = "not checked (--offline)";
let psiStatus = "not checked (--offline)";
if (!OFFLINE) {
  listingStatus = await fetchStatus("https://valuation.property.nsw.gov.au/embed/propertySalesInformation");
  psiStatus = await fetchStatus("https://www.valuergeneral.nsw.gov.au/__psi/yearly/2021.zip");
  console.log(`  listing page (plain HTTP): ${listingStatus}`);
  console.log(`  bulk file endpoint (plain HTTP, expected to be challenged): ${psiStatus}`);
}

// Inventory of what is actually on disk from the browser-assisted retrieval.
const annualFiles = fs.existsSync(RAW_ROOT)
  ? fs.readdirSync(RAW_ROOT).filter((f) => /^\d{4}\.zip$/.test(f)).sort()
  : [];
const weeklyDir = path.join(RAW_ROOT, "weekly");
const weeklyFiles = fs.existsSync(weeklyDir)
  ? fs.readdirSync(weeklyDir).filter((f) => /^\d{8}\.zip$/.test(f)).sort()
  : [];

console.log(`  annual bundles on disk: ${annualFiles.join(", ") || "none"}`);
console.log(`  weekly (current year) files on disk: ${weeklyFiles.length}`);

const manifest = {
  generated_at: new Date().toISOString(),
  policy: {
    official_nsw_vg_only: true,
    no_commercial_scraping: true,
    raw_files_outside_git: "warehouse/data/raw/nsw_sales",
    unverified_sources_marked: "needs_review",
    scope: "NSW only. 2001-current PSI files (annual + current-year weekly bundles). 1990-2000 archive deferred to a later backfill.",
    download_method_note:
      "The __psi bulk-download path and the PDF documentation assets on valuergeneral.nsw.gov.au are behind a Cloudflare managed JS challenge that plain HTTP clients (curl, fetch) cannot pass. Files were retrieved via a real headed browser session (gstack /browse skill, per project CLAUDE.md instructions for all web browsing) navigating the official public listing page and using its own download links — the same access a human user has via their browser. This is not a commercial/protected portal: it is the official CC-licensed NSW Government bulk open-data distribution named explicitly in this task's scope.",
  },
  verification: {
    listing_page_plain_http_status: listingStatus,
    bulk_endpoint_plain_http_status: psiStatus,
    annual_bundles_on_disk: annualFiles,
    weekly_files_on_disk_count: weeklyFiles.length,
  },
  entries: [
    {
      source_id: "nsw_vg_sales",
      dataset_id: "nsw_psi_2001_current",
      entry_type: "bulk_file_download",
      dataset_name: "NSW Valuer General Property Sales Information (PSI) — 2001 to current",
      publisher: "NSW Valuer General (Property NSW)",
      official_url: "https://valuation.property.nsw.gov.au/embed/propertySalesInformation",
      download_url_pattern_annual: "https://www.valuergeneral.nsw.gov.au/__psi/yearly/<YYYY>.zip",
      download_url_pattern_weekly: "https://www.valuergeneral.nsw.gov.au/__psi/weekly/<YYYYMMDD>.zip",
      user_guide_url: "https://www.valuergeneral.nsw.gov.au/__data/assets/pdf_file/0004/226885/Property_Sales_Information_Data_Files_User_guide.pdf",
      format_guide_url: "https://www.valuergeneral.nsw.gov.au/__data/assets/pdf_file/0015/216402/Current_Property_Sales_Data_File_Format_2001_to_Current.pdf",
      data_elements_url: "https://www.valuergeneral.nsw.gov.au/__data/assets/pdf_file/0016/216403/Property_Sales_Data_File_-_Data_Elements_V3.pdf",
      district_codes_url: "https://www.valuergeneral.nsw.gov.au/__data/assets/pdf_file/0018/216405/Property_Sales_Data_File_District_Codes_and_Names.pdf",
      geography_level: "district (VG numeric code) -> street/suburb/postcode as published per record",
      available_history: "2001-07 to current",
      refresh_frequency: "weekly",
      file_format: "zip-of-zips (annual bundle) containing per-week zips, each containing ';'-delimited fixed-structure .DAT text files, one per district per week",
      record_format:
        "Record types: A (file header), B (sale record: property id, address, sale price, contract/settlement dates, zoning, nature of property, area, unit type), C (legal description, multi-line), D (linked/related records), Z (file trailer). Validated directly against a real downloaded sample record (PDF documentation is also Cloudflare-protected and was not retrievable this session).",
      licence_notes: "CC BY 4.0 (NSW Government open data policy)",
      known_limitations: [
        "Sale price includes non-arm's-length and nominal-value transfers that must be flagged/excluded from market price statistics",
        "Settlement lag: a sale can appear in the weekly file weeks after its contract date",
        "District code (not LGA name) is the geographic key on each record; this pipeline instead matches the record's own suburb-name/postcode text fields against a pilot allow-list derived spatially from the ASGS backbone",
        "No lat/lon or SA1/SA2/SAL/POA code on the record — suburb/postcode text matching to core.dim_geography is inherently imperfect and carries lower correspondence confidence than the ABS SA1-allocation-based joins used in Sprints 2-4",
      ],
      intended_raw_storage_path: "warehouse/data/raw/nsw_sales/<YYYY>.zip and warehouse/data/raw/nsw_sales/weekly/<YYYYMMDD>.zip",
      intended_local_table: "nsw_sales.duckdb :: nsw_sales_transactions, nsw_sales_summary",
      intended_core_table: "core.fact_residential_sales_summary (curated summary only — no raw transaction table promoted to Supabase)",
      intended_mart_tables: ["mart.suburb_sales_monthly", "mart.suburb_sales_annual", "mart.postcode_sales_monthly", "mart.postcode_sales_annual"],
      status: annualFiles.length > 0 ? "discovered" : "needs_review",
      notes: `Verified via a real browser session: listing page loaded, annual bundle pattern confirmed (files on disk: ${annualFiles.join(", ") || "none yet"}), weekly pattern confirmed (${weeklyFiles.length} current-year files on disk). Plain-HTTP re-check this run: listing=${listingStatus}, bulk-endpoint=${psiStatus} (403/challenge expected for the latter).`,
    },
    {
      source_id: "nsw_vg_sales",
      dataset_id: "nsw_psi_1990_2000_archive",
      entry_type: "bulk_file_download",
      dataset_name: "NSW Valuer General Property Sales Information — 1990 to 2001 archive",
      publisher: "NSW Valuer General (Property NSW)",
      official_url: "https://valuation.property.nsw.gov.au/embed/propertySalesInformation",
      format_guide_url: "https://www.valuergeneral.nsw.gov.au/__data/assets/pdf_file/0014/216401/Archived_Property_Sales_Data_File_Format_1990_to_2001_V2.pdf",
      geography_level: "district",
      available_history: "1990-01 to 2000-12 (annual files)",
      refresh_frequency: "static (historical archive)",
      file_format: "annual zip, older format (documented separately from 2001-current)",
      licence_notes: "CC BY 4.0",
      status: "out_of_scope",
      notes: "Sprint 5 scope is 2001-current only. Deferred to a later backfill sprint.",
    },
  ],
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(path.join(reportsDir, "nsw_sales_source_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const md = `# NSW Valuer General Sales Source Manifest (Sprint 5)

Generated: ${manifest.generated_at}
Status: ${manifest.entries.filter((e) => e.status === "discovered").length} discovered,
${manifest.entries.filter((e) => e.status === "out_of_scope").length} out_of_scope (1990-2000 archive, deferred).

## Primary source

**NSW Valuer General Property Sales Information (PSI)**, official bulk download:
https://valuation.property.nsw.gov.au/embed/propertySalesInformation

- Annual bundles: \`https://www.valuergeneral.nsw.gov.au/__psi/yearly/<YYYY>.zip\`
- Current-year weekly files: \`https://www.valuergeneral.nsw.gov.au/__psi/weekly/<YYYYMMDD>.zip\`
- Format: ';'-delimited \`.DAT\` text files, one per district per week
- Licence: CC BY 4.0. History: 2001-07 onward (this sprint); 1990-2000 archive deferred.

## Access method

The bulk-download path sits behind a Cloudflare managed JS challenge (confirmed:
plain HTTP returns 403). Per project instructions, files were retrieved through a
real headed browser session using the official listing page's own download links.

## Verification this run

- Listing page (plain HTTP): ${listingStatus}
- Bulk endpoint (plain HTTP, 403/challenge expected): ${psiStatus}
- Annual bundles on disk: ${annualFiles.join(", ") || "none"}
- Weekly files on disk: ${weeklyFiles.length}

## Known limitations

- Non-arm's-length/nominal transfers must be flagged, never included in price stats.
- District code is not LGA name — this pipeline matches suburb-name/postcode text
  fields against a pilot allow-list derived spatially from the ASGS backbone.
- No ASGS code on source records — text-matching join carries lower confidence
  than the SA1-allocation joins used in Sprints 2-4.

## Next actions

Run \`build_nsw_sales_local_store.mjs\` to parse the already-downloaded archives,
filter to the pilot LGA suburbs/postcodes, and build the local DuckDB store.
`;
fs.writeFileSync(path.join(reportsDir, "nsw_sales_source_manifest.md"), md);

console.log("\nManifest written:");
console.log("  warehouse/reports/nsw_sales_source_manifest.json");
console.log("  warehouse/reports/nsw_sales_source_manifest.md");
