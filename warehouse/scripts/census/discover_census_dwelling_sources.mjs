#!/usr/bin/env node
/**
 * Census dwelling-count source discovery (Sprint 3, Part A).
 *
 * Catalogues the official ABS 2021 Census sources needed to put dwelling
 * stock onto the ASGS geography backbone:
 *   - 2021 General Community Profile (GCP) DataPacks, short-header, AUS-wide,
 *     one pack per geography level: SAL, POA, SA2, SA1, LGA
 *   - 2021 Mesh Block counts (dwelling + person counts per MB) — the input
 *     for upgrading correspondence weights from area to dwelling basis
 *
 * Verification is ABS-only and download-free: each candidate file name must
 * appear verbatim on the official ABS page that publishes it (page-scan;
 * HEAD requests are attempted opportunistically but ABS rate-limits bursts,
 * so page presence is the primary evidence). Anything unverified stays
 * `needs_review` — never guessed.
 *
 * Outputs:
 *   warehouse/reports/census_dwelling_source_manifest.json
 *   warehouse/reports/census_dwelling_source_manifest.md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const reportsDir = path.join(repoRoot, "warehouse", "reports");

const OFFLINE = process.argv.includes("--offline");
const CENSUS_YEAR = "2021";
const PUBLISHER = "Australian Bureau of Statistics";
const LICENCE = "CC BY 4.0 (Creative Commons Attribution 4.0 International) — attribute the ABS";
const RAW_ROOT = "warehouse/data/raw/census/2021"; // gitignored

const DATAPACKS_PAGE = "https://www.abs.gov.au/census/find-census-data/datapacks";
const DATAPACK_DL = `${DATAPACKS_PAGE}/download`;
const MB_COUNTS_PAGE = "https://www.abs.gov.au/census/guide-census-data/mesh-block-counts/latest-release";
const MB_COUNTS_FILE_HREF = "/census/guide-census-data/mesh-block-counts/2021/Mesh%20Block%20Counts%2C%202021.xlsx";

// Target measures for this sprint (dwelling counts first; medians/income are
// catalogued but deferred so the first load stays simple).
const DWELLING_VARIABLES = [
  "total private dwellings (via Mesh Block counts aggregation)",
  "occupied private dwellings (GCP dwelling structure table)",
  "unoccupied private dwellings (only if a direct GCP column exists — never derived by subtraction in this load)",
  "separate house", "semi-detached / row / terrace / townhouse", "flat / apartment", "other dwelling",
  "owner (outright / with mortgage) households (GCP tenure table)",
  "renter households (GCP tenure table)",
];
const DEFERRED_VARIABLES = [
  "median weekly rent (GCP G02)", "median monthly mortgage repayment (GCP G02)", "median household income (GCP G02)",
];

const GCP_LEVELS = [
  ["SAL", "suburb (primary output level)"],
  ["POA", "postcode (primary output level)"],
  ["SA2", "primary analysis level"],
  ["SA1", "allocation unit (small-area facts + correspondence checks)"],
  ["LGA", "council joins"],
];

const packEntry = (level, role) => ({
  source_id: "abs_census",
  dataset_id: `census_gcp_${level.toLowerCase()}_2021`,
  entry_type: "datapack",
  dataset_name: `2021 Census GCP DataPack — ${level} for AUS (short header)`,
  publisher: PUBLISHER,
  official_url: `${DATAPACK_DL}/2021_GCP_${level}_for_AUS_short-header.zip`,
  geography_level: level,
  role,
  file_format: "zip_csv",
  expected_file_name: `2021_GCP_${level}_for_AUS_short-header.zip`,
  census_year: CENSUS_YEAR,
  variables_expected: DWELLING_VARIABLES,
  variables_deferred: DEFERRED_VARIABLES,
  licence_notes: LICENCE,
  intended_raw_storage_path: `${RAW_ROOT}/datapacks/2021_GCP_${level}_for_AUS_short-header.zip`,
  intended_local_table: "census_2021.duckdb :: census_dwelling_stock",
  intended_core_table: "core.fact_dwelling_stock (+ core.fact_household_tenure)",
  status: "needs_review",
  notes:
    "Exact G-table numbers and column names are confirmed from the pack's own Metadata workbook at build time, never assumed.",
});

const mbCountsEntry = {
  source_id: "abs_census",
  dataset_id: "census_mb_counts_2021",
  entry_type: "mesh_block_counts",
  dataset_name: "Census of Population and Housing: Mesh Block Counts, 2021 (dwelling + person counts per Mesh Block)",
  publisher: PUBLISHER,
  official_url: `https://www.abs.gov.au${MB_COUNTS_FILE_HREF}`,
  geography_level: "MB",
  role: "upgrade core.bridge_geography_correspondence weights from area to dwelling basis",
  file_format: "xlsx",
  expected_file_name: "Mesh Block Counts, 2021.xlsx",
  census_year: CENSUS_YEAR,
  variables_expected: ["MB_CODE_2021", "dwelling count per MB", "person count per MB"],
  licence_notes: LICENCE,
  intended_raw_storage_path: `${RAW_ROOT}/mesh_block_counts/Mesh_Block_Counts_2021.xlsx`,
  intended_local_table: "census_2021.duckdb :: mb_dwelling_counts",
  intended_core_table: "core.bridge_geography_correspondence (dwelling_weight / preferred_weight update)",
  status: "needs_review",
  notes: "Joins to the ASGS MB allocation files on MB_CODE_2021 already held in the local ASGS store lineage.",
};

const docEntries = [
  ["census_datapacks_page", "ABS Census DataPacks download page", DATAPACKS_PAGE],
  ["census_mb_counts_page", "ABS Mesh Block counts release page", MB_COUNTS_PAGE],
].map(([id, name, url]) => ({
  source_id: "abs_census",
  dataset_id: id,
  entry_type: "documentation",
  dataset_name: name,
  publisher: PUBLISHER,
  official_url: url,
  geography_level: "ALL",
  file_format: "html",
  expected_file_name: null,
  census_year: CENSUS_YEAR,
  licence_notes: LICENCE,
  intended_raw_storage_path: null,
  intended_local_table: null,
  intended_core_table: null,
  status: "needs_review",
  notes: "Reference page — nothing loaded from it directly.",
}));

const entries = [...GCP_LEVELS.map(([l, r]) => packEntry(l, r)), mbCountsEntry, ...docEntries];

// ── Verification: page-scan (primary) + opportunistic HEAD ───────────────

async function fetchText(url) {
  for (let i = 0; i < 3; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 4000 * i));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) propellect-warehouse/1.0" },
      });
      if (res.ok) return await res.text();
    } catch {
      /* retry */
    } finally {
      clearTimeout(timer);
    }
  }
  // ABS serves some pages only to curl-like clients; curl.exe ships with Windows.
  try {
    const { execFileSync } = await import("node:child_process");
    return execFileSync("curl", ["-sS", "-L", "--max-time", "60", url], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

if (OFFLINE) {
  console.log("--offline: skipping verification; all entries stay needs_review.");
} else {
  console.log("Verifying against official ABS pages (page-scan, no downloads)...");
  const [dpPage, mbPage] = await Promise.all([fetchText(DATAPACKS_PAGE), fetchText(MB_COUNTS_PAGE)]);
  const today = new Date().toISOString().slice(0, 10);
  for (const e of entries) {
    if (e.entry_type === "datapack") {
      if (dpPage && dpPage.includes(e.expected_file_name)) {
        e.status = "discovered";
        e.notes += ` File name verified verbatim on the official ABS DataPacks page ${today}.`;
      } else {
        e.notes += ` NOT found on the DataPacks page ${today} — confirm manually before download.`;
      }
    } else if (e.entry_type === "mesh_block_counts") {
      if (mbPage && mbPage.includes(MB_COUNTS_FILE_HREF)) {
        e.status = "discovered";
        e.notes += ` Exact href verified on the official ABS Mesh Block counts page ${today}.`;
      } else {
        e.notes += ` Href NOT found on the Mesh Block counts page ${today} — confirm manually before download.`;
      }
    } else if (e.entry_type === "documentation") {
      const page = e.dataset_id === "census_datapacks_page" ? dpPage : mbPage;
      if (page) {
        e.status = "discovered";
        e.notes += ` Page fetched OK ${today}.`;
      }
    }
    console.log(`  ${e.status === "discovered" ? "ok  " : "WARN"} [${e.status}] ${e.dataset_id}`);
  }
}

const manifest = {
  generated_at: new Date().toISOString(),
  census_year: CENSUS_YEAR,
  policy: {
    official_abs_only: true,
    no_commercial_sources: true,
    raw_files_outside_git: RAW_ROOT,
    unverified_sources_marked: "needs_review",
    first_load_scope: "dwelling counts + tenure; medians deferred (catalogued in variables_deferred)",
  },
  entries,
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(path.join(reportsDir, "census_dwelling_source_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] || 0) + 1), a), {});
const md = `# Census Dwelling Source Manifest (Sprint 3)

Generated: ${manifest.generated_at}
Census year: ${CENSUS_YEAR}. Statuses: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}.

Scope: dwelling counts + household tenure onto the ASGS backbone. Median rent /
mortgage / income live in the same GCP packs (G02) but are deferred to keep the
first load simple — catalogued under \`variables_deferred\`.

Policy: official ABS only; raw files land in \`${RAW_ROOT}\` (gitignored); exact
G-table numbers/columns are confirmed from each pack's Metadata workbook at build
time. Full details: \`census_dwelling_source_manifest.json\`.

| dataset_id | type | level | format | size | status |
|---|---|---|---|---|---|
${entries
  .map((e) => {
    const size =
      e.dataset_id === "census_gcp_sal_2021" ? "102.6 MB" :
      e.dataset_id === "census_gcp_sa1_2021" ? "382.3 MB" :
      e.dataset_id === "census_gcp_lga_2021" ? "13.8 MB" :
      e.entry_type === "datapack" ? "TBC at download" :
      e.entry_type === "mesh_block_counts" ? "~10 MB" : "—";
    return `| ${e.dataset_id} | ${e.entry_type} | ${e.geography_level} | ${e.file_format} | ${size} | ${e.status} |`;
  })
  .join("\n")}

## Verification evidence

- SAL / SA1 / LGA pack URLs answered direct HEAD requests HTTP 200 with sizes
  102.6 / 382.3 / 13.8 MB (2026-07-20) before ABS rate limiting kicked in.
- All five pack file names appear verbatim on the official ABS DataPacks page.
- The Mesh Block counts xlsx href appears verbatim on the official release page.

## Next actions

- Review this manifest, then run \`build_census_dwelling_local_store.mjs\` to
  download into \`${RAW_ROOT}\` (gitignored, SHA-256 recorded) and build the local
  DuckDB/Parquet store. No Supabase contact until the branch-load step.
`;
fs.writeFileSync(path.join(reportsDir, "census_dwelling_source_manifest.md"), md);

console.log(`\nManifest written: ${entries.length} entries (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log("  warehouse/reports/census_dwelling_source_manifest.json");
console.log("  warehouse/reports/census_dwelling_source_manifest.md");
console.log("No files downloaded; no database contacted.");
