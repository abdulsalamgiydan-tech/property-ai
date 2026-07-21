#!/usr/bin/env node
/**
 * QLD/SA/WA rental market — branch-only curated load (Sprint 11, Workstream 9).
 *
 * Promotes the three local rent stores built and validated in Workstream 6
 * (qld_rents.duckdb, sa_rents.duckdb, wa_rents.duckdb — 341,712 + 41,007 +
 * 31,335 rows respectively) into core.fact_rental_market_summary (existing
 * table, same schema already shared by NSW POA and VIC LGA rows — no
 * migration needed for this part), then extends the three quarterly rent
 * marts (mart.suburb_rent_quarterly, mart.postcode_rent_quarterly, and the
 * newly-created mart.lga_rent_quarterly from migration 018) with each
 * jurisdiction's DIRECT rows (geography_confidence in ('direct','alias') —
 * 'unresolved' rows are never promoted, matching this project's "never
 * fabricate a geography match" rule throughout).
 *
 * Only "Total across bedrooms" rows (bedroom_count IS NULL) are promoted to
 * the marts, matching the existing mart unique constraint
 * (geography_id, reference_quarter, dwelling_type) which has no
 * bedroom_count column — exactly the same convention already used for NSW.
 * The finer bedroom-level detail remains queryable in
 * core.fact_rental_market_summary directly.
 *
 * mart.lga_rent_quarterly is built from ALL existing LGA-grain fact rows
 * (not just this run's new QLD rows). This surfaced a real, unexpected
 * finding: the 48,024 pre-existing LGA-grain rows were NSW DCJ's own data
 * (loaded Sprint 6), not VIC's as initially assumed — dormant/unqueryable
 * since Sprint 6 because no LGA-grain mart view existed until migration
 * 018. VIC has ZERO rows in core.fact_rental_market_summary at all; its
 * rent data lives entirely in mart.suburb_market_snapshot via a different
 * Sprint 10 pipeline. This run makes NSW's LGA rent queryable for the
 * first time, alongside QLD's new LGA rent.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-load
 * gates (rollback on failure); all local-store reads happen before BEGIN.
 *
 * Usage:
 *   node load_qld_sa_wa_rents_to_branch.mjs             # dry run
 *   node load_qld_sa_wa_rents_to_branch.mjs --execute
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const BV = "ASGS3_2021";

const JURISDICTIONS = [
  {
    code: "QLD",
    dbPath: rel("warehouse", "data", "local", "qld_rents.duckdb"),
    table: "qld_rental_summary",
    reportPath: rel("warehouse", "reports", "qld_rents_local_store_report.json"),
    sourceId: "qld_rent",
    sourceName: "RTA Quarterly Data — Median Rents",
    publisher: "Residential Tenancies Authority (RTA), Queensland Government",
    sourceUrl: "https://www.rta.qld.gov.au/forms-resources/rta-quarterly-data/median-rents-quarterly-data",
    datasetId: "qld_rta_bond_statistics",
    datasetName: "QLD RTA Bond Statistics — suburb/LGA/postcode",
    earliest: "2017-Q3",
    latest: "2026-Q2",
  },
  {
    code: "SA",
    dbPath: rel("warehouse", "data", "local", "sa_rents.duckdb"),
    table: "sa_rental_summary",
    reportPath: rel("warehouse", "reports", "sa_rents_local_store_report.json"),
    sourceId: "sa_rent",
    sourceName: "SA Housing Trust Private Rent Report",
    publisher: "South Australian Housing Trust",
    sourceUrl: "https://data.sa.gov.au/data/dataset/private-rent-report",
    datasetId: "sa_private_rent_report",
    datasetName: "SA Private Rent Report — suburb/postcode (current era)",
    earliest: "2024-Q3",
    latest: "2026-Q1",
  },
  {
    code: "WA",
    dbPath: rel("warehouse", "data", "local", "wa_rents.duckdb"),
    table: "wa_rental_summary",
    reportPath: rel("warehouse", "reports", "wa_rents_local_store_report.json"),
    sourceId: "wa_rent",
    sourceName: "WA Rental Bonds Data (DMIRS)",
    publisher: "Government of Western Australia (Department of Mines, Industry Regulation and Safety)",
    sourceUrl: "https://housing-data-exchange.ahdap.org/dataset/west-australia-rental-bonds-data-2023-current",
    datasetId: "wa_dmirs_bond_lodgements",
    datasetName: "WA DMIRS Rental Bonds — suburb/postcode, medians derived in-house",
    earliest: "2023-03",
    latest: "2026-05",
  },
];

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);
const duckDate = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "days" in v) return new Date(Number(v.days) * 86400000).toISOString().slice(0, 10);
  return new Date(Number(v) * 86400000).toISOString().slice(0, 10);
};

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

for (const j of JURISDICTIONS) {
  if (!fs.existsSync(j.dbPath)) fail(`local ${j.code} rents store missing — run build_${j.code.toLowerCase()}_rents_local_store.mjs`);
  if (!fs.existsSync(j.reportPath)) fail(`local ${j.code} rents validation report missing`);
  const report = JSON.parse(fs.readFileSync(j.reportPath, "utf8"));
  if (!report.all_gates_pass) fail(`local ${j.code} rents validation did not pass — refusing to load (hard stop)`);
}

console.log(`load_qld_sa_wa_rents_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);
console.log("  scope: curated rent summary (all bedroom counts) into core.fact_rental_market_summary,");
console.log("  'Total across bedrooms' rows into mart.{suburb,postcode,lga}_rent_quarterly (direct/alias geography only)");

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

{
  const t = await q(
    `select to_regclass('core.fact_rental_market_summary') a, to_regclass('mart.suburb_rent_quarterly') b,
            to_regclass('mart.postcode_rent_quarterly') c, to_regclass('mart.lga_rent_quarterly') d`
  );
  if (Object.values(t[0]).some((v) => !v)) fail("required tables missing on branch — apply migration 018 first (hard stop)");
}
const [dimCheck] = await q("select count(*)::int n from core.dim_geography where boundary_version=$1 and geography_type in ('LGA','POA','SAL')", [BV]);
if (dimCheck.n < 18000) fail(`core.dim_geography LGA/POA/SAL rows look unpopulated (${dimCheck.n}) — geography backbone required (hard stop)`);

const dimIds = new Set(
  (await q("select geography_id from core.dim_geography where boundary_version=$1 and geography_type in ('LGA','POA','SAL')", [BV])).map((r) => r.geography_id)
);

const [preState] = await q(`select
  (select count(*)::int from core.fact_rental_market_summary) facts,
  (select count(*)::int from mart.suburb_rent_quarterly) srq,
  (select count(*)::int from mart.postcode_rent_quarterly) prq,
  (select count(*)::int from mart.lga_rent_quarterly) lrq`);
console.log(`  branch state before: facts=${preState.facts} suburb_rent=${preState.srq} postcode_rent=${preState.prq} lga_rent=${preState.lrq}`);

// ── Pre-read from DuckDB BEFORE opening the branch transaction ───────────
console.log("\n  pre-reading local summaries (before transaction)...");
const allRows = [];
for (const j of JURISDICTIONS) {
  const instance = await DuckDBInstance.create(j.dbPath, { access_mode: "READ_ONLY" });
  const duck = await instance.connect();
  const rows = (
    await (await duck.runAndReadAll(`
      select geography_id, geography_type, geography_code, geography_confidence, dwelling_type, bedroom_count,
             reference_period, median_weekly_rent, new_bond_count, confidence_label
      from ${j.table}
      where geography_confidence in ('direct','alias')
    `)).getRowObjects()
  ).map((r) => ({ ...r, reference_period: duckDate(r.reference_period), jurisdiction: j.code }));
  duck.closeSync();
  console.log(`  ${j.code}: ${rows.length} rows with resolved geography (direct/alias) pre-read`);
  for (const r of rows) allRows.push({ ...r, source: j });
}
console.log(`  total pre-read: ${allRows.length} rows`);

if (!EXECUTE) {
  console.log("\nDry run: would load core.fact_rental_market_summary, then extend");
  console.log("mart.suburb_rent_quarterly / postcode_rent_quarterly / lga_rent_quarterly with Total-across-bedrooms rows.");
  await client.end();
  process.exit(0);
}

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  raw_rows_loaded_to_branch: false,
  loaded: {},
  skipped: {},
  gates_after: {},
};

try {
  await client.query("begin");

  // 1. meta lineage — one source/dataset/load_run per jurisdiction.
  const runIds = {};
  for (const j of JURISDICTIONS) {
    await client.query(
      `insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent, source_url, licence, access_method, update_frequency, implementation_status)
       values ($1,$2,$3,'rentals','official',$4,'CC BY 4.0 (or equivalent open government licence, see source manifest)','file_download','quarterly','in_progress')
       on conflict (source_id) do update set implementation_status='in_progress', updated_at=now()`,
      [j.sourceId, j.sourceName, j.publisher, j.sourceUrl]
    );
    await client.query(
      `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
       values ($1,$2,$3,'SAL,POA,LGA',$4,$5,'xlsx/csv','quarterly','Sprint 11 Workstream 6/9 — local store built and validated, promoted to branch.')
       on conflict (dataset_id) do nothing`,
      [j.datasetId, j.sourceId, j.datasetName, j.earliest, j.latest]
    );
    const { rows: runRows } = await client.query(
      "insert into meta.load_run (dataset_id, run_status) values ($1,'running') returning load_run_id",
      [j.datasetId]
    );
    runIds[j.code] = runRows[0].load_run_id;
  }
  console.log(`\n  meta: ${JURISDICTIONS.length} source + dataset + load_run rows registered`);

  // 2. core.fact_rental_market_summary — all resolved rows, all bedroom counts.
  let factsLoaded = 0;
  let factsSkippedOrphan = 0;
  const factsByJurisdiction = {};
  for (let i = 0; i < allRows.length; i += 500) {
    const slice = allRows.slice(i, i + 500).filter((r) => {
      const ok = dimIds.has(r.geography_id);
      if (!ok) factsSkippedOrphan++;
      return ok;
    });
    if (slice.length === 0) continue;
    const params = [];
    const COLS = 13;
    const tuples = slice.map((r) => {
      const b = params.length;
      params.push(
        r.geography_id,
        r.geography_type,
        r.geography_code,
        r.reference_period,
        "quarter",
        r.dwelling_type,
        r.bedroom_count === null || r.bedroom_count === undefined ? null : num(r.bedroom_count),
        r.median_weekly_rent,
        r.new_bond_count === null ? null : num(r.new_bond_count),
        r.source.sourceId,
        r.source.datasetId,
        runIds[r.jurisdiction],
        r.confidence_label
      );
      return `(${Array.from({ length: COLS }, (_, j2) => `$${b + j2 + 1}`).join(",")})`;
    });
    const res = await client.query(
      `insert into core.fact_rental_market_summary
         (geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type, bedroom_count,
          median_weekly_rent, rental_count, source_id, dataset_id, load_run_id, confidence_label)
       values ${tuples.join(",")}
       on conflict (geography_id, reference_period, dwelling_type, (coalesce(bedroom_count, -1))) do nothing`,
      params
    );
    factsLoaded += res.rowCount;
    for (const r of slice) factsByJurisdiction[r.jurisdiction] = (factsByJurisdiction[r.jurisdiction] ?? 0) + 1;
  }
  console.log(`  core.fact_rental_market_summary: ${factsLoaded} rows inserted (${factsSkippedOrphan} skipped — geography not in core.dim_geography)`);
  report.loaded.fact_rental_market_summary = factsLoaded;
  report.skipped.fact_rental_market_summary_orphans = factsSkippedOrphan;
  for (const j of JURISDICTIONS) {
    await client.query(
      "update meta.load_run set run_status='succeeded', finished_at=now(), records_extracted=$2, records_loaded=$3 where load_run_id=$1",
      [runIds[j.code], allRows.filter((r) => r.jurisdiction === j.code).length, factsByJurisdiction[j.code] ?? 0]
    );
  }

  // 3. mart.postcode_rent_quarterly — direct, Total-across-bedrooms rows only.
  const buildMart = async (martTable, geoType, correspondenceMethod) => {
    const r = await client.query(`
      insert into ${martTable}
        (geography_id, geography_name, state_code, reference_quarter, dwelling_type,
         median_weekly_rent, rental_count, sample_size_confidence, confidence_label, correspondence_method, source_summary)
      select f.geography_id, d.geography_name, d.state_code, f.reference_period, f.dwelling_type,
             f.median_weekly_rent, f.rental_count, f.confidence_label, f.confidence_label,
             $1,
             jsonb_build_object('source', f.source_id, 'dataset', f.dataset_id)
      from core.fact_rental_market_summary f
      join core.dim_geography d on d.geography_id = f.geography_id
      where f.geography_type = $2 and f.bedroom_count is null
      on conflict (geography_id, reference_quarter, dwelling_type) do nothing`,
      [correspondenceMethod, geoType]
    );
    console.log(`  ${martTable}: ${r.rowCount} rows built`);
    return r.rowCount;
  };
  report.loaded.postcode_rent_quarterly = await buildMart("mart.postcode_rent_quarterly", "POA", "direct_postcode_match");
  report.loaded.suburb_rent_quarterly = await buildMart("mart.suburb_rent_quarterly", "SAL", "direct_suburb_match");
  // LGA mart is built from ALL existing LGA facts (VIC + new QLD), not just this run's rows.
  report.loaded.lga_rent_quarterly = await buildMart("mart.lga_rent_quarterly", "LGA", "direct_lga_match");

  // ── Post-load blocking gates ───────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select geography_id, reference_period, dwelling_type, bedroom_count
       from core.fact_rental_market_summary group by 1,2,3,4 having count(*)>1) d) as dup_fact_grain,
    (select count(*)::int from core.fact_rental_market_summary where geography_id is null) as null_geo_ids,
    (select count(*)::int from core.fact_rental_market_summary where median_weekly_rent < 0) as negative_rent,
    (select count(*)::int from core.fact_rental_market_summary f
      where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_facts,
    (select count(*)::int from (select geography_id, reference_quarter, dwelling_type from mart.suburb_rent_quarterly group by 1,2,3 having count(*)>1)) as dup_mart_sal,
    (select count(*)::int from (select geography_id, reference_quarter, dwelling_type from mart.postcode_rent_quarterly group by 1,2,3 having count(*)>1)) as dup_mart_poa,
    (select count(*)::int from (select geography_id, reference_quarter, dwelling_type from mart.lga_rent_quarterly group by 1,2,3 having count(*)>1)) as dup_mart_lga`);
  report.gates_after = post;
  console.log(
    `\nPost-load gates: dup_grain=${post.dup_fact_grain} null_geo=${post.null_geo_ids} negative_rent=${post.negative_rent} orphans=${post.orphan_facts} dup_mart=${Number(post.dup_mart_sal) + Number(post.dup_mart_poa) + Number(post.dup_mart_lga)}`
  );
  const gateFailed =
    post.dup_fact_grain || post.null_geo_ids || post.negative_rent || post.orphan_facts || post.dup_mart_sal || post.dup_mart_poa || post.dup_mart_lga;
  if (gateFailed) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  for (const [rule, failed] of [
    ["no_duplicate_grain", post.dup_fact_grain],
    ["nulls_not_zero", post.null_geo_ids],
    ["geo_code_valid", post.orphan_facts],
    ["price_range_sanity", post.negative_rent],
  ]) {
    await client.query("insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details) values ($1,'blocker',$2,$3,$4)", [
      rule,
      failed === 0 ? "passed" : "failed",
      failed,
      JSON.stringify({ stage: "qld_sa_wa_rents_branch_load" }),
    ]);
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched; no raw sheet rows loaded).");
} catch (err) {
  try {
    await client.query("rollback");
  } catch {}
  try {
    await client.end();
  } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

const [summary] = await q(`select
  (select count(*)::int from core.fact_rental_market_summary) as fact_total,
  (select count(*)::int from mart.suburb_rent_quarterly) as suburb_rent,
  (select count(*)::int from mart.postcode_rent_quarterly) as postcode_rent,
  (select count(*)::int from mart.lga_rent_quarterly) as lga_rent,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state = summary;
await client.end();
fs.writeFileSync(rel("warehouse", "reports", "qld_sa_wa_rents_branch_load_report.json"), JSON.stringify(report, null, 2) + "\n");

console.log("\nRun report written: warehouse/reports/qld_sa_wa_rents_branch_load_report.json");
console.log(
  `facts=${summary.fact_total} suburb_rent=${summary.suburb_rent} postcode_rent=${summary.postcode_rent} lga_rent=${summary.lga_rent} db=${summary.db_size}`
);
