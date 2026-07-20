#!/usr/bin/env node
/**
 * Rebuild NSW mart.suburb_market_snapshot / postcode_market_snapshot and
 * the time-series marts from the now-reconciled sales data (Sprint 10,
 * Phase 1 follow-up). Reuses the exact snapshot/timeseries-builder SQL
 * from Sprint 9's load_market_intelligence_to_branch.mjs (already
 * upsert-capable) — scoped to re-run only, no new columns/tables.
 *
 * Safety: same guardrails as every other branch script in this project.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`rebuild_nsw_snapshots_after_reconciliation — ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true, statement_timeout: 0, query_timeout: 0 });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const [sizeBefore] = await q("select pg_size_pretty(pg_database_size(current_database())) pretty");
console.log(`  branch DB size before: ${sizeBefore.pretty}`);

if (!EXECUTE) {
  console.log("Dry run: would rebuild mart.suburb_market_snapshot / postcode_market_snapshot and timeseries marts (SAL/POA, NSW) via upsert from the reconciled sales data.");
  await client.end();
  process.exit(0);
}

const report = { generated_at: new Date().toISOString(), branch_ref: BRANCH_REF, production_touched: false };

try {
  await client.query("begin");

  const buildSnapshot = async (target, table, salesAnnual, rentMart, yieldMart, approvalsMart, dwellingStockMart, demogTable) => {
    const r = await client.query(`
      with latest_year as (
        select geography_id, max(reference_year) as ry
        from ${salesAnnual} where dwelling_type in ('detached_house','apartment_unit','townhouse_villa_semidetached')
        group by 1
      ),
      sales_latest as (
        select s.geography_id, ly.ry,
          sum(s.transaction_count) filter (where s.reference_year = ly.ry) as vol_12m,
          (array_agg(s.median_sale_price order by (case when s.dwelling_type='detached_house' then 0 when s.dwelling_type='apartment_unit' then 1 else 2 end)) filter (where s.reference_year = ly.ry))[1] as any_median,
          max(s.median_sale_price) filter (where s.reference_year = ly.ry and s.dwelling_type='detached_house') as med_detached,
          max(s.median_sale_price) filter (where s.reference_year = ly.ry and s.dwelling_type='apartment_unit') as med_apartment,
          max(s.median_sale_price) filter (where s.reference_year = ly.ry and s.dwelling_type='townhouse_villa_semidetached') as med_townhouse,
          max(s.sample_size_confidence) filter (where s.reference_year = ly.ry) as sample_conf
        from ${salesAnnual} s join latest_year ly on ly.geography_id = s.geography_id
        group by 1,2
      ),
      rent_latest as (select geography_id, max(reference_quarter) as rq from ${rentMart} where dwelling_type = 'all' group by 1),
      rent_data as (
        select r.geography_id, rl.rq as rent_period, r.median_weekly_rent as rent_now, r.sample_size_confidence as rent_conf,
          (select r2.median_weekly_rent from ${rentMart} r2 where r2.geography_id = r.geography_id and r2.dwelling_type='all' and r2.reference_quarter = rl.rq - interval '1 year' limit 1) as rent_prev
        from ${rentMart} r join rent_latest rl on rl.geography_id = r.geography_id and rl.rq = r.reference_quarter
        where r.dwelling_type = 'all'
      ),
      yield_latest as (
        select distinct on (geography_id) geography_id, reference_period, dwelling_type, gross_yield_percentage, yield_confidence_label
        from ${yieldMart} where dwelling_type <> 'all'
        order by geography_id, (gross_yield_percentage is not null) desc, reference_period desc
      ),
      approvals_data as (select geography_id, reference_period, approvals_12m_total, approvals_12m_houses, approvals_12m_other, approvals_per_1000_dwellings, confidence_label as supply_conf from ${approvalsMart}),
      stock_data as (select geography_id, total_private_dwellings from ${dwellingStockMart}),
      demog as (select geography_id, total_population, total_households, median_weekly_household_income, renter_household_pct, owner_with_mortgage_pct, owner_outright_pct from ${demogTable}),
      rate_oo as (select rate_percent, reference_period from mart.national_interest_rate_context where rate_type='housing_lending_rate' and loan_type='variable' and borrower_type='owner_occupier' order by reference_period desc limit 1),
      rate_inv as (select rate_percent from mart.national_interest_rate_context where rate_type='housing_lending_rate' and loan_type='variable' and borrower_type='investor' order by reference_period desc limit 1)
      insert into ${table} (
        geography_id, geography_code, geography_name, state_code, dwelling_type,
        latest_sales_period, latest_rent_period, latest_yield_period, latest_approvals_period, latest_demographics_period,
        snapshot_generated_at, coverage_status,
        sales_volume_12m, median_sale_price_12m, median_sale_price_prev_12m, annual_price_change_pct,
        median_sale_price_detached, median_sale_price_apartment, median_sale_price_townhouse, sales_sample_confidence,
        median_weekly_rent_latest, median_weekly_rent_prev, annual_rent_change_pct, rent_confidence,
        gross_yield_pct, yield_confidence, yield_sale_period_used, yield_rent_period_used,
        dwelling_stock_total, approvals_12m, approvals_per_1000_dwellings, approvals_detached_12m, approvals_other_residential_12m, supply_confidence,
        sales_turnover_pct, renter_household_pct, owner_occupier_pct,
        total_population, population_growth_2016_2021_pct, total_households, median_weekly_household_income, renter_share, owner_with_mortgage_share,
        price_to_income_ratio, rent_to_income_ratio, est_monthly_repayment_owner_occupier, est_monthly_repayment_investor,
        repayment_to_income_pct, rba_rate_used, rba_rate_period, assumption_scenario_code, affordability_confidence,
        confidence_label, data_quality_status, direct_or_derived, source_periods, metric_provenance, missing_metric_reasons
      )
      select
        d.geography_id, d.geography_code, d.geography_name, d.state_code, null,
        sl.ry, rd.rent_period, yl.reference_period, ap.reference_period, 2021,
        now(), case when sl.geography_id is not null and rd.geography_id is not null then 'full' when sl.geography_id is not null or rd.geography_id is not null then 'partial' else 'insufficient' end,
        sl.vol_12m, sl.any_median, null, null,
        sl.med_detached, sl.med_apartment, sl.med_townhouse, sl.sample_conf,
        rd.rent_now, rd.rent_prev, case when rd.rent_prev > 0 then round((rd.rent_now - rd.rent_prev)/rd.rent_prev*100,2) else null end, rd.rent_conf,
        yl.gross_yield_percentage, yl.yield_confidence_label, sl.ry, yl.reference_period,
        st.total_private_dwellings, ap.approvals_12m_total, ap.approvals_per_1000_dwellings, ap.approvals_12m_houses, ap.approvals_12m_other, ap.supply_conf,
        case when st.total_private_dwellings > 0 then round(sl.vol_12m::numeric / st.total_private_dwellings * 100, 2) else null end,
        dg.renter_household_pct, case when dg.owner_with_mortgage_pct is not null and dg.owner_outright_pct is not null then least(100, round(dg.owner_with_mortgage_pct + dg.owner_outright_pct, 2)) else null end,
        dg.total_population, null, dg.total_households, dg.median_weekly_household_income, dg.renter_household_pct, dg.owner_with_mortgage_pct,
        case when sl.any_median > 0 and dg.median_weekly_household_income > 0 then round(sl.any_median / (dg.median_weekly_household_income*52), 2) else null end,
        case when rd.rent_now > 0 and dg.median_weekly_household_income > 0 then round(rd.rent_now::numeric / dg.median_weekly_household_income, 3) else null end,
        case when sl.any_median > 0 and ro.rate_percent > 0 then round((sl.any_median * 0.8) * (ro.rate_percent/100/12) * power(1+ro.rate_percent/100/12, 360) / (power(1+ro.rate_percent/100/12, 360) - 1), 2) else null end,
        case when sl.any_median > 0 and ri.rate_percent > 0 then round((sl.any_median * 0.8) * (ri.rate_percent/100/12) * power(1+ri.rate_percent/100/12, 360) / (power(1+ri.rate_percent/100/12, 360) - 1), 2) else null end,
        case when sl.any_median > 0 and ro.rate_percent > 0 and dg.median_weekly_household_income > 0 then round(((sl.any_median * 0.8) * (ro.rate_percent/100/12) * power(1+ro.rate_percent/100/12, 360) / (power(1+ro.rate_percent/100/12, 360) - 1)) / (dg.median_weekly_household_income * 52 / 12) * 100, 2) else null end,
        ro.rate_percent, ro.reference_period, 'standard_20pct_deposit_30yr_pi',
        case when sl.any_median is not null and dg.median_weekly_household_income is not null and ro.rate_percent is not null then 'medium' else 'insufficient' end,
        case when sl.geography_id is not null and rd.geography_id is not null then 'high' when sl.geography_id is not null or rd.geography_id is not null then 'medium' else 'insufficient' end,
        'passed', 'direct',
        jsonb_build_object('sales_year', sl.ry, 'rent_quarter', rd.rent_period, 'census_year', 2021, 'reconciled_sprint10', true),
        jsonb_build_object('sales_source','nsw_vg_sales','rent_source','nsw_dcj_rent_and_sales_report','yield_source','derived','demographics_source','abs_census_2021','rate_source','rba'),
        case when dg.total_population is null then jsonb_build_object('demographics','no census match')
             when sl.geography_id is null then jsonb_build_object('sales','no NSW VG sales data for this geography')
             else '{}'::jsonb end
      from core.dim_geography d
      left join sales_latest sl on sl.geography_id = d.geography_id
      left join rent_data rd on rd.geography_id = d.geography_id
      left join yield_latest yl on yl.geography_id = d.geography_id
      left join approvals_data ap on ap.geography_id = d.geography_id
      left join stock_data st on st.geography_id = d.geography_id
      left join demog dg on dg.geography_id = d.geography_id
      cross join rate_oo ro cross join rate_inv ri
      where d.geography_type = '${target}' and d.is_current
        and (sl.geography_id is not null or rd.geography_id is not null or dg.geography_id is not null)
      on conflict (geography_id, (coalesce(dwelling_type, ''))) where dwelling_type is null do update set
        latest_sales_period = excluded.latest_sales_period, latest_rent_period = excluded.latest_rent_period,
        latest_yield_period = excluded.latest_yield_period, latest_approvals_period = excluded.latest_approvals_period,
        snapshot_generated_at = excluded.snapshot_generated_at, coverage_status = excluded.coverage_status,
        sales_volume_12m = excluded.sales_volume_12m, median_sale_price_12m = excluded.median_sale_price_12m,
        median_sale_price_detached = excluded.median_sale_price_detached, median_sale_price_apartment = excluded.median_sale_price_apartment,
        median_sale_price_townhouse = excluded.median_sale_price_townhouse, sales_sample_confidence = excluded.sales_sample_confidence,
        median_weekly_rent_latest = excluded.median_weekly_rent_latest, median_weekly_rent_prev = excluded.median_weekly_rent_prev,
        annual_rent_change_pct = excluded.annual_rent_change_pct, rent_confidence = excluded.rent_confidence,
        gross_yield_pct = excluded.gross_yield_pct, yield_confidence = excluded.yield_confidence,
        yield_sale_period_used = excluded.yield_sale_period_used, yield_rent_period_used = excluded.yield_rent_period_used,
        dwelling_stock_total = excluded.dwelling_stock_total, approvals_12m = excluded.approvals_12m,
        approvals_per_1000_dwellings = excluded.approvals_per_1000_dwellings, sales_turnover_pct = excluded.sales_turnover_pct,
        renter_household_pct = excluded.renter_household_pct, owner_occupier_pct = excluded.owner_occupier_pct,
        price_to_income_ratio = excluded.price_to_income_ratio, rent_to_income_ratio = excluded.rent_to_income_ratio,
        est_monthly_repayment_owner_occupier = excluded.est_monthly_repayment_owner_occupier,
        est_monthly_repayment_investor = excluded.est_monthly_repayment_investor, repayment_to_income_pct = excluded.repayment_to_income_pct,
        rba_rate_used = excluded.rba_rate_used, rba_rate_period = excluded.rba_rate_period,
        affordability_confidence = excluded.affordability_confidence, confidence_label = excluded.confidence_label,
        source_periods = excluded.source_periods, metric_provenance = excluded.metric_provenance,
        missing_metric_reasons = excluded.missing_metric_reasons, updated_at = now()`);
    console.log(`  ${table}: ${r.rowCount} rows upserted`);
    return r.rowCount;
  };
  report.suburb_snapshot = await buildSnapshot("SAL", "mart.suburb_market_snapshot",
    "mart.suburb_sales_annual", "mart.suburb_rent_quarterly", "mart.suburb_yield_quarterly",
    "mart.suburb_building_approvals", "mart.suburb_dwelling_stock_2021", "mart.suburb_demographic_profile_2021");
  report.postcode_snapshot = await buildSnapshot("POA", "mart.postcode_market_snapshot",
    "mart.postcode_sales_annual", "mart.postcode_rent_quarterly", "mart.postcode_yield_quarterly",
    "mart.postcode_building_approvals", "mart.postcode_dwelling_stock_2021", "mart.postcode_demographic_profile_2021");

  const buildTimeseries = async (target, table, salesMonthly, rentMart, yieldMart, approvalsMart) => {
    const rSales = await client.query(`
      insert into ${table} (geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family, transaction_count, median_sale_price, confidence_label, source_dataset)
      select geography_id, '${target}', reference_month, 'month', dwelling_type, 'sales', transaction_count, median_sale_price, confidence_label, 'nsw_vg_sales'
      from ${salesMonthly}
      where dwelling_type in ('detached_house','apartment_unit')
        and reference_month >= (select max(reference_month) - interval '12 months' from ${salesMonthly})
      on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do update set
        transaction_count = excluded.transaction_count, median_sale_price = excluded.median_sale_price, confidence_label = excluded.confidence_label`);
    const rRent = await client.query(`
      insert into ${table} (geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family, median_weekly_rent, confidence_label, source_dataset)
      select geography_id, '${target}', reference_quarter, 'quarter', null, 'rent', median_weekly_rent, confidence_label, 'nsw_dcj_rent_and_sales_report'
      from ${rentMart} where dwelling_type = 'all' and reference_quarter >= (select max(reference_quarter) - interval '24 months' from ${rentMart})
      on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do update set median_weekly_rent = excluded.median_weekly_rent, confidence_label = excluded.confidence_label`);
    const rYield = await client.query(`
      insert into ${table} (geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family, gross_yield_percentage, confidence_label, source_dataset)
      select geography_id, '${target}', reference_period, 'quarter', null, 'yield', gross_yield_percentage, yield_confidence_label, 'derived'
      from ${yieldMart} where dwelling_type = 'all' and reference_period >= (select max(reference_period) - interval '24 months' from ${yieldMart})
      on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do update set gross_yield_percentage = excluded.gross_yield_percentage, confidence_label = excluded.confidence_label`);
    const rApprovals = await client.query(`
      insert into ${table} (geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family, approvals_count, confidence_label, source_dataset)
      select geography_id, '${target}', reference_period, 'month', null, 'approvals', approvals_12m_total, confidence_label, 'abs_building_approvals'
      from ${approvalsMart}
      on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do update set approvals_count = excluded.approvals_count, confidence_label = excluded.confidence_label`);
    const total = rSales.rowCount + rRent.rowCount + rYield.rowCount + rApprovals.rowCount;
    console.log(`  ${table}: ${total} rows upserted (sales=${rSales.rowCount} rent=${rRent.rowCount} yield=${rYield.rowCount} approvals=${rApprovals.rowCount})`);
    return total;
  };
  report.suburb_timeseries = await buildTimeseries("SAL", "mart.suburb_market_timeseries", "mart.suburb_sales_monthly", "mart.suburb_rent_quarterly", "mart.suburb_yield_quarterly", "mart.suburb_building_approvals");
  report.postcode_timeseries = await buildTimeseries("POA", "mart.postcode_market_timeseries", "mart.postcode_sales_monthly", "mart.postcode_rent_quarterly", "mart.postcode_yield_quarterly", "mart.postcode_building_approvals");

  const [post] = await q(`select
    (select count(*)::int from (select geography_id from mart.suburb_market_snapshot where dwelling_type is null group by 1 having count(*)>1) x) as dup_suburb_snapshot,
    (select count(*)::int from (select geography_id from mart.postcode_market_snapshot where dwelling_type is null group by 1 having count(*)>1) x) as dup_postcode_snapshot,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and gross_yield_pct is not null and yield_confidence is null) as yield_missing_label,
    pg_size_pretty(pg_database_size(current_database())) as db_now`);
  console.log(`\nPost-load gates: dup_snapshot=${Number(post.dup_suburb_snapshot)+Number(post.dup_postcode_snapshot)} yield_missing_label=${post.yield_missing_label} db_now=${post.db_now}`);
  if (Number(post.dup_suburb_snapshot) + Number(post.dup_postcode_snapshot) + Number(post.yield_missing_label) > 0) {
    await client.query("rollback");
    fail("post-load gates FAILED — rolled back");
  }
  await client.query("commit");
  console.log("\nCOMMITTED.");
  report.db_size_after = post.db_now;
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`aborted, rolled back: ${String(err.message).slice(0, 500)}`);
}
await client.end();
fs.writeFileSync(rel("warehouse", "reports", "nsw_snapshot_rebuild_after_reconciliation.json"), JSON.stringify(report, null, 2) + "\n");
console.log("Report written: warehouse/reports/nsw_snapshot_rebuild_after_reconciliation.json");
