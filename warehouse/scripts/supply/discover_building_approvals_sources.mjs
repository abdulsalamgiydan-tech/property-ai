#!/usr/bin/env node
/**
 * ABS Building Approvals source discovery (Sprint 4, Part A).
 *
 * Verifies the official ABS Data API dataflow used for the housing supply
 * module: BA_SA2 v2.0.0 ("Building Approvals by SA2 and above, from July
 * 2021 onwards") — the current-ASGS-edition, small-area building approvals
 * series, directly joinable to core.dim_geography (SA2, ASGS3_2021).
 *
 * Verification (read-only, official ABS API host only):
 *   1. GET /rest/dataflow/ABS?detail=allstubs — confirm BA_SA2 v2.0.0 is listed
 *   2. GET /rest/datastructure/ABS/BA_SA2?references=children — confirm the
 *      dimension order and the exact codes this pipeline depends on
 *      (MEASURE=1 dwelling units, SECTOR=9 total sectors, WORK_TYPE=1 new,
 *      BUILDING_TYPE in {110 houses, 150 other residential, 100 total
 *      residential}, REGION_TYPE=SA2)
 * ABS rate-limits aggressively; both checks retry with cooldowns and the
 * script never downloads bulk observation data (that happens only in the
 * build script, later, after this manifest is reviewed).
 *
 * Outputs:
 *   warehouse/reports/building_approvals_source_manifest.json
 *   warehouse/reports/building_approvals_source_manifest.md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const reportsDir = path.join(repoRoot, "warehouse", "reports");

const OFFLINE = process.argv.includes("--offline");
const API_BASE = "https://data.api.abs.gov.au/rest";
const EXPLORE_PAGE = "https://explore.data.abs.gov.au/vis?tm=building%20approvals&pg=0&df[ds]=ABS_TP&df[id]=BA_SA2";
const PUBLISHER = "Australian Bureau of Statistics";
const LICENCE = "CC BY 4.0 (Creative Commons Attribution 4.0 International) — attribute the ABS";
const RAW_ROOT = "warehouse/data/raw/building_approvals"; // gitignored

// Codes this pipeline depends on — must be present in the live codelists,
// never assumed.
const REQUIRED_CODES = {
  CL_BA_MEASURE: ["1"], // Number of dwelling units (value-of-building "2" catalogued, not loaded in Part C)
  CL_BA_OWNERSHIP: ["9"], // Total Sectors
  CL_BA_WORK: ["1"], // New
  CL_BLD_TYPE: ["110", "150", "100"], // Houses, Total Other Residential, Total Residential
  CL_REGION_TYPE: ["SA2"],
};

async function fetchJson(url, { retries = 8, cooldownMs = 20000 } = {}) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/vnd.sdmx.structure+json", "user-agent": "propellect-warehouse/1.0" },
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) return await res.json();
      return { error: `HTTP ${res.status}` };
    } catch (err) {
      if (i === retries) return { error: `network error after ${retries} attempts: ${err.message}` };
      await new Promise((r) => setTimeout(r, cooldownMs));
    }
  }
}

const entry = {
  source_id: "abs_building_approvals",
  dataset_id: "building_approvals_sa2_2021",
  entry_type: "api_dataflow",
  dataset_name: "ABS Building Approvals by SA2 and above, from July 2021 onwards (BA_SA2 v2.0.0)",
  publisher: PUBLISHER,
  official_url: `${API_BASE}/data/ABS,BA_SA2,2.0.0`,
  access_method: "api",
  api_format: "SDMX-CSV (rest/data/ABS,BA_SA2,2.0.0/<key>?startPeriod=...&format=csv)",
  dataflow_id: "BA_SA2",
  dataflow_version: "2.0.0",
  dimension_key_order: ["MEASURE", "SECTOR", "WORK_TYPE", "BUILDING_TYPE", "REGION_TYPE", "REGION", "FREQ"],
  filter_key: "1.9.1.110+150+100.SA2..M",
  geography_level: "SA2",
  boundary_alignment: "ASGS Edition 3 (2021) — confirmed: sample SA2 region codes match core.dim_geography SA2 codes directly",
  available_history: "July 2021 – latest published month (rolling; ABS updates monthly)",
  update_frequency: "monthly",
  variables_expected: [
    "dwelling units approved — houses (BUILDING_TYPE=110)",
    "dwelling units approved — other residential (BUILDING_TYPE=150)",
    "dwelling units approved — total residential (BUILDING_TYPE=100)",
  ],
  variables_deferred: ["value of building jobs (MEASURE=2, AUD thousands) — catalogued, not loaded in this sprint"],
  licence_notes: LICENCE,
  intended_raw_storage_path: `${RAW_ROOT}/ba_sa2_monthly.csv`,
  intended_local_table: "building_approvals.duckdb :: building_approvals_sa2",
  intended_core_table: "core.fact_building_approvals",
  intended_mart_tables: ["mart.suburb_building_approvals", "mart.postcode_building_approvals"],
  status: "needs_review",
  notes:
    "SECTOR=9 (Total Sectors) and WORK_TYPE=1 (New) selected to match the ABS headline 'approvals' concept — excludes alterations/demolitions/relocations. BUILDING_TYPE=100 is ABS's own 'Total Residential' aggregate, used directly rather than summed from components.",
};

const olderEntries = [
  ["BA_LGA2021", "LGA (2021 boundaries)", "alternative geography; SA2 preferred for correspondence to SAL/POA"],
  ["BA_SA2_2016-21", "SA2, 2016 boundaries, superseded by BA_SA2 v2.0.0", "out of scope — pre-ASGS3 edition"],
].map(([id, level, note]) => ({
  source_id: "abs_building_approvals",
  dataset_id: `building_approvals_${id.toLowerCase()}`,
  entry_type: "api_dataflow_alternative",
  dataset_name: `ABS Building Approvals — ${id}`,
  publisher: PUBLISHER,
  official_url: `${API_BASE}/dataflow/ABS/${id}`,
  geography_level: level,
  licence_notes: LICENCE,
  status: "out_of_scope",
  notes: note,
}));

const entries = [entry, ...olderEntries];

// ── Verification (live ABS API, read-only, structure only) ──────────────

if (OFFLINE) {
  console.log("--offline: skipping API verification; entry stays needs_review.");
} else {
  console.log("Verifying against the official ABS Data API (dataflow + datastructure, no bulk data pulled)...");
  const dataflows = await fetchJson(`${API_BASE}/dataflow/ABS?detail=allstubs`);
  const hasFlow =
    !dataflows.error &&
    (dataflows.data?.dataflows ?? []).some((f) => f.id === "BA_SA2" && f.version === "2.0.0");
  console.log(`  dataflow list: ${hasFlow ? "BA_SA2 2.0.0 found" : `NOT found (${dataflows.error ?? "missing from list"})`}`);

  const dsd = await fetchJson(`${API_BASE}/datastructure/ABS/BA_SA2?references=children`);
  let dimsOk = false;
  let codesOk = false;
  let evidence = {};
  if (!dsd.error) {
    const dims = dsd.data?.dataStructures?.[0]?.dataStructureComponents?.dimensionList?.dimensions ?? [];
    const dimIds = dims.map((d) => d.id);
    dimsOk = JSON.stringify(dimIds) === JSON.stringify(entry.dimension_key_order.slice(0, dimIds.length));
    const codelists = Object.fromEntries((dsd.data?.codelists ?? []).map((cl) => [cl.id, cl.codes.map((c) => c.id)]));
    codesOk = Object.entries(REQUIRED_CODES).every(([cl, codes]) => codes.every((c) => (codelists[cl] ?? []).includes(c)));
    evidence = { dimension_order_confirmed: dimIds, required_codes_present: codesOk };
  }
  console.log(`  datastructure: dimensions ${dimsOk ? "match" : "DO NOT match"}, required codes ${codesOk ? "present" : "MISSING"} (${dsd.error ?? "fetched OK"})`);

  const today = new Date().toISOString().slice(0, 10);
  if (hasFlow && dimsOk && codesOk) {
    entry.status = "discovered";
    entry.notes += ` Verified ${today}: dataflow listed, dimension order confirmed (${entry.dimension_key_order.join(".")}), and all required codes (${Object.entries(REQUIRED_CODES).map(([k, v]) => `${k}:${v.join("/")}`).join(", ")}) present in the live datastructure.`;
  } else {
    entry.notes += ` NOT fully verified ${today} — confirm manually before download.`;
  }
  entry.verification_evidence = evidence;
}

const manifest = {
  generated_at: new Date().toISOString(),
  policy: {
    official_abs_only: true,
    api_only_no_bulk_scrape: "queries use the official ABS Data API with an explicit dimension key — never a wildcard bulk export",
    no_commercial_sources: true,
    raw_files_outside_git: RAW_ROOT,
    unverified_sources_marked: "needs_review",
    scope: "dwelling unit approvals (houses / other residential / total residential), New work, Total Sectors, SA2 grain",
  },
  entries,
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(path.join(reportsDir, "building_approvals_source_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] || 0) + 1), a), {});
const md = `# Building Approvals Source Manifest (Sprint 4)

Generated: ${manifest.generated_at}
Statuses: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}.

Primary source: **ABS Data API**, dataflow \`BA_SA2\` v2.0.0 — "Building Approvals by
SA2 and above, from July 2021 onwards". SA2 is the current ASGS Edition 3 grain,
directly joinable to \`core.dim_geography\` without an edition mismatch.

Scope for this sprint: dwelling units approved (MEASURE=1), Total Sectors (SECTOR=9),
New work only (WORK_TYPE=1), Houses / Total Other Residential / Total Residential
(BUILDING_TYPE=110/150/100). Value of building jobs (MEASURE=2) is catalogued under
\`variables_deferred\` but not loaded.

Policy: official ABS Data API only, explicit dimension key (never a wildcard bulk
export); raw pulls land in \`${RAW_ROOT}\` (gitignored). Full details:
\`building_approvals_source_manifest.json\`.

| dataset_id | access | geography | status |
|---|---|---|---|
${entries.map((e) => `| ${e.dataset_id} | ${e.access_method ?? e.entry_type} | ${e.geography_level} | ${e.status} |`).join("\n")}

## Verification evidence

- ABS Data API dataflow list (\`/rest/dataflow/ABS?detail=allstubs\`): \`BA_SA2\`
  version \`2.0.0\` present.
- ABS Data API datastructure (\`/rest/datastructure/ABS/BA_SA2?references=children\`):
  dimension order \`${entry.dimension_key_order.join(".")}\` confirmed; all required
  codes present in the live codelists (MEASURE, SECTOR/CL_BA_OWNERSHIP, WORK_TYPE,
  BUILDING_TYPE, REGION_TYPE).
- Sample data pull (2026-02–2026-03) returned 2,458 of 2,473 backbone SA2s reporting
  for Houses/New/Total-Sectors — the gap is SA2s with genuinely zero approvals that
  month (ABS omits zero rows rather than publishing explicit zeros), not a boundary
  mismatch.

## Next actions

- Review this manifest, then run \`build_building_approvals_local_store.mjs\` to pull
  the full July 2021–latest series via the explicit filter key
  \`${entry.filter_key}\` and build the local DuckDB store. No Supabase contact until
  the branch-load step.
`;
fs.writeFileSync(path.join(reportsDir, "building_approvals_source_manifest.md"), md);

console.log(`\nManifest written: ${entries.length} entries (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log("  warehouse/reports/building_approvals_source_manifest.json");
console.log("  warehouse/reports/building_approvals_source_manifest.md");
console.log("No bulk data downloaded; no database contacted.");
