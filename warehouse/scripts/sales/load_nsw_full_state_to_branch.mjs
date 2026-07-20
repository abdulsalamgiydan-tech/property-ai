#!/usr/bin/env node
/**
 * NSW sales + rent + yield — FULL STATE curated branch load (Sprint 7, Part C-D).
 *
 * Extends the branch beyond the Sprint 5/6 pilot (6 LGAs) to all of NSW,
 * with explicit capacity discipline (per this sprint's own fallback rule):
 *
 *   - core.fact_residential_sales_summary: ALL years at annual grain
 *     (~450K rows full-state, safe) + only the TRAILING 12 MONTHS at
 *     monthly grain (25 years of full monthly history stays local-only —
 *     that would be ~3M+ rows, unsafe for the branch)
 *   - core.fact_rental_market_summary: ALL 15 quarters, full state
 *     (~258K rows — quarterly grain is already compact, no curation needed)
 *   - mart.suburb_sales_monthly / postcode_sales_monthly: trailing 12
 *     months only, all NSW
 *   - mart.suburb_sales_annual / postcode_sales_annual: all years, all NSW
 *   - mart.suburb_rent_quarterly (derived via POA->SAL correspondence,
 *     Sprint 6 method) / postcode_rent_quarterly (direct): all quarters,
 *     all NSW
 *   - mart.suburb_yield_quarterly / postcode_yield_quarterly: rebuilt
 *     against the now-expanded marts, same rules as Sprint 6 (every row
 *     represented, yield only computed with sufficient confidence on both
 *     sides, otherwise NULL + 'insufficient' label)
 *
 * NO raw transaction/rent-sheet tables are ever loaded to Supabase — the
 * full local detail (2.5M+ sales transactions, full rent sheets) stays in
 * the local DuckDB stores only.
 *
 * This is additive to the existing Sprint 5/6 pilot rows already on the
 * branch (all inserts use ON CONFLICT DO NOTHING — pilot rows are never
 * touched, duplicated or deleted; new full-state rows fill in the rest).
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-gates
 * (rollback on failure); all local-store reads happen before BEGIN. Checks
 * branch DB size before starting and refuses if it is already unsafely
 * large; the transaction's own gates catch any post-load problem.
 *
 * Usage:
 *   node load_nsw_full_state_to_branch.mjs             # dry run
 *   node load_nsw_full_state_to_branch.mjs --execute
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
// Hard capacity guard — refuse to even attempt a full-state load if the
// branch is already unsafely large (task's own "stop if unsafe" rule).
const MAX_SAFE_DB_MB = 4500;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);
const duckDate = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "days" in v) return new Date(Number(v.days) * 86400000).toISOString().slice(0, 10);
  if (typeof v === "object" && "micros" in v) return new Date(Number(v.micros) / 1000).toISOString().slice(0, 10);
  return new Date(Number(v) * 86400000).toISOString().slice(0, 10);
};

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

const SALES_DB = rel("warehouse", "data", "local", "nsw_sales.duckdb");
const SALES_REPORT = rel("warehouse", "reports", "nsw_sales_full_state_local_store_report.json");
const RENTS_DB = rel("warehouse", "data", "local", "nsw_rents.duckdb");
const RENTS_REPORT = rel("warehouse", "reports", "nsw_rents_full_state_local_store_report.json");
const SALES_INVENTORY = rel("warehouse", "reports", "nsw_sales_download_inventory.json");
const RENTS_INVENTORY = rel("warehouse", "reports", "nsw_rental_bonds_download_inventory.json");
const RUN_REPORT = rel("warehouse", "reports", "nsw_full_state_branch_load_report.json");
const YIELD_REPORT = rel("warehouse", "reports", "nsw_full_state_yield_report.json");

for (const [p, hint] of [
  [SALES_DB, "run build_nsw_sales_full_state_local_store.mjs"],
  [RENTS_DB, "run build_nsw_rents_full_state_local_store.mjs"],
]) {
  if (!fs.existsSync(p)) fail(`${path.relative(repoRoot, p)} missing — ${hint}`);
}
if (!fs.existsSync(SALES_REPORT) || JSON.parse(fs.readFileSync(SALES_REPORT, "utf8")).verdict !== "PASSED") {
  fail("sales full-state local store validation is not PASSED — refusing to load (hard stop)");
}
if (!fs.existsSync(RENTS_REPORT) || JSON.parse(fs.readFileSync(RENTS_REPORT, "utf8")).verdict !== "PASSED") {
  fail("rents full-state local store validation is not PASSED — refusing to load (hard stop)");
}
const salesInventory = JSON.parse(fs.readFileSync(SALES_INVENTORY, "utf8"));
const rentsInventory = JSON.parse(fs.readFileSync(RENTS_INVENTORY, "utf8"));

console.log(`load_nsw_full_state_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);
console.log("  capacity policy: full monthly sales history stays local; only trailing 12 months promoted; annual + quarterly rent promoted in full");

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const [sizeBefore] = await q("select pg_database_size(current_database())::bigint as bytes, pg_size_pretty(pg_database_size(current_database())) as pretty");
const dbMbBefore = Number(sizeBefore.bytes) / 1024 / 1024;
console.log(`  branch DB size before: ${sizeBefore.pretty}`);
if (dbMbBefore > MAX_SAFE_DB_MB) {
  fail(`branch DB already at ${sizeBefore.pretty}, over the ${MAX_SAFE_DB_MB} MB safety threshold — refusing to add more (hard stop, per capacity rule)`);
}

{
  const t = await q(`select to_regclass('core.fact_residential_sales_summary') a, to_regclass('core.fact_rental_market_summary') b,
                            to_regclass('mart.suburb_sales_monthly') c, to_regclass('mart.suburb_sales_annual') d,
                            to_regclass('mart.postcode_sales_monthly') e, to_regclass('mart.postcode_sales_annual') f,
                            to_regclass('mart.suburb_rent_quarterly') g, to_regclass('mart.postcode_rent_quarterly') h,
                            to_regclass('mart.suburb_yield_quarterly') i, to_regclass('mart.postcode_yield_quarterly') j`);
  if (Object.values(t[0]).some((v) => !v)) fail("required tables missing on branch — apply migrations 008/009 first (hard stop)");
}
const [dimCheck] = await q("select count(*)::int n from core.dim_geography where boundary_version=$1 and geography_type in ('SAL','POA','LGA')", [BV]);
if (dimCheck.n < 18000) fail(`core.dim_geography SAL/POA/LGA rows look unpopulated (${dimCheck.n}) — geography backbone required (hard stop)`);
const dimIds = new Set((await q(
  "select geography_id from core.dim_geography where boundary_version=$1 and geography_type in ('SAL','POA','LGA')", [BV]
)).map((r) => r.geography_id));

const [preState] = await q(`select
  (select count(*)::int from core.fact_residential_sales_summary) sales_facts,
  (select count(*)::int from core.fact_rental_market_summary) rent_facts,
  (select count(*)::int from mart.suburb_sales_monthly) ssm, (select count(*)::int from mart.suburb_sales_annual) ssa,
  (select count(*)::int from mart.postcode_sales_monthly) psm, (select count(*)::int from mart.postcode_sales_annual) psa,
  (select count(*)::int from mart.suburb_rent_quarterly) srq, (select count(*)::int from mart.postcode_rent_quarterly) prq,
  (select count(*)::int from mart.suburb_yield_quarterly) syq, (select count(*)::int from mart.postcode_yield_quarterly) pyq`);
console.log(`  branch state before: sales_facts=${preState.sales_facts} rent_facts=${preState.rent_facts} ssm=${preState.ssm} ssa=${preState.ssa} psm=${preState.psm} psa=${preState.psa} srq=${preState.srq} prq=${preState.prq} syq=${preState.syq} pyq=${preState.pyq}`);

const duckSalesInstance = await DuckDBInstance.create(SALES_DB, { access_mode: "READ_ONLY" });
const duckSales = await duckSalesInstance.connect();
const duckRentsInstance = await DuckDBInstance.create(RENTS_DB, { access_mode: "READ_ONLY" });
const duckRents = await duckRentsInstance.connect();
const salesRows = async (sql) => (await duckSales.runAndReadAll(sql)).getRowObjects();
const rentRows = async (sql) => (await duckRents.runAndReadAll(sql)).getRowObjects();

if (!EXECUTE) {
  const [maxP] = await salesRows("select least(max(reference_period), current_date) mp from nsw_sales_summary where period_type='month'");
  const cutoff = duckDate(maxP.mp);
  const [d1] = await salesRows(`select count(*)::int n from nsw_sales_summary where period_type='year' and reference_period <= current_date`);
  const [d2] = await salesRows(`select count(*)::int n from nsw_sales_summary where period_type='month' and reference_period <= current_date and reference_period > (date '${cutoff}' - interval 12 month)`);
  const [d3] = await rentRows("select count(*)::int n from nsw_rental_summary");
  console.log(`\nDry run: would load ${num(d1.n)} annual sales rows (all years) + ${num(d2.n)} trailing-12-month sales rows (of full local history)`);
  console.log(`+ ${num(d3.n)} rent summary rows (all quarters, all NSW), rebuild all sales/rent/yield marts. Existing pilot rows untouched (ON CONFLICT DO NOTHING).`);
  duckSales.closeSync();
  duckRents.closeSync();
  await client.end();
  process.exit(0);
}

// ── Pre-read from DuckDB BEFORE opening the branch transaction ───────────

console.log("\n  pre-reading local stores (before transaction)...");
// Cap at today's real date: a single source data-entry error (settlement
// date typo, e.g. "2102" for "2012") can otherwise poison MAX() and shift
// the whole trailing-12-months window decades into the future.
const [maxPeriodRow] = await salesRows("select least(max(reference_period), current_date) mp from nsw_sales_summary where period_type='month'");
const monthlyCutoff = duckDate(maxPeriodRow.mp);
console.log(`  trailing-12-months cutoff: rows after ${monthlyCutoff} minus 12 months`);

// reference_period <= current_date excludes the handful of source
// data-entry errors (e.g. settlement date typo'd as "2102" instead of
// "2012") from ever being promoted — they stay harmlessly in the local
// transaction-level store, never corrected or guessed, just not summarised
// into a nonsensical future period.
const annualSalesRows = (await salesRows(
  `select geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
          transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price,
          upper_quartile_sale_price, min_sale_price, max_sale_price, sample_size_confidence
   from nsw_sales_summary where period_type='year' and reference_period <= current_date`
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
const monthlySalesRows = (await salesRows(
  `select geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
          transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price,
          upper_quartile_sale_price, min_sale_price, max_sale_price, sample_size_confidence
   from nsw_sales_summary where period_type='month' and reference_period <= current_date
     and reference_period > (date '${monthlyCutoff}' - interval 12 month)`
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
const rentSummaryRows = (await rentRows(
  `select geography_id, geography_type, geography_code, reference_period, dwelling_type, bedroom_count,
          median_weekly_rent, lower_quartile_weekly_rent, upper_quartile_weekly_rent,
          rental_count, total_bonds_held, sample_size_confidence
   from nsw_rental_summary`
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
duckSales.closeSync();
duckRents.closeSync();
console.log(`  pre-read: ${annualSalesRows.length} annual sales rows, ${monthlySalesRows.length} trailing-12m sales rows, ${rentSummaryRows.length} rent summary rows`);

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  raw_data_loaded_to_branch: false,
  kept_local: {
    sales_full_monthly_history: "all months outside the trailing 12 stay in warehouse/data/local/nsw_sales.duckdb only",
    sales_raw_transactions: "full transaction-level detail (all years, all NSW) stays local only",
    rent_full_sheet_detail: "raw quarterly sheet rows stay in warehouse/data/local/nsw_rents.duckdb only",
  },
  promoted: {
    sales_annual_all_years: true,
    sales_monthly_trailing_12: true,
    rent_quarterly_all_quarters: true,
    yield_marts: true,
  },
  loaded: {},
  skipped: {},
  gates_after: {},
  db_size_before: sizeBefore.pretty,
};

const insertBatchGeneric = async (rows, table, cols, buildTuple, conflictClause = "on conflict do nothing", batchSize = 500) => {
  let loaded = 0;
  let skippedOrphan = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize).filter((r) => {
      const ok = dimIds.has(r.geography_id);
      if (!ok) skippedOrphan++;
      return ok;
    });
    if (slice.length === 0) continue;
    const params = [];
    const tuples = slice.map((r) => {
      const b = params.length;
      params.push(...buildTuple(r));
      return `(${Array.from({ length: cols.length }, (_, j) => `$${b + j + 1}`).join(",")})`;
    });
    await client.query(`insert into ${table} (${cols.join(",")}) values ${tuples.join(",")} ${conflictClause}`, params);
    loaded += tuples.length; // attempted; ON CONFLICT DO NOTHING makes exact "new" count harder — reported via table delta instead
  }
  return { attempted: loaded, skippedOrphan };
};

try {
  await client.query("begin");

  // 1. meta lineage — distinct dataset_ids so pilot vs full-state runs are traceable.
  await client.query(`
    insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent, source_url, licence, access_method, update_frequency, implementation_status)
    values ('nsw_vg_sales','NSW Valuer General Property Sales Information','NSW Valuer General','sales','official','https://valuation.property.nsw.gov.au/embed/propertySalesInformation','CC BY 4.0','file_download','weekly','live')
    on conflict (source_id) do update set implementation_status='live', updated_at=now()`);
  await client.query(`
    insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent, source_url, licence, access_method, update_frequency, implementation_status)
    values ('nsw_rent_and_sales_report','NSW DCJ Rent and Sales Report','NSW Department of Communities and Justice','rentals','official','https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html','NSW Government open statistical report','file_download','quarterly','live')
    on conflict (source_id) do update set implementation_status='live', updated_at=now()`);
  await client.query(`
    insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
    values ('nsw_psi_2001_current_full_state','nsw_vg_sales','NSW VG PSI — full state, 2001-current','SAL,POA','2001','2026','zip_dat','weekly',
      'Full NSW coverage (4,542 SAL, 2,641 POA). Annual grain: all years. Monthly grain: trailing 12 months only — full local history stays local-only.')
    on conflict (dataset_id) do nothing`);
  await client.query(`
    insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
    values ('nsw_rent_tables_full_state','nsw_rent_and_sales_report','NSW DCJ Rent tables — full state','LGA,POA','2021-Q1','2026-Q1','xlsx','quarterly',
      'Full NSW coverage (129 LGAs, all postcodes).')
    on conflict (dataset_id) do nothing`);
  const { rows: salesRunRows } = await client.query("insert into meta.load_run (dataset_id, run_status) values ('nsw_psi_2001_current_full_state','running') returning load_run_id");
  const salesRunId = salesRunRows[0].load_run_id;
  const { rows: rentRunRows } = await client.query("insert into meta.load_run (dataset_id, run_status) values ('nsw_rent_tables_full_state','running') returning load_run_id");
  const rentRunId = rentRunRows[0].load_run_id;
  for (const f of salesInventory.files) {
    await client.query(
      `insert into meta.source_file (load_run_id, source_id, source_url, file_name, file_format, file_hash, reference_period)
       values ($1,'nsw_vg_sales',$2,$3,'zip',$4,$5)`,
      [salesRunId, f.file, f.file, f.sha256, f.kind === "annual_bundle" ? f.file.match(/(\d{4})/)[1] : "2026"]);
  }
  for (const f of rentsInventory.files) {
    await client.query(
      `insert into meta.source_file (load_run_id, source_id, source_url, file_name, file_format, file_hash, reference_period)
       values ($1,'nsw_rent_and_sales_report',$2,$3,'xlsx',$4,$5)`,
      [rentRunId, f.source_url, f.file, f.sha256, f.quarter]);
  }
  console.log(`\n  meta: 2 sources + 2 datasets + 2 load runs + ${salesInventory.files.length + rentsInventory.files.length} source files registered`);

  // 2. core.fact_residential_sales_summary — annual (all years) + monthly (trailing 12).
  const salesFactCols = ["geography_id", "geography_type", "geography_code", "reference_period", "period_type", "dwelling_type",
    "transaction_count", "median_sale_price", "mean_sale_price", "lower_quartile_sale_price", "upper_quartile_sale_price",
    "min_sale_price", "max_sale_price", "sample_size_confidence", "source_id", "dataset_id", "load_run_id", "data_quality_status", "confidence_label"];
  const buildSalesTuple = (r) => [
    r.geography_id, r.geography_type, r.geography_code, r.reference_period, r.period_type, r.dwelling_type,
    num(r.transaction_count), r.median_sale_price, r.mean_sale_price, r.lower_quartile_sale_price,
    r.upper_quartile_sale_price, r.min_sale_price, r.max_sale_price, r.sample_size_confidence,
    "nsw_vg_sales", "nsw_psi_2001_current_full_state", salesRunId, "passed", r.sample_size_confidence,
  ];
  const annualResult = await insertBatchGeneric(annualSalesRows, "core.fact_residential_sales_summary", salesFactCols, buildSalesTuple);
  const monthlyResult = await insertBatchGeneric(monthlySalesRows, "core.fact_residential_sales_summary", salesFactCols, buildSalesTuple);
  console.log(`  core.fact_residential_sales_summary: attempted ${annualResult.attempted} annual + ${monthlyResult.attempted} trailing-12m rows (${annualResult.skippedOrphan + monthlyResult.skippedOrphan} orphans skipped)`);
  report.loaded.sales_annual_attempted = annualResult.attempted;
  report.loaded.sales_monthly_trailing12_attempted = monthlyResult.attempted;
  await client.query(
    "update meta.load_run set run_status='succeeded', finished_at=now(), records_extracted=$2, records_loaded=$3 where load_run_id=$1",
    [salesRunId, annualSalesRows.length + monthlySalesRows.length, annualResult.attempted + monthlyResult.attempted]);

  // 3. core.fact_rental_market_summary — all quarters, full state.
  const rentFactCols = ["geography_id", "geography_type", "geography_code", "reference_period", "period_type", "dwelling_type", "bedroom_count",
    "median_weekly_rent", "lower_quartile_weekly_rent", "upper_quartile_weekly_rent", "rental_count", "total_bonds_held",
    "source_id", "dataset_id", "load_run_id", "data_quality_status", "confidence_label"];
  const buildRentTuple = (r) => [
    r.geography_id, r.geography_type, r.geography_code, r.reference_period, "quarter", r.dwelling_type,
    r.bedroom_count === null || r.bedroom_count === undefined ? null : num(r.bedroom_count),
    r.median_weekly_rent, r.lower_quartile_weekly_rent, r.upper_quartile_weekly_rent,
    r.rental_count === null ? null : num(r.rental_count), r.total_bonds_held === null ? null : num(r.total_bonds_held),
    "nsw_rent_and_sales_report", "nsw_rent_tables_full_state", rentRunId, "passed", r.sample_size_confidence,
  ];
  // bedroom_count is NULL for "Total" rows — SQL NULL is never equal to
  // NULL, so the plain unique constraint alone would let duplicate "Total"
  // rows through once the table already has data from a prior load. Target
  // the coalesce(-1)-based expression index (created ahead of this run)
  // explicitly so NULL "Total" cells correctly collide.
  const rentResult = await insertBatchGeneric(
    rentSummaryRows, "core.fact_rental_market_summary", rentFactCols, buildRentTuple,
    "on conflict (geography_id, reference_period, dwelling_type, (coalesce(bedroom_count, -1))) do nothing"
  );
  console.log(`  core.fact_rental_market_summary: attempted ${rentResult.attempted} rows (${rentResult.skippedOrphan} orphans skipped)`);
  report.loaded.rent_attempted = rentResult.attempted;
  await client.query(
    "update meta.load_run set run_status='succeeded', finished_at=now(), records_extracted=$2, records_loaded=$3 where load_run_id=$1",
    [rentRunId, rentSummaryRows.length, rentResult.attempted]);

  // 4. Sales marts — rebuild from the (now expanded) core fact table.
  const buildSalesMart = async (geoType, periodType, periodCol, table, extraWhere = "") => {
    const r = await client.query(`
      insert into ${table}
        (geography_id, geography_name, state_code, ${periodCol}, dwelling_type,
         transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price, upper_quartile_sale_price,
         sample_size_confidence, confidence_label, source_summary)
      select f.geography_id, d.geography_name, d.state_code, f.reference_period, f.dwelling_type,
             f.transaction_count, f.median_sale_price, f.mean_sale_price, f.lower_quartile_sale_price, f.upper_quartile_sale_price,
             f.sample_size_confidence, f.confidence_label,
             jsonb_build_object('source','nsw_vg_sales','dataset','nsw_psi_2001_current_full_state','method','direct_suburb_postcode_match','scope','full_state_nsw')
      from core.fact_residential_sales_summary f
      join core.dim_geography d on d.geography_id = f.geography_id
      where f.geography_type = '${geoType}' and f.period_type = '${periodType}' ${extraWhere}
      on conflict (geography_id, ${periodCol}, dwelling_type) do nothing`);
    console.log(`  ${table}: ${r.rowCount} new rows built`);
    return r.rowCount;
  };
  report.loaded.suburb_sales_monthly = await buildSalesMart("SAL", "month", "reference_month", "mart.suburb_sales_monthly", `and f.reference_period > (date '${monthlyCutoff}' - interval '12 months')`);
  report.loaded.suburb_sales_annual = await buildSalesMart("SAL", "year", "reference_year", "mart.suburb_sales_annual");
  report.loaded.postcode_sales_monthly = await buildSalesMart("POA", "month", "reference_month", "mart.postcode_sales_monthly", `and f.reference_period > (date '${monthlyCutoff}' - interval '12 months')`);
  report.loaded.postcode_sales_annual = await buildSalesMart("POA", "year", "reference_year", "mart.postcode_sales_annual");

  // 5. Rent marts — postcode direct + suburb derived via POA->SAL correspondence (Sprint 6 method).
  const postcodeRentResult = await client.query(`
    insert into mart.postcode_rent_quarterly
      (geography_id, geography_name, state_code, reference_quarter, dwelling_type,
       median_weekly_rent, rental_count, sample_size_confidence, confidence_label, correspondence_method, source_summary)
    select f.geography_id, d.geography_name, d.state_code, f.reference_period, f.dwelling_type,
           f.median_weekly_rent, f.rental_count, f.confidence_label, f.confidence_label,
           'direct_postcode_match',
           jsonb_build_object('source','nsw_rent_and_sales_report','dataset','nsw_rent_tables_full_state','scope','full_state_nsw')
    from core.fact_rental_market_summary f
    join core.dim_geography d on d.geography_id = f.geography_id
    where f.geography_type = 'POA' and f.bedroom_count is null
    on conflict (geography_id, reference_quarter, dwelling_type) do nothing`);
  console.log(`  mart.postcode_rent_quarterly: ${postcodeRentResult.rowCount} new rows built`);
  report.loaded.postcode_rent_quarterly = postcodeRentResult.rowCount;

  const suburbRentResult = await client.query(`
    with poa_to_sal as (
      select a.target_geography_id as poa_id, b.target_geography_id as sal_id,
             sum(a.preferred_weight * b.preferred_weight) as raw_weight
      from core.bridge_geography_correspondence a
      join core.bridge_geography_correspondence b on a.source_geography_id = b.source_geography_id
      where a.source_geography_type = 'SA1' and b.source_geography_type = 'SA1'
        and a.target_geography_type = 'POA' and b.target_geography_type = 'SAL'
        and a.correspondence_version = '${BV}' and b.correspondence_version = '${BV}'
        and a.preferred_weight is not null and b.preferred_weight is not null
      group by 1, 2
    ),
    poa_to_sal_norm as (
      select poa_id, sal_id, raw_weight / nullif(sum(raw_weight) over (partition by poa_id), 0) as weight
      from poa_to_sal
      where raw_weight > 0
    ),
    contrib as (
      select ps.sal_id, prc.reference_quarter, prc.dwelling_type, ps.weight, prc.median_weekly_rent, prc.rental_count
      from mart.postcode_rent_quarterly prc
      join poa_to_sal_norm ps on ps.poa_id = prc.geography_id
      where prc.median_weekly_rent is not null
    )
    insert into mart.suburb_rent_quarterly
      (geography_id, geography_name, state_code, reference_quarter, dwelling_type,
       median_weekly_rent, rental_count, sample_size_confidence, confidence_label, correspondence_method, source_summary)
    select c.sal_id, d.geography_name, d.state_code, c.reference_quarter, c.dwelling_type,
           round(sum(c.median_weekly_rent * c.weight) / sum(c.weight), 2),
           round(sum(coalesce(c.rental_count,0) * c.weight))::int,
           case when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 30 then 'high'
                when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 10 then 'medium'
                when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 5 then 'low' else 'insufficient' end,
           case when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 30 then 'high'
                when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 10 then 'medium'
                when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 5 then 'low' else 'insufficient' end,
           'poa_to_sal_dwelling_weighted',
           jsonb_build_object('source','nsw_rent_and_sales_report','dataset','nsw_rent_tables_full_state',
                               'method','weighted_average_of_postcode_medians','poa_weight_coverage',round(sum(c.weight),4),'scope','full_state_nsw')
    from contrib c
    join core.dim_geography d on d.geography_id = c.sal_id
    group by c.sal_id, d.geography_name, d.state_code, c.reference_quarter, c.dwelling_type
    having sum(c.weight) >= 0.3
    on conflict (geography_id, reference_quarter, dwelling_type) do nothing`);
  console.log(`  mart.suburb_rent_quarterly: ${suburbRentResult.rowCount} new rows built`);
  report.loaded.suburb_rent_quarterly = suburbRentResult.rowCount;

  // 6. Yield marts — rebuilt against the now-expanded marts (Sprint 6 method).
  const buildYield = async (rentTable, salesTable, yieldTable) => {
    const r = await client.query(`
      insert into ${yieldTable}
        (geography_id, geography_name, state_code, reference_period, dwelling_type,
         median_sale_price, median_weekly_rent, annualised_rent, gross_yield_percentage,
         sales_transaction_count, rental_sample_count, sales_confidence_label, rental_confidence_label,
         yield_confidence_label, source_summary)
      select rt.geography_id, d.geography_name, d.state_code, rt.reference_quarter, rt.dwelling_type,
             sa.median_sale_price, rt.median_weekly_rent, rt.median_weekly_rent * 52 as annualised_rent,
             case when sa.median_sale_price is not null and sa.median_sale_price > 0
                       and coalesce(sa.sample_size_confidence,'insufficient') in ('high','medium')
                       and coalesce(rt.sample_size_confidence,'insufficient') in ('high','medium')
                  then round(((rt.median_weekly_rent * 52) / sa.median_sale_price) * 100, 3)
                  else null end as gross_yield_percentage,
             sa.transaction_count, rt.rental_count,
             coalesce(sa.sample_size_confidence, 'insufficient'), coalesce(rt.sample_size_confidence, 'insufficient'),
             case when sa.median_sale_price is null or rt.median_weekly_rent is null then 'insufficient'
                  when coalesce(sa.sample_size_confidence,'insufficient') not in ('high','medium')
                    or coalesce(rt.sample_size_confidence,'insufficient') not in ('high','medium') then 'insufficient'
                  when sa.sample_size_confidence = 'high' and rt.sample_size_confidence = 'high' then 'high'
                  else 'medium' end as yield_confidence_label,
             jsonb_build_object('sales_source','nsw_vg_sales','rent_source','nsw_rent_and_sales_report',
                                 'sales_period_basis','annual figure for the calendar year containing the rent quarter',
                                 'formula','gross_yield_percentage = (median_weekly_rent * 52) / median_sale_price * 100',
                                 'scope','full_state_nsw')
      from ${rentTable} rt
      join core.dim_geography d on d.geography_id = rt.geography_id
      left join ${salesTable} sa
        on sa.geography_id = rt.geography_id and sa.dwelling_type = rt.dwelling_type
       and sa.reference_year = date_trunc('year', rt.reference_quarter)::date
      where rt.median_weekly_rent is not null
      on conflict (geography_id, reference_period, dwelling_type) do nothing`);
    console.log(`  ${yieldTable}: ${r.rowCount} new rows built`);
    return r.rowCount;
  };
  report.loaded.postcode_yield_quarterly = await buildYield("mart.postcode_rent_quarterly", "mart.postcode_sales_annual", "mart.postcode_yield_quarterly");
  report.loaded.suburb_yield_quarterly = await buildYield("mart.suburb_rent_quarterly", "mart.suburb_sales_annual", "mart.suburb_yield_quarterly");

  // ── Post-load blocking gates ───────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select geography_id, reference_period, period_type, dwelling_type from core.fact_residential_sales_summary group by 1,2,3,4 having count(*)>1) d) as dup_sales_fact,
    (select count(*)::int from (select geography_id, reference_period, dwelling_type, bedroom_count from core.fact_rental_market_summary group by 1,2,3,4 having count(*)>1) d) as dup_rent_fact,
    (select count(*)::int from core.fact_residential_sales_summary where geography_id is null) as null_geo_sales,
    (select count(*)::int from core.fact_rental_market_summary where geography_id is null) as null_geo_rent,
    (select count(*)::int from core.fact_residential_sales_summary where median_sale_price < 0) as negative_price,
    (select count(*)::int from core.fact_rental_market_summary where median_weekly_rent < 0) as negative_rent,
    (select count(*)::int from core.fact_residential_sales_summary f where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_sales,
    (select count(*)::int from core.fact_rental_market_summary f where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_rent,
    (select count(*)::int from mart.suburb_yield_quarterly where gross_yield_percentage is not null and yield_confidence_label = 'insufficient') as yield_bad1,
    (select count(*)::int from mart.postcode_yield_quarterly where gross_yield_percentage is not null and yield_confidence_label = 'insufficient') as yield_bad2,
    (select count(*)::int from (select geography_id, reference_period, dwelling_type from mart.suburb_yield_quarterly group by 1,2,3 having count(*)>1)) as dup_yield_sal,
    (select count(*)::int from (select geography_id, reference_period, dwelling_type from mart.postcode_yield_quarterly group by 1,2,3 having count(*)>1)) as dup_yield_poa,
    pg_size_pretty(pg_database_size(current_database())) as db_size_now`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup_sales=${post.dup_sales_fact} dup_rent=${post.dup_rent_fact} null_geo=${Number(post.null_geo_sales)+Number(post.null_geo_rent)} negative=${Number(post.negative_price)+Number(post.negative_rent)} orphans=${Number(post.orphan_sales)+Number(post.orphan_rent)} yield_missing_label=${Number(post.yield_bad1)+Number(post.yield_bad2)} dup_yield=${Number(post.dup_yield_sal)+Number(post.dup_yield_poa)} db_now=${post.db_size_now}`);
  const gateFailed = post.dup_sales_fact || post.dup_rent_fact || post.null_geo_sales || post.null_geo_rent ||
    post.negative_price || post.negative_rent || post.orphan_sales || post.orphan_rent ||
    post.yield_bad1 || post.yield_bad2 || post.dup_yield_sal || post.dup_yield_poa;
  if (gateFailed) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  for (const [rule, failed] of [
    ["no_duplicate_grain", Number(post.dup_sales_fact) + Number(post.dup_rent_fact)],
    ["nulls_not_zero", Number(post.null_geo_sales) + Number(post.null_geo_rent)],
    ["geo_code_valid", Number(post.orphan_sales) + Number(post.orphan_rent)],
    ["price_range_sanity", Number(post.negative_price) + Number(post.negative_rent)],
  ]) {
    await client.query(
      "insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details) values ($1,'blocker',$2,$3,$4)",
      [rule, failed === 0 ? "passed" : "failed", failed, JSON.stringify({ stage: "nsw_full_state_branch_load" })]);
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched; no raw data loaded).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

// ── Post-commit summary + full-state yield report ────────────────────────

const [summary] = await q(`select
  (select count(*)::int from core.fact_residential_sales_summary) as sales_facts,
  (select count(*)::int from core.fact_rental_market_summary) as rent_facts,
  (select count(*)::int from mart.suburb_sales_monthly) as ssm, (select count(*)::int from mart.suburb_sales_annual) as ssa,
  (select count(*)::int from mart.postcode_sales_monthly) as psm, (select count(*)::int from mart.postcode_sales_annual) as psa,
  (select count(*)::int from mart.suburb_rent_quarterly) as srq, (select count(*)::int from mart.postcode_rent_quarterly) as prq,
  (select count(*)::int from mart.suburb_yield_quarterly) as syq, (select count(*)::int from mart.postcode_yield_quarterly) as pyq,
  (select json_object_agg(l,n) from (select sample_size_confidence l, count(*)::int n from core.fact_residential_sales_summary group by 1) x) as sales_confidence_dist,
  (select json_object_agg(l,n) from (select confidence_label l, count(*)::int n from core.fact_rental_market_summary group by 1) x) as rent_confidence_dist,
  (select json_object_agg(l,n) from (select yield_confidence_label l, count(*)::int n from mart.suburb_yield_quarterly group by 1) x) as suburb_yield_dist,
  (select json_object_agg(l,n) from (select yield_confidence_label l, count(*)::int n from mart.postcode_yield_quarterly group by 1) x) as postcode_yield_dist,
  (select round(avg(gross_yield_percentage),2) from mart.postcode_yield_quarterly where gross_yield_percentage is not null) as postcode_avg_yield,
  (select round(min(gross_yield_percentage),2) from mart.postcode_yield_quarterly where gross_yield_percentage is not null) as postcode_min_yield,
  (select round(max(gross_yield_percentage),2) from mart.postcode_yield_quarterly where gross_yield_percentage is not null) as postcode_max_yield,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state = summary;
report.db_size_after = summary.db_size;
fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2) + "\n");

const yieldReport = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  scope: "full_state_nsw",
  suburb_yield_rows: summary.syq,
  postcode_yield_rows: summary.pyq,
  suburb_yield_confidence_distribution: summary.suburb_yield_dist,
  postcode_yield_confidence_distribution: summary.postcode_yield_dist,
  postcode_avg_gross_yield_pct: summary.postcode_avg_yield,
  postcode_gross_yield_range_pct: [summary.postcode_min_yield, summary.postcode_max_yield],
  is_recommendation_score_avm_or_forecast: false,
  note: "Gross yield is a descriptive statistic combining independently-sourced quarterly rent and annual sales medians, now covering all of NSW. Not investment advice.",
};
fs.writeFileSync(YIELD_REPORT, JSON.stringify(yieldReport, null, 2) + "\n");

await client.end();
console.log("\nRun reports written:");
console.log("  warehouse/reports/nsw_full_state_branch_load_report.json");
console.log("  warehouse/reports/nsw_full_state_yield_report.json");
console.log(`sales_facts=${summary.sales_facts} rent_facts=${summary.rent_facts} suburb_yield=${summary.syq} postcode_yield=${summary.pyq} db=${summary.db_size}`);
