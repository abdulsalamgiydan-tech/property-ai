#!/usr/bin/env node
/**
 * Sprint 12, Workstream 5 — research evidence catalogue.
 *
 * Live-generates a browsable catalogue of every registered source and
 * dataset, cross-referenced against meta.metric_lineage_registry (WS8) to
 * show which published metric families each source actually feeds, and
 * meta.dataset_freshness_status (Sprint 10/WS9) for currency. Read-only.
 *
 * Distinct from warehouse/metadata/source_register.csv: that file is a
 * narrow bootstrap input specifically for load_asgs_backbone.mjs's own
 * meta.source registration (checked by warehouse:check for exactly one
 * required row, abs_asgs) -- it was never meant to track every source
 * this project has registered. Every other source in this project
 * registers itself directly into meta.source via its own load script
 * (see e.g. load_qld_sa_wa_rents_to_branch.mjs). meta.source is already
 * the live, authoritative record; this script is the first thing that
 * actually renders it as a browsable catalogue.
 *
 * Usage:
 *   node build_evidence_catalogue.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log("build_evidence_catalogue — read-only");

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const sources = await q(`
  select source_id, source_name, publisher, source_category, official_or_independent,
         source_url, licence, access_method, update_frequency, implementation_status, known_limitations
  from meta.source order by source_category, source_id`);

const datasets = await q(`
  select dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, refresh_frequency
  from meta.dataset order by dataset_id`);

const lineage = await q(`
  select source_id, mart_table, metric_name as metric_family, jurisdiction_code
  from meta.metric_lineage_registry where source_id is not null`);

const freshness = await q(`
  select dataset_id, freshness_status, last_retrieved_at from meta.dataset_freshness_status`);

const datasetsBySource = new Map();
for (const d of datasets) {
  if (!datasetsBySource.has(d.source_id)) datasetsBySource.set(d.source_id, []);
  datasetsBySource.get(d.source_id).push(d);
}
const metricsBySource = new Map();
for (const l of lineage) {
  if (!metricsBySource.has(l.source_id)) metricsBySource.set(l.source_id, new Set());
  metricsBySource.get(l.source_id).add(`${l.mart_table}.${l.metric_family}${l.jurisdiction_code ? ` (${l.jurisdiction_code})` : ""}`);
}
const freshnessByDataset = new Map(freshness.map((f) => [f.dataset_id, f]));

const catalogue = sources.map((s) => {
  const sourceDatasets = datasetsBySource.get(s.source_id) ?? [];
  return {
    source_id: s.source_id,
    source_name: s.source_name,
    publisher: s.publisher,
    category: s.source_category,
    official_or_independent: s.official_or_independent,
    source_url: s.source_url,
    licence: s.licence,
    access_method: s.access_method,
    update_frequency: s.update_frequency,
    implementation_status: s.implementation_status,
    known_limitations: s.known_limitations,
    datasets: sourceDatasets.map((d) => ({
      dataset_id: d.dataset_id,
      dataset_name: d.dataset_name,
      geography_available: d.geography_available,
      earliest_period: d.earliest_period,
      latest_period: d.latest_period,
      freshness_status: freshnessByDataset.get(d.dataset_id)?.freshness_status ?? "not_tracked",
    })),
    published_metric_families: [...(metricsBySource.get(s.source_id) ?? [])].sort(),
  };
});

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  source_count: sources.length,
  dataset_count: datasets.length,
  sources_by_category: Object.fromEntries(
    [...new Set(sources.map((s) => s.source_category))].map((cat) => [cat, sources.filter((s) => s.source_category === cat).length])
  ),
  sources_with_no_published_metric: catalogue.filter((c) => c.published_metric_families.length === 0).map((c) => c.source_id),
  catalogue,
};

await client.end();

fs.writeFileSync(rel("warehouse", "metadata", "evidence_catalogue.json"), JSON.stringify(report, null, 2) + "\n");

const md = [
  "# Research Evidence Catalogue",
  "",
  `Generated ${report.generated_at} from the live warehouse-validation branch — ${report.source_count} registered sources, ${report.dataset_count} datasets.`,
  "",
  "Every source below is either official government/statutory data or a named independent publisher — this project never uses unofficial or scraped-without-attribution data (see `warehouse/docs/WAREHOUSE_PLAN.md`).",
  "",
  ...Object.entries(report.sources_by_category).map(([cat, n]) => `- **${cat}**: ${n} source(s)`),
  "",
  "## Sources",
  "",
  ...catalogue.flatMap((c) => [
    `### ${c.source_name}`,
    "",
    `- **Publisher**: ${c.publisher} (${c.official_or_independent})`,
    `- **Category**: ${c.category}`,
    `- **Licence**: ${c.licence ?? "not recorded"}`,
    `- **Access method**: ${c.access_method ?? "not recorded"} · **Update frequency**: ${c.update_frequency ?? "not recorded"}`,
    `- **Implementation status**: ${c.implementation_status}`,
    c.source_url ? `- **URL**: ${c.source_url}` : "",
    c.known_limitations ? `- **Known limitations**: ${c.known_limitations}` : "",
    c.datasets.length > 0
      ? `- **Datasets**: ${c.datasets.map((d) => `${d.dataset_name} (${d.geography_available ?? "grain not recorded"}, ${d.earliest_period ?? "?"}–${d.latest_period ?? "?"}, freshness: ${d.freshness_status})`).join("; ")}`
      : "- **Datasets**: none registered yet",
    c.published_metric_families.length > 0
      ? `- **Feeds published metrics**: ${c.published_metric_families.join(", ")}`
      : "- **Feeds published metrics**: not yet linked in the lineage registry",
    "",
  ]),
  "## Sources with no published metric family",
  "",
  report.sources_with_no_published_metric.length === 0
    ? "None — every registered source feeds at least one published, lineage-tracked metric."
    : report.sources_with_no_published_metric.map((s) => `- ${s}`).join("\n"),
  "",
].join("\n");

fs.writeFileSync(rel("warehouse", "reports", "evidence_catalogue_report.md"), md);

console.log(`Sources: ${report.source_count} | Datasets: ${report.dataset_count}`);
console.log(`Sources with no published metric: ${report.sources_with_no_published_metric.length}`);
console.log("Wrote warehouse/metadata/evidence_catalogue.json and warehouse/reports/evidence_catalogue_report.md");
