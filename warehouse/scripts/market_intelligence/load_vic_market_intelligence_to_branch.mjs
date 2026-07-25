#!/usr/bin/env node
/**
 * Victoria Market Intelligence — branch-only load (Sprint 10, Phase 9).
 *
 * Promotes VIC's local sales/rent summaries (built in Phases 5-6) into the
 * SAME canonical mart.suburb_market_snapshot / mart.suburb_market_timeseries
 * tables NSW already uses (jurisdiction='VIC'), joined against the
 * already-branch-resident national demographics/dwelling-stock/approvals/
 * RBA-rate data (see vic_supply_demographics_affordability_report — no new
 * download needed for those).
 *
 * Scope, documented not silently narrowed:
 *  - SAL (suburb) grain only. VPSR publishes no postcode-level figures
 *    (unlike NSW PSI, which has full addresses to derive POA from) — no
 *    mart.postcode_market_snapshot rows are written for VIC sales/rent
 *    this phase. Existing skeleton POA rows (jurisdiction backfilled in
 *    migration 015 from postcode-range rules) remain otherwise empty.
 *  - Only geography_confidence IN ('direct','alias') rows are promoted —
 *    'unresolved' localities (39 sales, 79 rent) are never written to
 *    Supabase, per warehouse/config/vic_locality_aliases.yml.
 *  - Sales "latest period" = the Oct-Dec 2025 VPSR quarter (the only
 *    quarter with a published transaction count); "sales_volume_12m" uses
 *    the source's own published rolling_12m_transaction_count, not a sum
 *    of quarterly medians (medians cannot be validly summed).
 *  - No townhouse_villa_semidetached coverage (VPSR has no such product —
 *    same documented gap as the geography/source manifest already states).
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-load
 * gates (rollback on failure); all local-store reads happen before BEGIN.
 *
 * Usage:
 *   node load_vic_market_intelligence_to_branch.mjs             # dry run
 *   node load_vic_market_intelligence_to_branch.mjs --execute
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const GROWTH_BUDGET_MB = 300;

const VIC_SALES_DB = rel("warehouse", "data", "local", "vic_sales.duckdb");
const VIC_RENTS_DB = rel("warehouse", "data", "local", "vic_rents.duckdb");
const RUN_REPORT = rel("warehouse", "reports", "victoria_branch_load_report.json");
const RUN_REPORT_MD = rel("warehouse", "reports", "victoria_branch_load_report.md");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

for (const p of [VIC_SALES_DB, VIC_RENTS_DB]) {
  if (!fs.existsSync(p)) fail(`missing local store: ${p} — run the Phase 5/6 build scripts first`);
}

process.loadEnvFile(".env.local");
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF}`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference branch ref ${BRANCH_REF}`);

console.log(`load_vic_market_intelligence_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);

// ── 1. Read local VIC sales (latest quarter, resolved geography only) ─────
const salesInst = await DuckDBInstance.create(VIC_SALES_DB, { access_mode: "READ_ONLY" });
const salesDb = await salesInst.connect();
async function salesAll(sql) {
  return (await salesDb.runAndReadAll(sql)).getRowObjects();
}

const salesLatest = await salesAll(`
  select geography_id, geography_code, geography_name, dwelling_type,
         median_sale_price, transaction_count, rolling_12m_transaction_count,
         annual_change_pct, sample_size_confidence, reference_period::varchar as reference_period
  from vic_sales_summary
  where geography_confidence in ('direct','alias')
    and reference_period = (select max(reference_period) from vic_sales_summary)
    and median_sale_price is not null
`);
console.log(`  VIC sales, latest quarter, resolved geography: ${salesLatest.length} rows`);

const salesHistory = await salesAll(`
  select geography_id, dwelling_type, reference_period::varchar as reference_period, median_sale_price, sample_size_confidence
  from vic_sales_summary
  where geography_confidence in ('direct','alias') and median_sale_price is not null
  order by geography_id, dwelling_type, reference_period
`);
console.log(`  VIC sales, full history, resolved geography: ${salesHistory.length} rows (for timeseries)`);
salesDb.closeSync();

// ── 2. Read local VIC rent (SAL grain, dwelling_type='all', resolved) ─────
const rentsInst = await DuckDBInstance.create(VIC_RENTS_DB, { access_mode: "READ_ONLY" });
const rentsDb = await rentsInst.connect();
async function rentsAll(sql) {
  return (await rentsDb.runAndReadAll(sql)).getRowObjects();
}

const rentLatest = await rentsAll(`
  select geography_id, geography_code, geography_name, median_weekly_rent, rental_count, confidence_label,
         reference_period::varchar as reference_period
  from vic_rental_summary
  where geography_type = 'SAL' and geography_confidence in ('direct','alias')
    and dwelling_type = 'all' and median_weekly_rent is not null
    and reference_period = (
      select max(reference_period) from vic_rental_summary r2
      where r2.geography_id = vic_rental_summary.geography_id and r2.dwelling_type = 'all' and r2.median_weekly_rent is not null
    )
`);
console.log(`  VIC rent, latest period per suburb, resolved geography: ${rentLatest.length} rows`);

const rentHistory = await rentsAll(`
  select geography_id, reference_period::varchar as reference_period, median_weekly_rent, confidence_label
  from vic_rental_summary
  where geography_type = 'SAL' and geography_confidence in ('direct','alias')
    and dwelling_type = 'all' and median_weekly_rent is not null
  order by geography_id, reference_period
`);
console.log(`  VIC rent, full history, resolved geography: ${rentHistory.length} rows (for timeseries)`);
rentsDb.closeSync();

if (salesLatest.length === 0 && rentLatest.length === 0) fail("no VIC sales or rent data to load — check Phase 5/6 local stores");

// ── 3. Connect to branch, guardrail-verified ───────────────────────────────
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 0, query_timeout: 0 });
await client.connect();

const dbNameCheck = await client.query("select current_database() as db");
console.log(`  connected (db=${dbNameCheck.rows[0].db})`);

const sizeBefore = await client.query("select pg_size_pretty(pg_database_size(current_database())) as sz, pg_database_size(current_database())::bigint as bytes");
console.log(`  branch DB size before: ${sizeBefore.rows[0].sz}`);

if (!EXECUTE) {
  console.log("\nDry run complete. No writes made. Re-run with --execute to load.");
  await client.end();
  process.exit(0);
}

try {
  await client.query("BEGIN");

  // Stage VIC local data into temp tables inside the transaction.
  await client.query(`
    create temp table vic_sales_latest_staged (
      geography_id text, geography_code text, geography_name text, dwelling_type text,
      median_sale_price numeric, transaction_count integer, rolling_12m_transaction_count integer,
      annual_change_pct numeric, sample_size_confidence text, reference_period date
    ) on commit drop`);
  await client.query(`
    create temp table vic_sales_history_staged (
      geography_id text, dwelling_type text, reference_period date, median_sale_price numeric, sample_size_confidence text
    ) on commit drop`);
  await client.query(`
    create temp table vic_rent_latest_staged (
      geography_id text, geography_code text, geography_name text, median_weekly_rent numeric,
      rental_count integer, confidence_label text, reference_period date
    ) on commit drop`);
  await client.query(`
    create temp table vic_rent_history_staged (
      geography_id text, reference_period date, median_weekly_rent numeric, confidence_label text
    ) on commit drop`);

  async function bulkInsert(table, cols, rows) {
    if (rows.length === 0) return;
    const BATCH = 1000;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const params = [];
      const tuples = batch.map((r) => {
        const placeholders = cols.map((c) => {
          params.push(r[c] === undefined ? null : r[c]);
          return `$${params.length}`;
        });
        return `(${placeholders.join(",")})`;
      });
      await client.query(`insert into ${table} (${cols.join(",")}) values ${tuples.join(",")}`, params);
    }
  }

  await bulkInsert("vic_sales_latest_staged", ["geography_id", "geography_code", "geography_name", "dwelling_type", "median_sale_price", "transaction_count", "rolling_12m_transaction_count", "annual_change_pct", "sample_size_confidence", "reference_period"], salesLatest.map((r) => ({ ...r, median_sale_price: num(r.median_sale_price), transaction_count: num(r.transaction_count), rolling_12m_transaction_count: num(r.rolling_12m_transaction_count), annual_change_pct: num(r.annual_change_pct) })));
  await bulkInsert("vic_sales_history_staged", ["geography_id", "dwelling_type", "reference_period", "median_sale_price", "sample_size_confidence"], salesHistory.map((r) => ({ ...r, median_sale_price: num(r.median_sale_price) })));
  await bulkInsert("vic_rent_latest_staged", ["geography_id", "geography_code", "geography_name", "median_weekly_rent", "rental_count", "confidence_label", "reference_period"], rentLatest.map((r) => ({ ...r, median_weekly_rent: num(r.median_weekly_rent), rental_count: num(r.rental_count) })));
  await bulkInsert("vic_rent_history_staged", ["geography_id", "reference_period", "median_weekly_rent", "confidence_label"], rentHistory.map((r) => ({ ...r, median_weekly_rent: num(r.median_weekly_rent) })));

  console.log("  staged VIC local data into temp tables inside transaction");

  // ── 4. Snapshot upsert (VIC SAL rows only) ───────────────────────────────
  const snapshotResult = await client.query(`
    with sales_pick as (
      -- one row per geography: prefer detached_house, then apartment_unit, then residential_land
      select distinct on (geography_id) geography_id, geography_code, geography_name, dwelling_type,
        median_sale_price, transaction_count, rolling_12m_transaction_count, annual_change_pct, sample_size_confidence, reference_period
      from vic_sales_latest_staged
      order by geography_id, (case dwelling_type when 'detached_house' then 0 when 'apartment_unit' then 1 else 2 end)
    ),
    sales_by_type as (
      select geography_id,
        max(median_sale_price) filter (where dwelling_type='detached_house') as med_detached,
        max(median_sale_price) filter (where dwelling_type='apartment_unit') as med_apartment
      from vic_sales_latest_staged group by 1
    ),
    rent_latest as (
      select * from vic_rent_latest_staged
    ),
    rent_prev as (
      select h.geography_id, h.median_weekly_rent as rent_prev
      from vic_rent_history_staged h
      join rent_latest rl on rl.geography_id = h.geography_id
      where h.reference_period = rl.reference_period - interval '1 year'
    ),
    yield_calc as (
      select sp.geography_id,
        case when rl.median_weekly_rent > 0 and sp.median_sale_price > 0
          then round((rl.median_weekly_rent * 52 / sp.median_sale_price) * 100, 2) else null end as gross_yield_pct,
        case when sp.median_sale_price is not null and rl.median_weekly_rent is not null then 'medium' else 'insufficient' end as yield_confidence
      from sales_pick sp full outer join rent_latest rl on rl.geography_id = sp.geography_id
    ),
    approvals_data as (select geography_id, reference_period, approvals_12m_total, approvals_12m_houses, approvals_12m_other, approvals_per_1000_dwellings, confidence_label as supply_conf from mart.suburb_building_approvals),
    stock_data as (select geography_id, total_private_dwellings from mart.suburb_dwelling_stock_2021),
    demog as (select geography_id, total_population, total_households, median_weekly_household_income, renter_household_pct, owner_with_mortgage_pct, owner_outright_pct from mart.suburb_demographic_profile_2021),
    rate_oo as (select rate_percent, reference_period from mart.national_interest_rate_context where rate_type='housing_lending_rate' and loan_type='variable' and borrower_type='owner_occupier' order by reference_period desc limit 1),
    rate_inv as (select rate_percent from mart.national_interest_rate_context where rate_type='housing_lending_rate' and loan_type='variable' and borrower_type='investor' order by reference_period desc limit 1),
    vic_geo as (select geography_id, geography_code, geography_name, state_code from core.dim_geography where geography_type='SAL' and state_code='2')
    insert into mart.suburb_market_snapshot (
      geography_id, geography_code, geography_name, state_code, dwelling_type, jurisdiction, geography_method,
      latest_sales_period, latest_rent_period, latest_yield_period, latest_approvals_period, latest_demographics_period,
      snapshot_generated_at, coverage_status,
      sales_volume_12m, median_sale_price_12m, annual_price_change_pct,
      median_sale_price_detached, median_sale_price_apartment, sales_sample_confidence,
      median_weekly_rent_latest, median_weekly_rent_prev, annual_rent_change_pct, rent_confidence,
      gross_yield_pct, yield_confidence,
      dwelling_stock_total, approvals_12m, approvals_per_1000_dwellings, approvals_detached_12m, approvals_other_residential_12m, supply_confidence,
      renter_household_pct, owner_occupier_pct,
      total_population, total_households, median_weekly_household_income, renter_share, owner_with_mortgage_share,
      price_to_income_ratio, rent_to_income_ratio, est_monthly_repayment_owner_occupier, est_monthly_repayment_investor,
      repayment_to_income_pct, rba_rate_used, rba_rate_period, assumption_scenario_code, affordability_confidence,
      confidence_label, data_quality_status, direct_or_derived, source_periods, metric_provenance, missing_metric_reasons
    )
    select
      vg.geography_id, vg.geography_code, vg.geography_name, vg.state_code, null, 'VIC', 'sal_direct_or_alias',
      sp.reference_period, rl.reference_period, sp.reference_period, ap.reference_period, 2021,
      now(), case when sp.geography_id is not null and rl.geography_id is not null then 'full' when sp.geography_id is not null or rl.geography_id is not null then 'partial' else 'insufficient' end,
      sp.rolling_12m_transaction_count, sp.median_sale_price, sp.annual_change_pct,
      sb.med_detached, sb.med_apartment, sp.sample_size_confidence,
      rl.median_weekly_rent, rp.rent_prev, case when rp.rent_prev > 0 then round((rl.median_weekly_rent - rp.rent_prev)/rp.rent_prev*100,2) else null end, rl.confidence_label,
      yc.gross_yield_pct, yc.yield_confidence,
      st.total_private_dwellings, ap.approvals_12m_total, ap.approvals_per_1000_dwellings, ap.approvals_12m_houses, ap.approvals_12m_other, ap.supply_conf,
      dg.renter_household_pct,
      case when dg.owner_with_mortgage_pct is not null and dg.owner_outright_pct is not null
           then least(100, round(dg.owner_with_mortgage_pct + dg.owner_outright_pct, 2)) else null end,
      dg.total_population, dg.total_households, dg.median_weekly_household_income, dg.renter_household_pct, dg.owner_with_mortgage_pct,
      case when sp.median_sale_price > 0 and dg.median_weekly_household_income > 0 then round(sp.median_sale_price / (dg.median_weekly_household_income*52), 2) else null end,
      case when rl.median_weekly_rent > 0 and dg.median_weekly_household_income > 0 then round(rl.median_weekly_rent::numeric / dg.median_weekly_household_income, 3) else null end,
      case when sp.median_sale_price > 0 and ro.rate_percent > 0 then
        round((sp.median_sale_price * 0.8) * (ro.rate_percent/100/12) * power(1+ro.rate_percent/100/12, 360) / (power(1+ro.rate_percent/100/12, 360) - 1), 2)
      else null end,
      case when sp.median_sale_price > 0 and ri.rate_percent > 0 then
        round((sp.median_sale_price * 0.8) * (ri.rate_percent/100/12) * power(1+ri.rate_percent/100/12, 360) / (power(1+ri.rate_percent/100/12, 360) - 1), 2)
      else null end,
      case when sp.median_sale_price > 0 and ro.rate_percent > 0 and dg.median_weekly_household_income > 0 then
        round(((sp.median_sale_price * 0.8) * (ro.rate_percent/100/12) * power(1+ro.rate_percent/100/12, 360) / (power(1+ro.rate_percent/100/12, 360) - 1)) / (dg.median_weekly_household_income * 52 / 12) * 100, 2)
      else null end,
      ro.rate_percent, ro.reference_period, 'standard_20pct_deposit_30yr_pi',
      case when sp.median_sale_price is not null and dg.median_weekly_household_income is not null and ro.rate_percent is not null then 'medium' else 'insufficient' end,
      case when sp.geography_id is not null and rl.geography_id is not null then 'high' when sp.geography_id is not null or rl.geography_id is not null then 'medium' else 'insufficient' end,
      'passed', 'direct',
      jsonb_build_object('sales_quarter', sp.reference_period, 'rent_quarter', rl.reference_period, 'census_year', 2021),
      jsonb_build_object('sales_source','vic_vg_sales','rent_source','vic_rent','yield_source','derived','demographics_source','abs_census_2021','rate_source','rba'),
      jsonb_build_object('townhouse_villa_semidetached','no VIC VPSR breakout available','postcode_grain','VPSR publishes suburb only, no postcode-level figures')
    from vic_geo vg
    left join sales_pick sp on sp.geography_id = vg.geography_id
    left join sales_by_type sb on sb.geography_id = vg.geography_id
    left join rent_latest rl on rl.geography_id = vg.geography_id
    left join rent_prev rp on rp.geography_id = vg.geography_id
    left join yield_calc yc on yc.geography_id = vg.geography_id
    left join approvals_data ap on ap.geography_id = vg.geography_id
    left join stock_data st on st.geography_id = vg.geography_id
    left join demog dg on dg.geography_id = vg.geography_id
    cross join rate_oo ro cross join rate_inv ri
    where sp.geography_id is not null or rl.geography_id is not null
    on conflict (geography_id, (coalesce(dwelling_type, ''))) where dwelling_type is null do update set
      geography_code=excluded.geography_code, geography_name=excluded.geography_name, jurisdiction=excluded.jurisdiction, geography_method=excluded.geography_method,
      latest_sales_period=excluded.latest_sales_period, latest_rent_period=excluded.latest_rent_period, latest_yield_period=excluded.latest_yield_period,
      latest_approvals_period=excluded.latest_approvals_period, latest_demographics_period=excluded.latest_demographics_period,
      snapshot_generated_at=excluded.snapshot_generated_at, coverage_status=excluded.coverage_status,
      sales_volume_12m=excluded.sales_volume_12m, median_sale_price_12m=excluded.median_sale_price_12m, annual_price_change_pct=excluded.annual_price_change_pct,
      median_sale_price_detached=excluded.median_sale_price_detached, median_sale_price_apartment=excluded.median_sale_price_apartment, sales_sample_confidence=excluded.sales_sample_confidence,
      median_weekly_rent_latest=excluded.median_weekly_rent_latest, median_weekly_rent_prev=excluded.median_weekly_rent_prev, annual_rent_change_pct=excluded.annual_rent_change_pct, rent_confidence=excluded.rent_confidence,
      gross_yield_pct=excluded.gross_yield_pct, yield_confidence=excluded.yield_confidence,
      dwelling_stock_total=excluded.dwelling_stock_total, approvals_12m=excluded.approvals_12m, approvals_per_1000_dwellings=excluded.approvals_per_1000_dwellings,
      approvals_detached_12m=excluded.approvals_detached_12m, approvals_other_residential_12m=excluded.approvals_other_residential_12m, supply_confidence=excluded.supply_confidence,
      renter_household_pct=excluded.renter_household_pct, owner_occupier_pct=excluded.owner_occupier_pct,
      total_population=excluded.total_population, total_households=excluded.total_households, median_weekly_household_income=excluded.median_weekly_household_income,
      renter_share=excluded.renter_share, owner_with_mortgage_share=excluded.owner_with_mortgage_share,
      price_to_income_ratio=excluded.price_to_income_ratio, rent_to_income_ratio=excluded.rent_to_income_ratio,
      est_monthly_repayment_owner_occupier=excluded.est_monthly_repayment_owner_occupier, est_monthly_repayment_investor=excluded.est_monthly_repayment_investor,
      repayment_to_income_pct=excluded.repayment_to_income_pct, rba_rate_used=excluded.rba_rate_used, rba_rate_period=excluded.rba_rate_period,
      assumption_scenario_code=excluded.assumption_scenario_code, affordability_confidence=excluded.affordability_confidence,
      confidence_label=excluded.confidence_label, data_quality_status=excluded.data_quality_status, direct_or_derived=excluded.direct_or_derived,
      source_periods=excluded.source_periods, metric_provenance=excluded.metric_provenance, missing_metric_reasons=excluded.missing_metric_reasons,
      updated_at=now()
  `);
  console.log(`  mart.suburb_market_snapshot: ${snapshotResult.rowCount} VIC rows upserted`);

  // ── 5. Timeseries upsert (sales / rent / yield / approvals) ──────────────
  const tsSales = await client.query(`
    insert into mart.suburb_market_timeseries (geography_id, geography_type, reference_period, period_type, dwelling_type, jurisdiction, state_code, metric_family, median_sale_price, confidence_label, source_dataset, geography_method)
    select h.geography_id, 'SAL', h.reference_period, 'quarter', h.dwelling_type, 'VIC', '2', 'sales', h.median_sale_price, h.sample_size_confidence, 'vic_vg_sales', 'sal_direct_or_alias'
    from vic_sales_history_staged h
    on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do nothing
  `);
  const tsRent = await client.query(`
    insert into mart.suburb_market_timeseries (geography_id, geography_type, reference_period, period_type, dwelling_type, jurisdiction, state_code, metric_family, median_weekly_rent, confidence_label, source_dataset, geography_method)
    select h.geography_id, 'SAL', h.reference_period, 'quarter', null, 'VIC', '2', 'rent', h.median_weekly_rent, h.confidence_label, 'vic_rent', 'sal_direct_or_alias'
    from vic_rent_history_staged h
    on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do nothing
  `);
  const tsYield = await client.query(`
    insert into mart.suburb_market_timeseries (geography_id, geography_type, reference_period, period_type, dwelling_type, jurisdiction, state_code, metric_family, gross_yield_percentage, confidence_label, source_dataset, geography_method)
    select s.geography_id, 'SAL', s.reference_period, 'quarter', s.dwelling_type, 'VIC', '2', 'yield',
      round((r.median_weekly_rent * 52 / s.median_sale_price) * 100, 2), 'medium', 'derived', 'sal_direct_or_alias'
    from vic_sales_history_staged s
    join vic_rent_history_staged r on r.geography_id = s.geography_id and r.reference_period = s.reference_period
    where s.median_sale_price > 0 and r.median_weekly_rent > 0
    on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do nothing
  `);
  const tsApprovals = await client.query(`
    insert into mart.suburb_market_timeseries (geography_id, geography_type, reference_period, period_type, dwelling_type, jurisdiction, state_code, metric_family, approvals_count, confidence_label, source_dataset, geography_method)
    select a.geography_id, 'SAL', a.reference_period, 'quarter', null, 'VIC', '2', 'approvals', a.approvals_12m_total, a.confidence_label, 'abs_building_approvals', 'already_national'
    from mart.suburb_building_approvals a
    join core.dim_geography g on g.geography_id = a.geography_id and g.state_code = '2'
    on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do nothing
  `);
  console.log(`  mart.suburb_market_timeseries: sales=${tsSales.rowCount} rent=${tsRent.rowCount} yield=${tsYield.rowCount} approvals=${tsApprovals.rowCount}`);

  // ── 6. Blocking validation gates ──────────────────────────────────────────
  const gates = await client.query(`
    select
      (select count(*)::int from (select geography_id, coalesce(dwelling_type,'') from mart.suburb_market_snapshot where jurisdiction='VIC' group by 1,2 having count(*)>1) x) as dup_snapshot,
      (select count(*)::int from (select geography_id, reference_period, period_type, coalesce(dwelling_type,''), metric_family from mart.suburb_market_timeseries where jurisdiction='VIC' group by 1,2,3,4,5 having count(*)>1) x) as dup_timeseries,
      (select count(*)::int from mart.suburb_market_snapshot s where s.jurisdiction='VIC' and not exists (select 1 from core.dim_geography g where g.geography_id = s.geography_id)) as orphan_snapshot,
      (select count(*)::int from mart.suburb_market_timeseries t where t.jurisdiction='VIC' and t.metric_family='yield' and t.confidence_label is null) as yield_missing_label,
      pg_database_size(current_database())::bigint as db_bytes_now
  `);
  const g = gates.rows[0];
  console.log(`  gates: dup_snapshot=${g.dup_snapshot} dup_timeseries=${g.dup_timeseries} orphan_snapshot=${g.orphan_snapshot} yield_missing_label=${g.yield_missing_label}`);

  const growthMb = (Number(g.db_bytes_now) - Number(sizeBefore.rows[0].bytes)) / 1024 / 1024;
  if (g.dup_snapshot > 0 || g.dup_timeseries > 0 || g.orphan_snapshot > 0 || g.yield_missing_label > 0) {
    throw new Error(`validation gate failed: ${JSON.stringify(g)}`);
  }
  if (growthMb > GROWTH_BUDGET_MB) {
    throw new Error(`growth ${growthMb.toFixed(1)}MB exceeds budget ${GROWTH_BUDGET_MB}MB`);
  }

  await client.query("COMMIT");
  console.log("\nCOMMITTED (branch only; production untouched).");

  const sizeAfter = await client.query("select pg_size_pretty(pg_database_size(current_database())) as sz");
  const report = {
    generated_at: new Date().toISOString(),
    mode: "EXECUTE",
    branch_ref: BRANCH_REF,
    production_touched: false,
    branch_merged: false,
    rows_loaded: {
      snapshot_vic_rows: snapshotResult.rowCount,
      timeseries_sales: tsSales.rowCount,
      timeseries_rent: tsRent.rowCount,
      timeseries_yield: tsYield.rowCount,
      timeseries_approvals: tsApprovals.rowCount,
    },
    validation_gates: { duplicate_snapshot: g.dup_snapshot, duplicate_timeseries: g.dup_timeseries, orphan_snapshot: g.orphan_snapshot, yield_missing_confidence_label: g.yield_missing_label },
    db_size_before: sizeBefore.rows[0].sz,
    db_size_after: sizeAfter.rows[0].sz,
    scope_notes: [
      "SAL (suburb) grain only — VPSR has no postcode-level figures, unlike NSW PSI.",
      "Only geography_confidence IN ('direct','alias') rows promoted — unresolved localities never written to Supabase.",
      "No townhouse_villa_semidetached coverage — VPSR has no such product.",
      "Demographics/dwelling-stock/approvals/RBA-rate data reused from already-national branch tables — no new download this phase.",
    ],
  };
  fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    RUN_REPORT_MD,
    `# Victoria Branch Load Report (Sprint 10, Phase 9)\n\nGenerated: ${report.generated_at}\n\n- branch ref: ${BRANCH_REF}\n- production touched: NO\n- branch merged: NO\n\n## Rows loaded\n\n| target | rows |\n|---|---|\n| mart.suburb_market_snapshot (VIC) | ${snapshotResult.rowCount} |\n| mart.suburb_market_timeseries (sales) | ${tsSales.rowCount} |\n| mart.suburb_market_timeseries (rent) | ${tsRent.rowCount} |\n| mart.suburb_market_timeseries (yield) | ${tsYield.rowCount} |\n| mart.suburb_market_timeseries (approvals) | ${tsApprovals.rowCount} |\n\n## Validation gates\n\n| gate | result |\n|---|---|\n| duplicate snapshot rows | ${g.dup_snapshot} |\n| duplicate timeseries rows | ${g.dup_timeseries} |\n| orphan snapshot geography | ${g.orphan_snapshot} |\n| yield rows missing confidence label | ${g.yield_missing_label} |\n\nBranch DB size: ${sizeBefore.rows[0].sz} -> ${sizeAfter.rows[0].sz}\n\n## Scope notes\n\n${report.scope_notes.map((n) => `- ${n}`).join("\n")}\n`
  );
  console.log(`Reports written: ${RUN_REPORT}`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("ROLLED BACK due to error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
