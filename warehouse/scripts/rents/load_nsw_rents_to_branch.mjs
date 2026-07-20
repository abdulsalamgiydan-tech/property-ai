#!/usr/bin/env node
/**
 * NSW rental market — branch-only curated load + gross yield (Sprint 6, Part E-F).
 *
 * Loads ONLY the pre-aggregated local rent summary (never raw sheet rows)
 * into the warehouse-validation Supabase branch, then builds gross-yield
 * marts by combining it with the Sprint 5 NSW VG sales pilot marts already
 * on the branch:
 *   1. meta lineage
 *   2. core.fact_rental_market_summary — the local nsw_rental_summary table
 *      as-is (28,139 rows: LGA + POA, quarterly, by dwelling type/bedroom)
 *   3. mart.postcode_rent_quarterly — direct from the POA-grain fact rows
 *      (POA is DCJ's native fine grain; correspondence_method =
 *      'direct_postcode_match')
 *   4. mart.suburb_rent_quarterly — DERIVED. DCJ never publishes at suburb
 *      (SAL) grain, so SAL rent is built by chaining the existing SA1->POA
 *      and SA1->SAL dwelling-weighted correspondence (core.bridge_geography_
 *      correspondence, Sprints 2-3) into a POA->SAL weight, then taking a
 *      weighted average of the contributing POAs' median rents. This is an
 *      approximation (a weighted average of published medians, not a
 *      recomputed median from underlying microdata DCJ does not publish) —
 *      documented via correspondence_method = 'poa_to_sal_dwelling_weighted'
 *      and only published where combined POA coverage is meaningful.
 *   5. mart.postcode_yield_quarterly / suburb_yield_quarterly — gross yield,
 *      matching each rent quarter's dwelling_type against the Sprint 5
 *      ANNUAL sales mart for the calendar year containing that quarter
 *      (sales_period_basis documented in source_summary). Yield is computed
 *      ONLY when both sides have non-NULL data and confidence >= 'medium';
 *      every other combination still gets a row with NULL yield and
 *      yield_confidence_label = 'insufficient' — never a silently-skipped
 *      or fabricated figure. This is a descriptive research statistic, not
 *      a recommendation/score/AVM/forecast (also stated in the table
 *      comments from migration 009).
 *
 * No raw rent sheet rows are ever loaded to Supabase.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-gates
 * (rollback on failure); all local-store reads happen before BEGIN.
 *
 * Usage:
 *   node load_nsw_rents_to_branch.mjs             # dry run
 *   node load_nsw_rents_to_branch.mjs --execute
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

const DB_PATH = rel("warehouse", "data", "local", "nsw_rents.duckdb");
const LOCAL_REPORT = rel("warehouse", "reports", "nsw_rental_bonds_local_store_report.json");
const INVENTORY = rel("warehouse", "reports", "nsw_rental_bonds_download_inventory.json");
const RUN_REPORT = rel("warehouse", "reports", "nsw_rental_bonds_branch_load_report.json");
const YIELD_REPORT = rel("warehouse", "reports", "nsw_yield_pilot_report.json");

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
if (!fs.existsSync(DB_PATH)) fail("local NSW rents store missing — run build_nsw_rents_local_store.mjs");
if (!fs.existsSync(LOCAL_REPORT) || JSON.parse(fs.readFileSync(LOCAL_REPORT, "utf8")).verdict !== "PASSED") {
  fail("local store validation is not PASSED — refusing to load (hard stop)");
}
const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));

console.log(`load_nsw_rents_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);
console.log("  scope: curated rent summary + derived marts + gross-yield marts only — no raw sheet rows loaded");

const duckInstance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const duck = await duckInstance.connect();
const duckRows = async (sql) => (await duck.runAndReadAll(sql)).getRowObjects();

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

{
  const t = await q(`select to_regclass('core.fact_rental_market_summary') a,
                            to_regclass('mart.suburb_rent_quarterly') b, to_regclass('mart.postcode_rent_quarterly') c,
                            to_regclass('mart.suburb_yield_quarterly') d, to_regclass('mart.postcode_yield_quarterly') e,
                            to_regclass('mart.suburb_sales_annual') f, to_regclass('mart.postcode_sales_annual') g`);
  if (Object.values(t[0]).some((v) => !v)) fail("required tables missing on branch — apply migration 009 and confirm Sprint 5 marts exist first (hard stop)");
}
const [dimCheck] = await q("select count(*)::int n from core.dim_geography where boundary_version=$1 and geography_type in ('LGA','POA','SAL')", [BV]);
if (dimCheck.n < 18000) fail(`core.dim_geography LGA/POA/SAL rows look unpopulated (${dimCheck.n}) — geography backbone required (hard stop)`);
const [salesCheck] = await q("select count(*)::int n from mart.postcode_sales_annual");
if (salesCheck.n === 0) fail("mart.postcode_sales_annual is empty — Sprint 5 sales pilot required for yield calculation (hard stop)");

const dimIds = new Set((await q("select geography_id from core.dim_geography where boundary_version=$1 and geography_type in ('LGA','POA')", [BV])).map((r) => r.geography_id));

const [preState] = await q(`select
  (select count(*)::int from core.fact_rental_market_summary) facts,
  (select count(*)::int from mart.suburb_rent_quarterly) srq,
  (select count(*)::int from mart.postcode_rent_quarterly) prq,
  (select count(*)::int from mart.suburb_yield_quarterly) syq,
  (select count(*)::int from mart.postcode_yield_quarterly) pyq`);
console.log(`  branch state: facts=${preState.facts} suburb_rent=${preState.srq} postcode_rent=${preState.prq} suburb_yield=${preState.syq} postcode_yield=${preState.pyq}`);

if (!EXECUTE) {
  const [d] = await duckRows("select count(*)::int n from nsw_rental_summary");
  console.log(`\nDry run: local summary has ${num(d.n)} rows. Would load core.fact_rental_market_summary,`);
  console.log("build postcode rent mart (direct) + suburb rent mart (derived via POA->SAL correspondence chain),");
  console.log("then build both gross-yield marts against the Sprint 5 annual sales marts. Phases with existing rows are skipped.");
  duck.closeSync();
  await client.end();
  process.exit(0);
}

// ── Pre-read from DuckDB BEFORE opening the branch transaction ───────────

console.log("\n  pre-reading local summary (before transaction)...");
const summaryRows = (await duckRows(
  `select geography_id, geography_type, geography_code, reference_period, dwelling_type, bedroom_count,
          median_weekly_rent, lower_quartile_weekly_rent, upper_quartile_weekly_rent,
          rental_count, total_bonds_held, sample_size_confidence
   from nsw_rental_summary`
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
duck.closeSync();
console.log(`  pre-read: ${summaryRows.length} summary rows`);

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

  // 1. meta lineage.
  await client.query(`
    insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent,
      source_url, licence, access_method, update_frequency, implementation_status)
    values ('nsw_rent_and_sales_report','NSW DCJ Rent and Sales Report','NSW Department of Communities and Justice','rentals','official',
      'https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html',
      'NSW Government open statistical report','file_download','quarterly','in_progress')
    on conflict (source_id) do update set implementation_status='in_progress', updated_at=now()`);
  await client.query(
    `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
     values ('nsw_rent_tables_pilot','nsw_rent_and_sales_report','NSW DCJ Rent tables — pilot (6 LGAs)','LGA,POA','2021-Q1','2026-Q1','xlsx','quarterly',
     'Pilot scope: Blacktown, Parramatta, Camden, Wollongong, Newcastle, Shellharbour. Curated summary only.')
     on conflict (dataset_id) do nothing`);
  const { rows: runRows } = await client.query(
    "insert into meta.load_run (dataset_id, run_status) values ('nsw_rent_tables_pilot','running') returning load_run_id");
  const runId = runRows[0].load_run_id;
  for (const f of inventory.files) {
    await client.query(
      `insert into meta.source_file (load_run_id, source_id, source_url, file_name, file_format, file_hash, reference_period)
       values ($1,'nsw_rent_and_sales_report',$2,$3,'xlsx',$4,$5)`,
      [runId, f.source_url, f.file, f.sha256, f.quarter]);
  }
  console.log(`\n  meta: source + dataset + load run + ${inventory.files.length} source files registered`);

  // 2. core.fact_rental_market_summary
  let factsLoaded = 0;
  let factsSkippedOrphan = 0;
  if (preState.facts > 0) {
    console.log(`  core.fact_rental_market_summary: ${preState.facts} rows already present — phase skipped`);
    report.skipped.fact_rental_market_summary = `phase skipped: ${preState.facts} rows already present`;
  } else {
    for (let i = 0; i < summaryRows.length; i += 500) {
      const slice = summaryRows.slice(i, i + 500).filter((r) => {
        const ok = dimIds.has(r.geography_id);
        if (!ok) factsSkippedOrphan++;
        return ok;
      });
      if (slice.length === 0) continue;
      const params = [];
      const COLS = 17;
      const tuples = slice.map((r) => {
        const b = params.length;
        params.push(
          r.geography_id, r.geography_type, r.geography_code, r.reference_period, "quarter", r.dwelling_type,
          r.bedroom_count === null || r.bedroom_count === undefined ? null : num(r.bedroom_count),
          r.median_weekly_rent, r.lower_quartile_weekly_rent, r.upper_quartile_weekly_rent,
          r.rental_count === null ? null : num(r.rental_count), r.total_bonds_held === null ? null : num(r.total_bonds_held),
          "nsw_rent_and_sales_report", "nsw_rent_tables_pilot", runId, "passed", r.sample_size_confidence
        );
        return `(${Array.from({ length: COLS }, (_, j) => `$${b + j + 1}`).join(",")})`;
      });
      await client.query(
        `insert into core.fact_rental_market_summary
           (geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type, bedroom_count,
            median_weekly_rent, lower_quartile_weekly_rent, upper_quartile_weekly_rent, rental_count, total_bonds_held,
            source_id, dataset_id, load_run_id, data_quality_status, confidence_label)
         values ${tuples.join(",")}`,
        params);
      factsLoaded += slice.length;
    }
    console.log(`  core.fact_rental_market_summary: ${factsLoaded} rows (${factsSkippedOrphan} rows skipped — geography not in core.dim_geography)`);
  }
  report.loaded.fact_rental_market_summary = factsLoaded;
  report.skipped.fact_rental_market_summary_orphans = factsSkippedOrphan;
  await client.query(
    "update meta.load_run set run_status='succeeded', finished_at=now(), records_extracted=$2, records_loaded=$3, records_quarantined=$4 where load_run_id=$1",
    [runId, summaryRows.length, factsLoaded, factsSkippedOrphan]);

  // 3. mart.postcode_rent_quarterly — direct from core fact (POA native grain).
  if (preState.prq > 0) {
    console.log(`  mart.postcode_rent_quarterly: ${preState.prq} rows already present — phase skipped`);
    report.skipped.postcode_rent_quarterly = `phase skipped: ${preState.prq} rows already present`;
  } else {
    const r = await client.query(`
      insert into mart.postcode_rent_quarterly
        (geography_id, geography_name, state_code, reference_quarter, dwelling_type,
         median_weekly_rent, rental_count, sample_size_confidence, confidence_label, correspondence_method, source_summary)
      select f.geography_id, d.geography_name, d.state_code, f.reference_period, f.dwelling_type,
             f.median_weekly_rent, f.rental_count, f.confidence_label, f.confidence_label,
             'direct_postcode_match',
             jsonb_build_object('source','nsw_rent_and_sales_report','dataset','nsw_rent_tables_pilot')
      from core.fact_rental_market_summary f
      join core.dim_geography d on d.geography_id = f.geography_id
      where f.geography_type = 'POA' and f.bedroom_count is null
      on conflict (geography_id, reference_quarter, dwelling_type) do nothing`);
    console.log(`  mart.postcode_rent_quarterly: ${r.rowCount} rows built`);
    report.loaded.postcode_rent_quarterly = r.rowCount;
  }

  // 4. mart.suburb_rent_quarterly — DERIVED via chained POA->SAL correspondence.
  if (preState.srq > 0) {
    console.log(`  mart.suburb_rent_quarterly: ${preState.srq} rows already present — phase skipped`);
    report.skipped.suburb_rent_quarterly = `phase skipped: ${preState.srq} rows already present`;
  } else {
    const r = await client.query(`
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
        select ps.sal_id, prc.reference_quarter, prc.dwelling_type, ps.weight,
               prc.median_weekly_rent, prc.rental_count
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
                  when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 5 then 'low'
                  else 'insufficient' end,
             case when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 30 then 'high'
                  when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 10 then 'medium'
                  when round(sum(coalesce(c.rental_count,0) * c.weight)) >= 5 then 'low'
                  else 'insufficient' end,
             'poa_to_sal_dwelling_weighted',
             jsonb_build_object('source','nsw_rent_and_sales_report','dataset','nsw_rent_tables_pilot',
                                 'method','weighted_average_of_postcode_medians','poa_weight_coverage',round(sum(c.weight),4))
      from contrib c
      join core.dim_geography d on d.geography_id = c.sal_id
      group by c.sal_id, d.geography_name, d.state_code, c.reference_quarter, c.dwelling_type
      having sum(c.weight) >= 0.3
      on conflict (geography_id, reference_quarter, dwelling_type) do nothing`);
    console.log(`  mart.suburb_rent_quarterly: ${r.rowCount} rows built (derived, POA coverage >= 30% required)`);
    report.loaded.suburb_rent_quarterly = r.rowCount;
  }

  // 5. Gross yield marts — join rent quarter's dwelling_type against the
  // Sprint 5 ANNUAL sales mart for the calendar year containing that
  // quarter. Every rent-quarter row is represented (LEFT JOIN); yield is
  // only computed where both sides have real data and confidence >= medium.
  const buildYield = async (rentTable, salesTable, yieldTable) => {
    const already = await q(`select count(*)::int n from ${yieldTable}`);
    if (already[0].n > 0) {
      console.log(`  ${yieldTable}: ${already[0].n} rows already present — phase skipped`);
      report.skipped[yieldTable] = `phase skipped: ${already[0].n} rows already present`;
      return 0;
    }
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
                                 'formula','gross_yield_percentage = (median_weekly_rent * 52) / median_sale_price * 100')
      from ${rentTable} rt
      join core.dim_geography d on d.geography_id = rt.geography_id
      left join ${salesTable} sa
        on sa.geography_id = rt.geography_id and sa.dwelling_type = rt.dwelling_type
       and sa.reference_year = date_trunc('year', rt.reference_quarter)::date
      where rt.median_weekly_rent is not null
      on conflict (geography_id, reference_period, dwelling_type) do nothing`);
    console.log(`  ${yieldTable}: ${r.rowCount} rows built`);
    return r.rowCount;
  };
  report.loaded.postcode_yield_quarterly = await buildYield("mart.postcode_rent_quarterly", "mart.postcode_sales_annual", "mart.postcode_yield_quarterly");
  report.loaded.suburb_yield_quarterly = await buildYield("mart.suburb_rent_quarterly", "mart.suburb_sales_annual", "mart.suburb_yield_quarterly");

  // ── Post-load blocking gates ───────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select geography_id, reference_period, dwelling_type, bedroom_count
       from core.fact_rental_market_summary group by 1,2,3,4 having count(*)>1) d) as dup_fact_grain,
    (select count(*)::int from core.fact_rental_market_summary where geography_id is null) as null_geo_ids,
    (select count(*)::int from core.fact_rental_market_summary where median_weekly_rent < 0) as negative_rent,
    (select count(*)::int from core.fact_rental_market_summary f
      where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_facts,
    (select count(*)::int from mart.suburb_yield_quarterly where gross_yield_percentage is not null and yield_confidence_label = 'insufficient') as yield_without_label,
    (select count(*)::int from mart.postcode_yield_quarterly where gross_yield_percentage is not null and yield_confidence_label = 'insufficient') as yield_without_label_poa,
    (select count(*)::int from (select geography_id, reference_period, dwelling_type from mart.suburb_yield_quarterly group by 1,2,3 having count(*)>1)) as dup_yield_sal,
    (select count(*)::int from (select geography_id, reference_period, dwelling_type from mart.postcode_yield_quarterly group by 1,2,3 having count(*)>1)) as dup_yield_poa`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup_grain=${post.dup_fact_grain} null_geo=${post.null_geo_ids} negative_rent=${post.negative_rent} orphans=${post.orphan_facts} yield_missing_label=${Number(post.yield_without_label)+Number(post.yield_without_label_poa)} dup_yield=${Number(post.dup_yield_sal)+Number(post.dup_yield_poa)}`);
  const gateFailed = post.dup_fact_grain || post.null_geo_ids || post.negative_rent || post.orphan_facts ||
    post.yield_without_label || post.yield_without_label_poa || post.dup_yield_sal || post.dup_yield_poa;
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
    await client.query(
      "insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details) values ($1,'blocker',$2,$3,$4)",
      [rule, failed === 0 ? "passed" : "failed", failed, JSON.stringify({ stage: "nsw_rents_branch_load" })]);
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched; no raw sheet rows loaded).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

// ── Post-commit summary + yield-specific report ──────────────────────────

const [summary] = await q(`select
  (select count(*)::int from core.fact_rental_market_summary) as fact_total,
  (select count(*)::int from mart.suburb_rent_quarterly) as suburb_rent,
  (select count(*)::int from mart.postcode_rent_quarterly) as postcode_rent,
  (select count(*)::int from mart.suburb_yield_quarterly) as suburb_yield,
  (select count(*)::int from mart.postcode_yield_quarterly) as postcode_yield,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state = summary;
await client.end();
fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2) + "\n");

// Yield pilot report needs a fresh read-only connection (previous one closed).
const client2 = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client2.connect();
const { rows: yieldDistRows } = await client2.query(`select
  (select json_object_agg(l,n) from (select yield_confidence_label l, count(*)::int n from mart.suburb_yield_quarterly group by 1) x) as suburb_dist,
  (select json_object_agg(l,n) from (select yield_confidence_label l, count(*)::int n from mart.postcode_yield_quarterly group by 1) x) as postcode_dist,
  (select round(avg(gross_yield_percentage),2) from mart.suburb_yield_quarterly where gross_yield_percentage is not null) as suburb_avg_yield,
  (select round(avg(gross_yield_percentage),2) from mart.postcode_yield_quarterly where gross_yield_percentage is not null) as postcode_avg_yield,
  (select round(min(gross_yield_percentage),2) from mart.postcode_yield_quarterly where gross_yield_percentage is not null) as min_yield,
  (select round(max(gross_yield_percentage),2) from mart.postcode_yield_quarterly where gross_yield_percentage is not null) as max_yield`);
const yieldDist = yieldDistRows[0];
const yieldReport = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  suburb_yield_rows: summary.suburb_yield,
  postcode_yield_rows: summary.postcode_yield,
  suburb_yield_confidence_distribution: yieldDist.suburb_dist,
  postcode_yield_confidence_distribution: yieldDist.postcode_dist,
  suburb_avg_gross_yield_pct: yieldDist.suburb_avg_yield,
  postcode_avg_gross_yield_pct: yieldDist.postcode_avg_yield,
  postcode_gross_yield_range_pct: [yieldDist.min_yield, yieldDist.max_yield],
  is_recommendation_score_avm_or_forecast: false,
  note: "Gross yield is a descriptive statistic combining independently-sourced quarterly rent and annual sales medians. Not investment advice.",
};
await client2.end();
fs.writeFileSync(YIELD_REPORT, JSON.stringify(yieldReport, null, 2) + "\n");

console.log("\nRun reports written:");
console.log("  warehouse/reports/nsw_rental_bonds_branch_load_report.json");
console.log("  warehouse/reports/nsw_yield_pilot_report.json");
console.log(`facts=${summary.fact_total} suburb_rent=${summary.suburb_rent} postcode_rent=${summary.postcode_rent} suburb_yield=${summary.suburb_yield} postcode_yield=${summary.postcode_yield} db=${summary.db_size}`);
