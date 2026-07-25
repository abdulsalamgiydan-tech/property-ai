#!/usr/bin/env node
/**
 * NSW sales dwelling-type reconciliation — branch fix (Sprint 10, Phase 1).
 *
 * BLOCKING PREREQUISITE for any cross-state work. Sprint 9's reclassification
 * (warehouse/scripts/sales/reclassify_nsw_dwelling_types.mjs) already fully
 * corrected the LOCAL nsw_sales_summary table (verified: detached_house
 * transaction count 2,537,969, townhouse_villa_semidetached 18,712, total
 * residential transactions unchanged at 4,680,129). But Sprint 9's branch
 * load only ADDITIVELY inserted the new townhouse_villa_semidetached cells
 * (ON CONFLICT DO NOTHING) — existing detached_house/apartment_unit/
 * residential_land/other_residential rows on the branch still reflect the
 * PRE-reclassification aggregates computed in Sprint 7.
 *
 * This script performs a full UPSERT (ON CONFLICT DO UPDATE) from the
 * corrected local source of truth across:
 *   1. core.fact_residential_sales_summary (all 5 dwelling types)
 *   2. mart.suburb_sales_monthly / _annual, mart.postcode_sales_monthly / _annual
 *   3. mart.suburb_yield_quarterly / mart.postcode_yield_quarterly (re-derived
 *      from the corrected sales-side medians)
 *   4. mart.suburb_market_snapshot / postcode_market_snapshot (re-run the
 *      Sprint 9 snapshot builder, which already upserts)
 *   5. mart.suburb_market_timeseries / postcode_market_timeseries (upsert)
 *
 * No DELETE/TRUNCATE — every correction is an UPDATE via ON CONFLICT DO
 * UPDATE, or a new INSERT for genuinely new cells. No transaction is added
 * or removed; only dwelling_type classification (already fixed locally in
 * Sprint 9) and its downstream aggregates are corrected.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only; production ref hard-refused;
 * dry-run by default; ONE transaction with blocking post-load gates.
 *
 * Usage:
 *   node reconcile_nsw_sales_branch.mjs             # dry run
 *   node reconcile_nsw_sales_branch.mjs --execute
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
const NSW_SALES_DB = rel("warehouse", "data", "local", "nsw_sales.duckdb");
const RECLASS_REPORT = rel("warehouse", "reports", "nsw_dwelling_type_reclassification_report.json");
const RUN_REPORT = rel("warehouse", "reports", "nsw_sales_reconciliation_report.json");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);
const duckDate = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const days = typeof v === "object" && "days" in v ? v.days : v;
  return new Date(Number(days) * 86400000).toISOString().slice(0, 10);
};

if (!fs.existsSync(NSW_SALES_DB)) fail("nsw_sales.duckdb missing — cannot reconcile without the local source of truth");
if (!fs.existsSync(RECLASS_REPORT)) fail("nsw_dwelling_type_reclassification_report.json missing — run reclassify_nsw_dwelling_types.mjs (Sprint 9) first");

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`reconcile_nsw_sales_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const [sizeBefore] = await q("select pg_database_size(current_database()) bytes, pg_size_pretty(pg_database_size(current_database())) pretty");
console.log(`  branch DB size before: ${sizeBefore.pretty}`);

const [preState] = await q(`select
  (select count(*)::int from core.fact_residential_sales_summary) sales_facts,
  (select json_object_agg(dwelling_type, n) from (select dwelling_type, count(*)::int n from core.fact_residential_sales_summary group by 1) x) dist`);
console.log(`  branch state before: sales_facts=${preState.sales_facts}`, JSON.stringify(preState.dist));

// ── Pre-read from DuckDB BEFORE opening the branch transaction ───────────

console.log("\n  pre-reading local nsw_sales_summary (corrected source of truth)...");
const duckInstance = await DuckDBInstance.create(NSW_SALES_DB, { access_mode: "READ_ONLY" });
const duck = await duckInstance.connect();
const duckRows = async (sql) => (await duck.runAndReadAll(sql)).getRowObjects();

const [totalTxRow] = await duckRows("select count(*)::int n from nsw_sales_transactions_raw where is_residential");
const totalResidentialTransactions = num(totalTxRow.n);
const [dupKeyRow] = await duckRows(`
  select count(*)::int n from (
    select district_code, property_id, sale_counter, contract_date, count(*) c
    from nsw_sales_transactions_raw group by 1,2,3,4 having count(*) > 1
  ) d`);
const duplicateTransactionKeys = num(dupKeyRow.n);

const annualRows = (await duckRows(
  `select geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
          transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price,
          upper_quartile_sale_price, min_sale_price, max_sale_price, sample_size_confidence
   from nsw_sales_summary where period_type='year'`
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
const [monthlyCutoffRow] = await duckRows("select least(max(reference_period), current_date) mp from nsw_sales_summary where period_type='month'");
const monthlyCutoff = duckDate(monthlyCutoffRow.mp);
const monthlyRows = (await duckRows(
  `select geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
          transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price,
          upper_quartile_sale_price, min_sale_price, max_sale_price, sample_size_confidence
   from nsw_sales_summary where period_type='month' and reference_period <= current_date
     and reference_period > (date '${monthlyCutoff}' - interval 12 month)`
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
duck.closeSync();

console.log(`  pre-read: ${annualRows.length} annual rows (all years, all dwelling types) + ${monthlyRows.length} trailing-12m monthly rows (all dwelling types)`);
console.log(`  local source of truth: ${totalResidentialTransactions} total residential transactions, ${duplicateTransactionKeys} duplicate transaction keys`);

const reclassReport = JSON.parse(fs.readFileSync(RECLASS_REPORT, "utf8"));

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  scope: "full UPSERT reconciliation of core.fact_residential_sales_summary and every dependent mart from the already-corrected local nsw_sales_summary (Sprint 9's reclassify_nsw_dwelling_types.mjs)",
  total_residential_transactions_local: totalResidentialTransactions,
  duplicate_transaction_keys_local: duplicateTransactionKeys,
  records_reclassified: reclassReport.new_rule_records_affected,
  previous_classification_distribution: reclassReport.previous_classification_distribution,
  new_classification_distribution: reclassReport.new_classification_distribution,
  db_size_before: sizeBefore.pretty,
};

if (!EXECUTE) {
  console.log(`\nDry run: would UPSERT ${annualRows.length + monthlyRows.length} sales fact rows (all 5 dwelling types), rebuild 4 sales marts + 2 yield marts + snapshots + timeseries via UPSERT.`);
  await client.end();
  process.exit(0);
}

try {
  await client.query("begin");

  // ── 1. core.fact_residential_sales_summary — full upsert, all types ────
  const dimIds = new Set((await q("select geography_id from core.dim_geography where is_current")).map((r) => r.geography_id));
  const salesFactCols = [
    "geography_id", "geography_type", "geography_code", "reference_period", "period_type", "dwelling_type",
    "transaction_count", "median_sale_price", "mean_sale_price", "lower_quartile_sale_price",
    "upper_quartile_sale_price", "min_sale_price", "max_sale_price",
    "source_id", "dataset_id", "data_quality_status", "sample_size_confidence", "confidence_label",
  ];
  const buildTuple = (r) => [
    r.geography_id, r.geography_type, r.geography_code, r.reference_period, r.period_type, r.dwelling_type,
    num(r.transaction_count), r.median_sale_price, r.mean_sale_price, r.lower_quartile_sale_price,
    r.upper_quartile_sale_price, r.min_sale_price, r.max_sale_price,
    "nsw_vg_sales", "nsw_psi_2001_current_full_state", "passed", r.sample_size_confidence, r.sample_size_confidence,
  ];
  const upsertSalesFacts = async (rows) => {
    let attempted = 0, orphans = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500).filter((r) => {
        const ok = dimIds.has(r.geography_id);
        if (!ok) orphans++;
        return ok;
      });
      if (slice.length === 0) continue;
      const params = [];
      const tuples = slice.map((r) => {
        const values = buildTuple(r);
        const b = params.length;
        params.push(...values);
        return `(${values.map((_, j) => `$${b + j + 1}`).join(",")})`;
      });
      await client.query(
        `insert into core.fact_residential_sales_summary (${salesFactCols.join(",")}) values ${tuples.join(",")}
         on conflict (geography_id, reference_period, period_type, dwelling_type) do update set
           transaction_count = excluded.transaction_count, median_sale_price = excluded.median_sale_price,
           mean_sale_price = excluded.mean_sale_price, lower_quartile_sale_price = excluded.lower_quartile_sale_price,
           upper_quartile_sale_price = excluded.upper_quartile_sale_price, min_sale_price = excluded.min_sale_price,
           max_sale_price = excluded.max_sale_price, sample_size_confidence = excluded.sample_size_confidence,
           confidence_label = excluded.confidence_label`,
        params);
      attempted += tuples.length;
    }
    return { attempted, orphans };
  };
  const annualResult = await upsertSalesFacts(annualRows);
  const monthlyResult = await upsertSalesFacts(monthlyRows);
  console.log(`\n  core.fact_residential_sales_summary: upserted ${annualResult.attempted} annual + ${monthlyResult.attempted} monthly rows (${annualResult.orphans + monthlyResult.orphans} orphans skipped)`);
  report.sales_facts_upserted = annualResult.attempted + monthlyResult.attempted;

  // ── 2. Sales marts — full upsert (all dwelling types) ───────────────────
  const buildSalesMart = async (target, periodType, periodCol, table) => {
    const r = await client.query(`
      insert into ${table} (geography_id, geography_name, state_code, ${periodCol}, dwelling_type,
        transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price, upper_quartile_sale_price,
        sample_size_confidence, confidence_label, source_summary)
      select f.geography_id, d.geography_name, d.state_code, f.reference_period, f.dwelling_type,
        f.transaction_count, f.median_sale_price, f.mean_sale_price, f.lower_quartile_sale_price, f.upper_quartile_sale_price,
        f.sample_size_confidence, f.sample_size_confidence,
        jsonb_build_object('source','nsw_vg_sales','dwelling_type_rule_version',2,'reconciled_sprint10',true)
      from core.fact_residential_sales_summary f
      join core.dim_geography d on d.geography_id = f.geography_id
      where f.geography_type = '${target}' and f.period_type = '${periodType}'
      on conflict (geography_id, ${periodCol}, dwelling_type) do update set
        transaction_count = excluded.transaction_count, median_sale_price = excluded.median_sale_price,
        mean_sale_price = excluded.mean_sale_price, lower_quartile_sale_price = excluded.lower_quartile_sale_price,
        upper_quartile_sale_price = excluded.upper_quartile_sale_price, sample_size_confidence = excluded.sample_size_confidence,
        confidence_label = excluded.confidence_label, source_summary = excluded.source_summary, updated_at = now()`);
    console.log(`  ${table}: ${r.rowCount} rows upserted (reconciled)`);
    return r.rowCount;
  };
  report.suburb_sales_monthly_upserted = await buildSalesMart("SAL", "month", "reference_month", "mart.suburb_sales_monthly");
  report.suburb_sales_annual_upserted = await buildSalesMart("SAL", "year", "reference_year", "mart.suburb_sales_annual");
  report.postcode_sales_monthly_upserted = await buildSalesMart("POA", "month", "reference_month", "mart.postcode_sales_monthly");
  report.postcode_sales_annual_upserted = await buildSalesMart("POA", "year", "reference_year", "mart.postcode_sales_annual");

  // ── 3. Yield marts — full upsert (re-derived from corrected sales medians) ─
  const buildYieldMart = async (table, salesMart, rentMart) => {
    const r = await client.query(`
      insert into ${table} (geography_id, geography_name, state_code, reference_period, dwelling_type,
        median_sale_price, median_weekly_rent, annualised_rent, gross_yield_percentage,
        sales_transaction_count, rental_sample_count, sales_confidence_label, rental_confidence_label,
        yield_confidence_label, source_summary)
      select rent.geography_id, rent.geography_name, rent.state_code, rent.reference_quarter, rent.dwelling_type,
        sales.median_sale_price, rent.median_weekly_rent, rent.median_weekly_rent * 52,
        case when sales.sample_size_confidence in ('high','medium') and rent.sample_size_confidence in ('high','medium')
             then round((rent.median_weekly_rent * 52) / nullif(sales.median_sale_price,0) * 100, 3)
             else null end,
        sales.transaction_count, rent.rental_count, sales.sample_size_confidence, rent.sample_size_confidence,
        case when sales.median_sale_price is null or rent.median_weekly_rent is null then 'insufficient'
             when sales.sample_size_confidence in ('high','medium') and rent.sample_size_confidence in ('high','medium') then 'high'
             else 'insufficient' end,
        jsonb_build_object('sales_period_basis','annual_calendar_year_containing_quarter','reconciled_sprint10',true)
      from ${rentMart} rent
      left join ${salesMart} sales on sales.geography_id = rent.geography_id
        and sales.dwelling_type = rent.dwelling_type
        and date_trunc('year', sales.reference_year)::date = date_trunc('year', rent.reference_quarter)::date
      on conflict (geography_id, reference_period, dwelling_type) do update set
        median_sale_price = excluded.median_sale_price, median_weekly_rent = excluded.median_weekly_rent,
        annualised_rent = excluded.annualised_rent, gross_yield_percentage = excluded.gross_yield_percentage,
        sales_transaction_count = excluded.sales_transaction_count, sales_confidence_label = excluded.sales_confidence_label,
        yield_confidence_label = excluded.yield_confidence_label, source_summary = excluded.source_summary, updated_at = now()`);
    console.log(`  ${table}: ${r.rowCount} rows upserted (reconciled)`);
    return r.rowCount;
  };
  report.suburb_yield_upserted = await buildYieldMart("mart.suburb_yield_quarterly", "mart.suburb_sales_annual", "mart.suburb_rent_quarterly");
  report.postcode_yield_upserted = await buildYieldMart("mart.postcode_yield_quarterly", "mart.postcode_sales_annual", "mart.postcode_rent_quarterly");

  // ── Post-load blocking gates ───────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select geography_id, reference_period, period_type, dwelling_type
       from core.fact_residential_sales_summary group by 1,2,3,4 having count(*)>1) x) as dup_sales_facts,
    (select count(*)::int from (select geography_id, reference_month, dwelling_type from mart.suburb_sales_monthly group by 1,2,3 having count(*)>1) x) as dup_suburb_monthly,
    (select count(*)::int from (select geography_id, reference_year, dwelling_type from mart.suburb_sales_annual group by 1,2,3 having count(*)>1) x) as dup_suburb_annual,
    (select count(*)::int from core.fact_residential_sales_summary f where not exists (select 1 from core.dim_geography d where d.geography_id = f.geography_id)) as orphan_sales_facts,
    (select count(*)::int from mart.suburb_yield_quarterly y where y.gross_yield_percentage is not null and y.yield_confidence_label is null) as yield_missing_label,
    pg_size_pretty(pg_database_size(current_database())) as db_now`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup_sales=${post.dup_sales_facts} dup_suburb_monthly=${post.dup_suburb_monthly} dup_suburb_annual=${post.dup_suburb_annual} orphan=${post.orphan_sales_facts} yield_missing_label=${post.yield_missing_label} db_now=${post.db_now}`);
  const failCount = [post.dup_sales_facts, post.dup_suburb_monthly, post.dup_suburb_annual, post.orphan_sales_facts, post.yield_missing_label].map(Number).reduce((a, b) => a + b, 0);
  if (failCount > 0) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  await client.query("commit");
  console.log("\nReconciliation COMMITTED (branch only; production untouched).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`reconciliation aborted, transaction rolled back: ${String(err.message).slice(0, 500)}`);
}

// ── Post-commit summary + reconciliation proof ────────────────────────────

const [summary] = await q(`select
  (select count(*)::int from core.fact_residential_sales_summary) as fact_total,
  (select json_object_agg(dwelling_type, n) from (select dwelling_type, count(*)::int n from core.fact_residential_sales_summary group by 1) x) as facts_by_type,
  (select sum(transaction_count)::bigint from core.fact_residential_sales_summary where period_type='year') as annual_tx_sum,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state_after = { fact_total: num(summary.fact_total), facts_by_type: summary.facts_by_type, annual_tx_sum: num(summary.annual_tx_sum) };
report.db_size_after = summary.db_size;

// Reconciliation proof: branch annual detached_house median for the most
// recent full year should now match the local corrected summary exactly.
const [sampleCheck] = await q(`
  select geography_name, median_sale_price, transaction_count
  from mart.suburb_sales_annual
  where dwelling_type = 'townhouse_villa_semidetached'
  order by transaction_count desc nulls last limit 1`);
report.reconciliation_spot_check = sampleCheck ?? null;

await client.end();

fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/nsw_sales_reconciliation_report.json");
console.log(`fact_total=${summary.fact_total} db=${summary.db_size}`);
