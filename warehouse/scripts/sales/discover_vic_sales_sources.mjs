#!/usr/bin/env node
/**
 * Victoria VPSR sales source discovery (Sprint 10, Phase 5).
 *
 * Re-verifies the current-quarter download URLs for the three VPSR suburb
 * products against the official CKAN API (discover.data.vic.gov.au — no
 * bot protection, plain HTTPS). Does not download files itself (VPSR's
 * file host, land.vic.gov.au, sits behind a Cloudflare JS challenge and
 * requires a headed browser session — see
 * warehouse/reports/victoria_source_manifest.md). This script is safe to
 * re-run on every refresh to detect a new quarterly release.
 */

const DATASETS = [
  { dataset_id: "vic_vpsr_median_house", ckan_id: "victorian-property-sales-report-median-house-by-suburb" },
  { dataset_id: "vic_vpsr_median_unit", ckan_id: "victorian-property-sales-report-median-unit-by-suburb" },
  { dataset_id: "vic_vpsr_median_land", ckan_id: "victorian-property-sales-report-median-vacant-land-by-suburb" },
];

async function fetchLatest(ckanId) {
  const url = `https://discover.data.vic.gov.au/api/3/action/package_show?id=${ckanId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CKAN API ${res.status} for ${ckanId}`);
  const json = await res.json();
  const resources = json.result.resources;
  const latest = resources[resources.length - 1];
  return { resource_name: latest.name, download_url: latest.url, last_modified: latest.last_modified || latest.created };
}

const results = [];
for (const d of DATASETS) {
  try {
    const latest = await fetchLatest(d.ckan_id);
    results.push({ ...d, status: "resolved", ...latest });
    console.log(`${d.dataset_id}: ${latest.resource_name} -> ${latest.download_url}`);
  } catch (err) {
    results.push({ ...d, status: "error", error: String(err) });
    console.error(`${d.dataset_id}: ERROR ${err}`);
  }
}

console.log(JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
console.log(
  "\nNo download performed by this script. VPSR files require a headed browser session (Cloudflare JS challenge on www.land.vic.gov.au). Use: gstack /browse --headed download <download_url> warehouse/data/raw/vic_sales/vpsr/<name>.xls --navigate"
);
