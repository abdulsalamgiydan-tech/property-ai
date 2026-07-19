#!/usr/bin/env node
/**
 * ASGS source discovery (Sprint 2, Part A).
 *
 * Builds the source manifest for the ABS ASGS Edition 3 geography backbone:
 *   - official ABS digital boundary files for STATE, GCCSA, SA4, SA3, SA2,
 *     SA1, LGA, SAL, POA
 *   - official ABS allocation/correspondence artefacts for the six required
 *     correspondences (SA1->SAL/POA/LGA, SA2->SAL/POA/LGA)
 *   - official ABS documentation pages
 *
 * Outputs:
 *   warehouse/reports/asgs_source_manifest.json
 *   warehouse/reports/asgs_source_manifest.md
 *
 * Verification: sends lightweight HEAD (or 1-byte Range GET) requests to
 * www.abs.gov.au ONLY, to confirm candidate URLs exist. It never downloads
 * boundary files, never touches non-ABS sites, never connects to Supabase
 * and needs no secrets. URLs that cannot be confidently verified are marked
 * `needs_review` rather than guessed. Run with --offline to skip network
 * checks entirely.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const reportsDir = path.join(repoRoot, "warehouse", "reports");

const OFFLINE = process.argv.includes("--offline");

const BOUNDARY_VERSION = "ASGS3_2021";
const REFERENCE_PERIOD = "2021";
const PUBLISHER = "Australian Bureau of Statistics";
const LICENCE =
  "CC BY 4.0 (Creative Commons Attribution 4.0 International) — attribute the ABS";

const ABS_BASE =
  "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026";
const PAGES = {
  landing: ABS_BASE,
  boundaries: `${ABS_BASE}/access-and-downloads/digital-boundary-files`,
  allocations: `${ABS_BASE}/access-and-downloads/allocation-files`,
  correspondences: `${ABS_BASE}/access-and-downloads/correspondences`,
};

const RAW_ROOT = "warehouse/data/raw/asgs/ASGS3_2021"; // gitignored

// ── Catalogue ────────────────────────────────────────────────────────────
// ABS file-name conventions differ between the main structure
// (<CODE>_2021_AUST_SHP_GDA2020.zip) and non-ABS structures
// (<CODE>_2021_AUST_GDA2020_SHP.zip). Candidate URLs are verified below;
// unverified candidates are reported as needs_review, never trusted.

const MAIN_STRUCTURE = [
  ["STATE", "STE", "States and Territories"],
  ["GCCSA", "GCCSA", "Greater Capital City Statistical Areas"],
  ["SA4", "SA4", "Statistical Areas Level 4"],
  ["SA3", "SA3", "Statistical Areas Level 3"],
  ["SA2", "SA2", "Statistical Areas Level 2"],
  ["SA1", "SA1", "Statistical Areas Level 1"],
];

const NON_ABS_STRUCTURE = [
  ["SAL", "SAL", "Suburbs and Localities"],
  ["POA", "POA", "Postal Areas"],
  ["LGA", "LGA", "Local Government Areas"],
];

function boundaryEntry(level, absCode, label, fileName) {
  return {
    source_id: "abs_asgs",
    dataset_id: `asgs_${level.toLowerCase()}_2021_boundaries`,
    entry_type: "boundary",
    dataset_name: `ASGS Ed.3 ${label} (${level}) digital boundaries, GDA2020 shapefile`,
    publisher: PUBLISHER,
    official_url: `${PAGES.boundaries}/${fileName}`,
    geography_level: level,
    file_format: "shp_zip",
    expected_file_name: fileName,
    boundary_version: BOUNDARY_VERSION,
    licence_notes: LICENCE,
    intended_raw_storage_path: `${RAW_ROOT}/boundaries/${fileName}`,
    intended_staging_table: "staging.asgs_geography",
    intended_core_table: "core.dim_geography",
    status: "needs_review", // upgraded to discovered only after URL verification
    notes: `Candidate URL from documented ABS naming convention (${absCode}). Source SRS is GDA2020; transform to EPSG:4326 at staging.`,
  };
}

const boundaryEntries = [
  ...MAIN_STRUCTURE.map(([level, code, label]) =>
    boundaryEntry(level, code, label, `${code}_2021_AUST_SHP_GDA2020.zip`)
  ),
  ...NON_ABS_STRUCTURE.map(([level, code, label]) =>
    boundaryEntry(level, code, label, `${code}_2021_AUST_GDA2020_SHP.zip`)
  ),
];

const REQUIRED_CORRESPONDENCES = [
  ["SA1", "SAL", "official_allocation"],
  ["SA1", "POA", "official_allocation"],
  ["SA1", "LGA", "official_allocation"],
  ["SA2", "SAL", "derived_from_sa1"],
  ["SA2", "POA", "derived_from_sa1"],
  ["SA2", "LGA", "derived_from_sa1"],
];

const correspondenceEntries = REQUIRED_CORRESPONDENCES.map(
  ([source, target, method]) => ({
    source_id: "abs_asgs",
    dataset_id: `asgs_corr_${source.toLowerCase()}_to_${target.toLowerCase()}_2021`,
    entry_type: "correspondence",
    correspondence_pair: `${source}->${target}`,
    dataset_name:
      method === "official_allocation"
        ? `ASGS Ed.3 ${source} to ${target} allocation (official ABS allocation/correspondence file)`
        : `ASGS Ed.3 ${source} to ${target} correspondence (derived by aggregating SA1 allocations)`,
    publisher: PUBLISHER,
    official_url:
      method === "official_allocation" ? PAGES.allocations : PAGES.correspondences,
    geography_level: `${source}->${target}`,
    file_format: "csv",
    expected_file_name: null, // exact ABS file names to be confirmed from the pages above
    boundary_version: BOUNDARY_VERSION,
    licence_notes: LICENCE,
    intended_raw_storage_path: `${RAW_ROOT}/correspondences/`,
    intended_staging_table: "staging.asgs_correspondence",
    intended_core_table: "core.bridge_geography_correspondence",
    status: "needs_review",
    notes:
      method === "official_allocation"
        ? "Exact ABS artefact name not yet confirmed — pick from the allocation-files / correspondences pages during load; do not guess. SA1 links to non-ABS structures may be published via Mesh Block allocations, in which case derive SA1-level ratios from MB counts."
        : "Not a downloadable ABS file: derived internally by aggregating SA1 allocations with dwelling>population>area weights (see SPRINT_2 plan §3).",
  })
);

const documentationEntries = [
  ["asgs_ed3_landing", "ASGS Edition 3 landing page", PAGES.landing],
  ["asgs_ed3_boundary_downloads", "ASGS Ed.3 digital boundary files page", PAGES.boundaries],
  ["asgs_ed3_allocation_files", "ASGS Ed.3 allocation files page", PAGES.allocations],
  ["asgs_ed3_correspondences", "ASGS Ed.3 correspondences page", PAGES.correspondences],
].map(([id, name, url]) => ({
  source_id: "abs_asgs",
  dataset_id: id,
  entry_type: "documentation",
  dataset_name: name,
  publisher: PUBLISHER,
  official_url: url,
  geography_level: "ALL",
  file_format: "html",
  expected_file_name: null,
  boundary_version: BOUNDARY_VERSION,
  licence_notes: LICENCE,
  intended_raw_storage_path: null,
  intended_staging_table: null,
  intended_core_table: null,
  status: "needs_review",
  notes: "Reference/documentation page — nothing loaded from it directly.",
}));

// ── URL verification (headers only, ABS only, no downloads) ──────────────

async function verifyUrl(url) {
  if (!url.startsWith("https://www.abs.gov.au/")) {
    return { ok: false, detail: "non-ABS URL refused by policy" };
  }
  const attempt = async (method, headers) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, {
        method,
        headers,
        redirect: "follow",
        signal: controller.signal,
      });
      // Read no body: for the Range GET we cancel immediately after headers.
      if (res.body) await res.body.cancel().catch(() => {});
      return res;
    } finally {
      clearTimeout(timer);
    }
  };
  // Transient connection failures are common when hammering one host, so
  // retry with backoff; a definitive HTTP status (e.g. 404) is returned as-is.
  let lastDetail = "no attempt made";
  for (let i = 0; i < 4; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2500 * i));
    try {
      let res = await attempt("HEAD");
      if (res.status === 405 || res.status === 501) {
        res = await attempt("GET", { Range: "bytes=0-0" });
      }
      if (res.ok || res.status === 206) {
        const size = res.headers.get("content-length");
        return { ok: true, detail: `HTTP ${res.status}${size ? `, ~${size} bytes` : ""}` };
      }
      return { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      lastDetail = `network error: ${err.name || "unknown"}`;
    }
  }
  return { ok: false, detail: `${lastDetail} after 4 attempts` };
}

// ── Main ─────────────────────────────────────────────────────────────────

const entries = [...boundaryEntries, ...correspondenceEntries, ...documentationEntries];

if (OFFLINE) {
  console.log("--offline: skipping URL verification; all entries stay needs_review.");
} else {
  console.log(`Verifying ${entries.length} candidate URLs against www.abs.gov.au (headers only)...`);
  for (const entry of entries) {
    // Derived correspondences have no direct artefact to verify.
    if (entry.entry_type === "correspondence" && entry.expected_file_name === null && entry.notes.startsWith("Not a downloadable")) {
      entry.status = "discovered";
      entry.notes += " No URL verification applicable.";
      continue;
    }
    const result = await verifyUrl(entry.official_url);
    if (result.ok) {
      entry.status = "discovered";
      entry.notes += ` URL verified ${new Date().toISOString().slice(0, 10)} (${result.detail}).`;
    } else {
      entry.status = "needs_review";
      entry.notes += ` URL NOT verified (${result.detail}) — confirm manually from ${PAGES.landing} before download.`;
    }
    console.log(`  ${result.ok ? "ok  " : "WARN"} [${entry.status}] ${entry.dataset_id} — ${result.detail}`);
  }
}

const manifest = {
  generated_at: new Date().toISOString(),
  edition: "ASGS Edition 3 (July 2021 – June 2026)",
  boundary_version: BOUNDARY_VERSION,
  reference_period: REFERENCE_PERIOD,
  policy: {
    official_abs_only: true,
    no_commercial_sources: true,
    raw_files_outside_git: RAW_ROOT,
    unverified_urls_marked: "needs_review",
  },
  entries,
};

fs.mkdirSync(reportsDir, { recursive: true });
const jsonPath = path.join(reportsDir, "asgs_source_manifest.json");
fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2) + "\n");

const counts = entries.reduce((acc, e) => {
  acc[e.status] = (acc[e.status] || 0) + 1;
  return acc;
}, {});

const mdRows = entries.map((e) =>
  `| ${e.dataset_id} | ${e.entry_type} | ${e.geography_level} | ${e.file_format} | ${e.status} | ${e.expected_file_name ?? "—"} |`
);
const md = `# ASGS Source Manifest

Generated: ${manifest.generated_at}
Edition: ${manifest.edition} (boundary_version \`${BOUNDARY_VERSION}\`)
Statuses: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}

Policy: official ABS sources only; raw files land in \`${RAW_ROOT}\` (gitignored);
unverified URLs are \`needs_review\`, never guessed. Full details incl. URLs, licence
and intended staging/core targets: \`asgs_source_manifest.json\`.

| dataset_id | type | level | format | status | expected file |
|---|---|---|---|---|---|
${mdRows.join("\n")}

## Next actions

- Resolve every \`needs_review\` entry from the official ABS pages before download.
- Downloads go to \`${RAW_ROOT}\` only (gitignored), hashed into \`meta.source_file\`.
- Load via \`load_asgs_backbone.mjs\` (dry-run until approved) against the
  warehouse-validation Supabase branch — never production.
`;
fs.writeFileSync(path.join(reportsDir, "asgs_source_manifest.md"), md);

console.log("");
console.log(`Manifest written: ${entries.length} entries (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log("  warehouse/reports/asgs_source_manifest.json");
console.log("  warehouse/reports/asgs_source_manifest.md");
console.log("No files were downloaded; no database was contacted.");
