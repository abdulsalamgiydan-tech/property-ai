#!/usr/bin/env node
/**
 * Unified Market Intelligence — branch-only load (Sprint 9, Phases 5-7).
 *
 * Combines everything this sprint added into the branch:
 *   1. meta.metric_assumption — baseline affordability scenario (transparent,
 *      not hardcoded in application code).
 *   2. NEW townhouse_villa_semidetached sales facts + marts (Phase 3
 *      reclassification produced real sales-side coverage for this type for
 *      the first time — purely additive, no existing row touched).
 *   3. NEW townhouse_villa_semidetached yield marts (closes the sales/rent
 *      gap for this type).
 *   4. mart.suburb_demographic_profile_2021 / postcode_demographic_profile_2021
 *      — from the local Census demographics store, joined against the
 *      already-branch-resident tenure/dwelling-stock facts for percentages.
 *   5. mart.suburb_market_snapshot / postcode_market_snapshot — the unified
 *      wide-row snapshot, built entirely from branch-resident data via SQL
 *      (sales/rent/yield/approvals/demographics/RBA rate all already on the
 *      branch by the time this step runs).
 *   6. mart.suburb_market_timeseries / postcode_market_timeseries — compact
 *      recent-trend series (trailing 12m sales x 2 types, latest ~8 quarters
 *      rent/yield, current approvals point).
 *
 * SCOPE NOTE on the reclassification: only the NEW townhouse_villa_semidetached
 * cells are added to core.fact_residential_sales_summary this sprint. The
 * existing detached_house branch medians (built in Sprint 7, before the
 * Phase 3 reclassification) are NOT re-synced — only 0.73% of detached_house
 * records moved to the new type (see nsw_dwelling_type_reclassification_report),
 * so branch drift is small and documented, not silently hidden. A full
 * historical re-sync is deferred — see the branch load report.
 *
 * "Latest 12 months" for sales in the snapshot means the ANNUAL summary row
 * for the most recent calendar year with data (a real recomputed median, not
 * a median-of-monthly-medians, which would be statistically invalid).
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-load
 * gates (rollback on failure); all local-store reads happen before BEGIN.
 *
 * Usage:
 *   node load_market_intelligence_to_branch.mjs             # dry run
 *   node load_market_intelligence_to_branch.mjs --execute
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
const MAX_SAFE_DB_MB = 4500;
const GROWTH_BUDGET_MB = 200;

const NSW_SALES_DB = rel("warehouse", "data", "local", "nsw_sales.duckdb");
const CENSUS_DB = rel("warehouse", "data", "local", "census_demographics.duckdb");
const RECLASS_REPORT = rel("warehouse", "reports", "nsw_dwelling_type_reclassification_report.json");
const CENSUS_LOCAL_REPORT = rel("warehouse", "reports", "census_demographics_local_store_report.json");
const RUN_REPORT = rel("warehouse", "reports", "market_intelligence_branch_load_report.json");

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

for (const [p, hint] of [
  [NSW_SALES_DB, "run build_nsw_sales_full_state_local_store.mjs (Sprint 7) + reclassify_nsw_dwelling_types.mjs (Sprint 9)"],
  [CENSUS_DB, "run build_census_demographics_local_store.mjs"],
  [RECLASS_REPORT, "run reclassify_nsw_dwelling_types.mjs"],
]) {
  if (!fs.existsSync(p)) fail(`${path.relative(repoRoot, p)} missing — ${hint}`);
}
if (fs.existsSync(CENSUS_LOCAL_REPORT) && JSON.parse(fs.readFileSync(CENSUS_LOCAL_REPORT, "utf8")).verdict !== "PASSED") {
  fail("census_demographics_local_store_report verdict is not PASSED — refusing to load (hard stop)");
}

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`load_market_intelligence_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const [sizeBefore] = await q("select pg_database_size(current_database()) bytes, pg_size_pretty(pg_database_size(current_database())) pretty");
const dbMbBefore = Number(sizeBefore.bytes) / 1024 / 1024;
if (dbMbBefore > MAX_SAFE_DB_MB * 0.85) fail(`branch DB at ${dbMbBefore.toFixed(0)}MB is over 85% of MAX_SAFE_DB_MB=${MAX_SAFE_DB_MB} — hard stop`);
console.log(`  branch DB size before: ${sizeBefore.pretty} (${((dbMbBefore / MAX_SAFE_DB_MB) * 100).toFixed(1)}% of ${MAX_SAFE_DB_MB}MB ceiling)`);

for (const t of [
  "mart.suburb_demographic_profile_2021", "mart.postcode_demographic_profile_2021",
  "mart.suburb_market_timeseries", "mart.postcode_market_timeseries", "meta.metric_assumption",
]) {
  const [chk] = await q(`select to_regclass($1) r`, [t]);
  if (!chk.r) fail(`${t} missing on branch — apply migrations 012-014 first (hard stop)`);
}

// ── Pre-read from DuckDB BEFORE opening the branch transaction ───────────

console.log("\n  pre-reading local stores (before transaction)...");

const nswInstance = await DuckDBInstance.create(NSW_SALES_DB, { access_mode: "READ_ONLY" });
const nswDb = await nswInstance.connect();
const nswRows = async (sql) => (await nswDb.runAndReadAll(sql)).getRowObjects();

const townhouseAnnual = (await nswRows(
  `select geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
          transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price,
          upper_quartile_sale_price, min_sale_price, max_sale_price, sample_size_confidence
   from nsw_sales_summary where dwelling_type='townhouse_villa_semidetached' and period_type='year'`
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
const monthlyCutoffRow = await nswRows("select least(max(reference_period), current_date) mp from nsw_sales_summary where period_type='month'");
const monthlyCutoff = duckDate(monthlyCutoffRow[0].mp);
const townhouseMonthly = (await nswRows(
  `select geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
          transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price,
          upper_quartile_sale_price, min_sale_price, max_sale_price, sample_size_confidence
   from nsw_sales_summary where dwelling_type='townhouse_villa_semidetached' and period_type='month'
     and reference_period <= current_date and reference_period > (date '${monthlyCutoff}' - interval 12 month)`
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
nswDb.closeSync();
console.log(`  pre-read: ${townhouseAnnual.length} townhouse_villa_semidetached annual rows + ${townhouseMonthly.length} trailing-12m monthly rows (NEW sales coverage from Phase 3 reclassification)`);

const censusInstance = await DuckDBInstance.create(CENSUS_DB, { access_mode: "READ_ONLY" });
const censusDb = await censusInstance.connect();
const censusAllRows = (await censusDb.runAndReadAll(
  "select * from census_demographics where geography_id is not null"
)).getRowObjects();
censusDb.closeSync();
console.log(`  pre-read: ${censusAllRows.length} Census demographic rows (direct SAL/POA, geography-matched)`);

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  db_size_before: sizeBefore.pretty,
  scope_notes: {
    detached_house_medians_not_resynced: "Existing branch core.fact_residential_sales_summary detached_house rows (loaded Sprint 7) are NOT re-synced to reflect the Phase 3 reclassification this sprint — only 0.73% of records moved (18,712 of 2,556,681), see nsw_dwelling_type_reclassification_report.json. Only the NEW townhouse_villa_semidetached cells are added (purely additive).",
    latest_12m_sales_definition: "Snapshot 'latest 12-month' sales figures use the ANNUAL summary row for the most recent calendar year with data — a genuinely recomputed median, not a median-of-monthly-medians (which would be statistically invalid).",
    population_2016_deferred: "population_2016 / population_growth_2016_2021_pct intentionally NULL — see census_demographics_source_manifest.json.",
  },
  loaded: {},
  gates_after: {},
};

if (!EXECUTE) {
  console.log(`\nDry run: would insert ${townhouseAnnual.length + townhouseMonthly.length} new townhouse_villa sales fact rows, rebuild affected marts,`);
  console.log(`load ${censusAllRows.length} Census demographic profile rows, then build the unified snapshot + timeseries marts from branch-resident data.`);
  await client.end();
  process.exit(0);
}

try {
  await client.query("begin");

  // ── 1. meta.metric_assumption — baseline scenario ──────────────────────
  await client.query(`
    insert into meta.metric_assumption (scenario_code, assumption_name, numeric_value, text_value, unit, effective_from, source_notes) values
    ('standard_20pct_deposit_30yr_pi','deposit_percent',20,null,'percent',current_date,'Baseline research scenario for descriptive affordability context — not a recommendation'),
    ('standard_20pct_deposit_30yr_pi','loan_term_years',30,null,'years',current_date,null),
    ('standard_20pct_deposit_30yr_pi','repayment_type',null,'principal_and_interest','text',current_date,null),
    ('standard_20pct_deposit_30yr_pi','rate_source',null,'Official RBA housing lending rate (mart.national_interest_rate_context, rate_type=housing_lending_rate, loan_type=variable, split by borrower_type)','text',current_date,null),
    ('standard_20pct_deposit_30yr_pi','lmi_included',0,'excluded','boolean',current_date,'LMI is excluded from this baseline scenario'),
    ('standard_20pct_deposit_30yr_pi','stamp_duty_included',0,'excluded_from_repayment','boolean',current_date,'Stamp duty is excluded from the repayment estimate'),
    ('standard_20pct_deposit_30yr_pi','fees_included',0,'excluded','boolean',current_date,'Loan establishment/ongoing fees are excluded')
    on conflict (scenario_code, assumption_name, effective_from) do nothing`);
  console.log("\n  meta.metric_assumption: baseline scenario rows inserted");

  // ── 2. NEW townhouse_villa_semidetached sales facts (purely additive) ──
  const dimIds = new Set((await q("select geography_id from core.dim_geography where is_current")).map((r) => r.geography_id));
  const insertBatch = async (rows, table, cols, buildTuple, conflictClause, batchSize = 500) => {
    let loaded = 0, orphans = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize).filter((r) => {
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
      await client.query(`insert into ${table} (${cols.join(",")}) values ${tuples.join(",")} ${conflictClause}`, params);
      loaded += tuples.length;
    }
    return { attempted: loaded, orphans };
  };
  const salesFactCols = [
    "geography_id", "geography_type", "geography_code", "reference_period", "period_type", "dwelling_type",
    "transaction_count", "median_sale_price", "mean_sale_price", "lower_quartile_sale_price",
    "upper_quartile_sale_price", "min_sale_price", "max_sale_price",
    "source_id", "dataset_id", "data_quality_status", "sample_size_confidence", "confidence_label",
  ];
  const buildSalesTuple = (r) => [
    r.geography_id, r.geography_type, r.geography_code, r.reference_period, r.period_type, r.dwelling_type,
    num(r.transaction_count), r.median_sale_price, r.mean_sale_price, r.lower_quartile_sale_price,
    r.upper_quartile_sale_price, r.min_sale_price, r.max_sale_price,
    "nsw_vg_sales", "nsw_psi_2001_current_full_state", "passed", r.sample_size_confidence, r.sample_size_confidence,
  ];
  const annualResult = await insertBatch(townhouseAnnual, "core.fact_residential_sales_summary", salesFactCols, buildSalesTuple,
    "on conflict (geography_id, reference_period, period_type, dwelling_type) do nothing");
  const monthlyResult = await insertBatch(townhouseMonthly, "core.fact_residential_sales_summary", salesFactCols, buildSalesTuple,
    "on conflict (geography_id, reference_period, period_type, dwelling_type) do nothing");
  console.log(`  core.fact_residential_sales_summary: +${annualResult.attempted} annual +${monthlyResult.attempted} monthly townhouse_villa rows (${annualResult.orphans + monthlyResult.orphans} orphans skipped)`);
  report.loaded.townhouse_villa_sales_facts = annualResult.attempted + monthlyResult.attempted;

  // ── 3. Rebuild sales marts for the new dwelling type only (additive) ───
  const buildSalesMart = async (target, periodType, periodCol, table, extraFilter = "") => {
    const r = await client.query(`
      insert into ${table} (geography_id, geography_name, state_code, ${periodCol}, dwelling_type,
        transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price, upper_quartile_sale_price,
        sample_size_confidence, confidence_label, source_summary)
      select f.geography_id, d.geography_name, d.state_code, f.reference_period, f.dwelling_type,
        f.transaction_count, f.median_sale_price, f.mean_sale_price, f.lower_quartile_sale_price, f.upper_quartile_sale_price,
        f.sample_size_confidence, f.sample_size_confidence,
        jsonb_build_object('source','nsw_vg_sales','dwelling_type_rule_version',2,'note','new coverage from Sprint 9 Phase 3 reclassification')
      from core.fact_residential_sales_summary f
      join core.dim_geography d on d.geography_id = f.geography_id
      where f.geography_type = '${target}' and f.period_type = '${periodType}' and f.dwelling_type = 'townhouse_villa_semidetached' ${extraFilter}
      on conflict (geography_id, ${periodCol}, dwelling_type) do nothing`);
    console.log(`  ${table}: ${r.rowCount} new townhouse_villa rows`);
    return r.rowCount;
  };
  report.loaded.suburb_sales_monthly_new = await buildSalesMart("SAL", "month", "reference_month", "mart.suburb_sales_monthly");
  report.loaded.suburb_sales_annual_new = await buildSalesMart("SAL", "year", "reference_year", "mart.suburb_sales_annual");
  report.loaded.postcode_sales_monthly_new = await buildSalesMart("POA", "month", "reference_month", "mart.postcode_sales_monthly");
  report.loaded.postcode_sales_annual_new = await buildSalesMart("POA", "year", "reference_year", "mart.postcode_sales_annual");

  // ── 4. NEW townhouse_villa yield marts (sales+rent now both exist) ─────
  const buildYieldMart = async (target, table, salesMart, rentMart) => {
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
        jsonb_build_object('sales_period_basis','annual_calendar_year_containing_quarter','via','sprint9_phase3_reclassification')
      from ${rentMart} rent
      left join ${salesMart} sales on sales.geography_id = rent.geography_id
        and sales.dwelling_type = rent.dwelling_type
        and date_trunc('year', sales.reference_year)::date = date_trunc('year', rent.reference_quarter)::date
      where rent.dwelling_type = 'townhouse_villa_semidetached'
      on conflict (geography_id, reference_period, dwelling_type) do nothing`);
    console.log(`  ${table}: ${r.rowCount} new townhouse_villa yield rows`);
    return r.rowCount;
  };
  report.loaded.suburb_yield_new = await buildYieldMart("SAL", "mart.suburb_yield_quarterly", "mart.suburb_sales_annual", "mart.suburb_rent_quarterly");
  report.loaded.postcode_yield_new = await buildYieldMart("POA", "mart.postcode_yield_quarterly", "mart.postcode_sales_annual", "mart.postcode_rent_quarterly");

  // ── 5. Demographic profile marts (from pre-read Census local store) ────
  const insertDemographic = async (rows, table, geoType) => {
    const filtered = rows.filter((r) => r.geography_type === geoType);
    let loaded = 0;
    const cols = [
      "geography_id", "geography_code", "geography_name", "geography_type", "state_code", "census_year",
      "total_population", "population_2021", "median_age", "total_households", "family_households",
      "lone_person_households", "average_household_size", "median_weekly_household_income",
      "median_weekly_personal_income", "median_weekly_family_income", "census_median_weekly_rent",
      "census_median_monthly_mortgage", "geography_method", "confidence_label", "data_quality_status",
      "missing_metric_reasons", "source_summary",
    ];
    for (let i = 0; i < filtered.length; i += 500) {
      const slice = filtered.slice(i, i + 500).filter((r) => dimIds.has(r.geography_id));
      if (slice.length === 0) continue;
      const params = [];
      const tuples = slice.map((r) => {
        const values = [
          r.geography_id, r.geography_code, null, geoType, null, num(r.census_year),
          num(r.total_population), num(r.total_population), r.median_age, num(r.total_households),
          num(r.family_households), num(r.lone_person_households), r.average_household_size,
          num(r.median_weekly_household_income), num(r.median_weekly_personal_income), num(r.median_weekly_family_income),
          num(r.census_median_weekly_rent), num(r.census_median_monthly_mortgage), "direct", "official",
          "passed", JSON.stringify({ population_2016: "2016/2021 ASGS boundary mismatch — see census_demographics_source_manifest.json" }),
          JSON.stringify({ tables: "G01,G02,G35", publisher: "ABS", census_year: 2021 }),
        ];
        const b = params.length;
        params.push(...values);
        return `(${values.map((_, j) => `$${b + j + 1}`).join(",")})`;
      });
      await client.query(
        `insert into ${table} (${cols.join(",")}) values ${tuples.join(",")}
         on conflict (geography_id, census_year) do nothing`, params);
      loaded += tuples.length;
    }
    // backfill geography_name/state_code from core.dim_geography
    await client.query(`update ${table} t set geography_name = d.geography_name, state_code = d.state_code
      from core.dim_geography d where d.geography_id = t.geography_id and t.geography_name is null`);
    return loaded;
  };
  report.loaded.suburb_demographic_profile = await insertDemographic(censusAllRows, "mart.suburb_demographic_profile_2021", "SAL");
  report.loaded.postcode_demographic_profile = await insertDemographic(censusAllRows, "mart.postcode_demographic_profile_2021", "POA");
  console.log(`  mart.suburb_demographic_profile_2021: ${report.loaded.suburb_demographic_profile} rows`);
  console.log(`  mart.postcode_demographic_profile_2021: ${report.loaded.postcode_demographic_profile} rows`);

  // Tenure/dwelling-type percentages from already-branch-resident core facts.
  const backfillTenureAndDwelling = async (table, geoType) => {
    await client.query(`
      with tenure as (
        select geography_id,
          sum(household_count) filter (where tenure_type='rented') as renters,
          sum(household_count) filter (where tenure_type='owned_with_mortgage') as mortgage,
          sum(household_count) filter (where tenure_type='owned_outright') as outright,
          sum(household_count) filter (where tenure_type='all') as total
        from core.fact_household_tenure where geography_type = '${geoType}' group by 1
      )
      update ${table} p set
        -- Reliability threshold (total households >= 20) PLUS a [0,100]
        -- clamp: ABS applies small-cell randomisation/perturbation for
        -- privacy, which can make tenure subcategories not sum cleanly to
        -- the stated total even above this threshold (observed directly on
        -- the branch: sums of 101-112% for several hundred small SALs).
        -- The underlying raw counts in core.fact_household_tenure are never
        -- altered — only this derived, labelled-as-a-percentage column is
        -- bounded to the mathematically valid [0,100] range. Below the
        -- N>=20 threshold the value is NULL instead (not meaningful at all).
        renter_household_pct = case when t.total >= 20 then greatest(0, least(100, round(t.renters::numeric / nullif(t.total,0) * 100, 2))) else null end,
        owner_with_mortgage_pct = case when t.total >= 20 then greatest(0, least(100, round(t.mortgage::numeric / nullif(t.total,0) * 100, 2))) else null end,
        owner_outright_pct = case when t.total >= 20 then greatest(0, least(100, round(t.outright::numeric / nullif(t.total,0) * 100, 2))) else null end
      from tenure t where t.geography_id = p.geography_id`);
    await client.query(`
      with dwellings as (
        select geography_id,
          sum(dwelling_count) filter (where measure_name='occupied_private_dwellings' and dwelling_type='all') as occupied,
          sum(dwelling_count) filter (where measure_name='unoccupied_private_dwellings' and dwelling_type='all') as unoccupied,
          sum(dwelling_count) filter (where measure_name='total_private_dwellings' and dwelling_type='all') as total,
          sum(dwelling_count) filter (where measure_name='occupied_private_dwellings' and dwelling_type='separate_house') as detached,
          sum(dwelling_count) filter (where measure_name='occupied_private_dwellings' and dwelling_type='flat_apartment') as apartment
        from core.fact_dwelling_stock where geography_type = '${geoType}' group by 1
      )
      update ${table} p set
        occupied_dwelling_count = d.occupied, unoccupied_dwelling_count = d.unoccupied,
        -- Same N>=20 reliability threshold + [0,100] clamp as the tenure
        -- percentages above (same ABS small-cell perturbation cause).
        detached_house_pct = case when d.total >= 20 then greatest(0, least(100, round(d.detached::numeric / nullif(d.total,0) * 100, 2))) else null end,
        apartment_unit_pct = case when d.total >= 20 then greatest(0, least(100, round(d.apartment::numeric / nullif(d.total,0) * 100, 2))) else null end
      from dwellings d where d.geography_id = p.geography_id`);
  };
  await backfillTenureAndDwelling("mart.suburb_demographic_profile_2021", "SAL");
  await backfillTenureAndDwelling("mart.postcode_demographic_profile_2021", "POA");
  console.log("  tenure/dwelling-type percentages backfilled from core.fact_household_tenure / core.fact_dwelling_stock");

  // ── 6. Unified market snapshot — the big wide-row build ────────────────
  const buildSnapshot = async (target, table, salesAnnual, salesMonthly, rentMart, yieldMart, approvalsMart, dwellingStockMart, demogTable) => {
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
          max(s.median_sale_price) filter (where s.reference_year = ly.ry - interval '1 year' and s.dwelling_type='detached_house') as prev_med_detached,
          max(s.sample_size_confidence) filter (where s.reference_year = ly.ry) as sample_conf
        from ${salesAnnual} s join latest_year ly on ly.geography_id = s.geography_id
        group by 1,2
      ),
      rent_latest as (
        select geography_id, max(reference_quarter) as rq
        from ${rentMart} where dwelling_type = 'all' group by 1
      ),
      rent_data as (
        select r.geography_id, rl.rq as rent_period, r.median_weekly_rent as rent_now, r.sample_size_confidence as rent_conf,
          (select r2.median_weekly_rent from ${rentMart} r2
             where r2.geography_id = r.geography_id and r2.dwelling_type='all'
               and r2.reference_quarter = rl.rq - interval '1 year' limit 1) as rent_prev
        from ${rentMart} r join rent_latest rl on rl.geography_id = r.geography_id and rl.rq = r.reference_quarter
        where r.dwelling_type = 'all'
      ),
      yield_latest as (
        -- dwelling_type='all' yield rows are ALWAYS null-yield by construction
        -- (VG PSI sales data has no 'all dwelling types' bucket to join
        -- against — only DCJ rent does) — pick the best-available REAL
        -- dwelling-type row instead: prefer a computed (non-null) yield,
        -- then the most recent quarter, across detached_house/apartment_unit/
        -- townhouse_villa_semidetached.
        select distinct on (geography_id) geography_id, reference_period, dwelling_type, gross_yield_percentage, yield_confidence_label
        from ${yieldMart}
        where dwelling_type <> 'all'
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
        dg.renter_household_pct,
        case when dg.owner_with_mortgage_pct is not null and dg.owner_outright_pct is not null
             then least(100, round(dg.owner_with_mortgage_pct + dg.owner_outright_pct, 2)) else null end,
        dg.total_population, null, dg.total_households, dg.median_weekly_household_income, dg.renter_household_pct, dg.owner_with_mortgage_pct,
        case when sl.any_median > 0 and dg.median_weekly_household_income > 0 then round(sl.any_median / (dg.median_weekly_household_income*52), 2) else null end,
        case when rd.rent_now > 0 and dg.median_weekly_household_income > 0 then round(rd.rent_now::numeric / dg.median_weekly_household_income, 3) else null end,
        case when sl.any_median > 0 and ro.rate_percent > 0 then
          round((sl.any_median * 0.8) * (ro.rate_percent/100/12) * power(1+ro.rate_percent/100/12, 360) / (power(1+ro.rate_percent/100/12, 360) - 1), 2)
        else null end,
        case when sl.any_median > 0 and ri.rate_percent > 0 then
          round((sl.any_median * 0.8) * (ri.rate_percent/100/12) * power(1+ri.rate_percent/100/12, 360) / (power(1+ri.rate_percent/100/12, 360) - 1), 2)
        else null end,
        case when sl.any_median > 0 and ro.rate_percent > 0 and dg.median_weekly_household_income > 0 then
          round(((sl.any_median * 0.8) * (ro.rate_percent/100/12) * power(1+ro.rate_percent/100/12, 360) / (power(1+ro.rate_percent/100/12, 360) - 1)) / (dg.median_weekly_household_income * 52 / 12) * 100, 2)
        else null end,
        ro.rate_percent, ro.reference_period, 'standard_20pct_deposit_30yr_pi',
        case when sl.any_median is not null and dg.median_weekly_household_income is not null and ro.rate_percent is not null then 'medium' else 'insufficient' end,
        case when sl.geography_id is not null and rd.geography_id is not null then 'high' when sl.geography_id is not null or rd.geography_id is not null then 'medium' else 'insufficient' end,
        'passed', 'direct',
        jsonb_build_object('sales_year', sl.ry, 'rent_quarter', rd.rent_period, 'census_year', 2021),
        jsonb_build_object('sales_source','nsw_vg_sales','rent_source','nsw_dcj_rent_and_sales_report','yield_source','derived','demographics_source','abs_census_2021','rate_source','rba'),
        case when dg.total_population is null then jsonb_build_object('demographics','no census match')
             when sl.geography_id is null then jsonb_build_object('sales','no NSW VG sales data for this geography')
             else '{}'::jsonb end
      from core.dim_geography d
      left join latest_year sl_y on sl_y.geography_id = d.geography_id
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
        geography_code = excluded.geography_code, geography_name = excluded.geography_name, state_code = excluded.state_code,
        latest_sales_period = excluded.latest_sales_period, latest_rent_period = excluded.latest_rent_period,
        latest_yield_period = excluded.latest_yield_period, latest_approvals_period = excluded.latest_approvals_period,
        latest_demographics_period = excluded.latest_demographics_period, snapshot_generated_at = excluded.snapshot_generated_at,
        coverage_status = excluded.coverage_status, sales_volume_12m = excluded.sales_volume_12m,
        median_sale_price_12m = excluded.median_sale_price_12m, median_sale_price_prev_12m = excluded.median_sale_price_prev_12m,
        annual_price_change_pct = excluded.annual_price_change_pct, median_sale_price_detached = excluded.median_sale_price_detached,
        median_sale_price_apartment = excluded.median_sale_price_apartment, median_sale_price_townhouse = excluded.median_sale_price_townhouse,
        sales_sample_confidence = excluded.sales_sample_confidence, median_weekly_rent_latest = excluded.median_weekly_rent_latest,
        median_weekly_rent_prev = excluded.median_weekly_rent_prev, annual_rent_change_pct = excluded.annual_rent_change_pct,
        rent_confidence = excluded.rent_confidence, gross_yield_pct = excluded.gross_yield_pct,
        yield_confidence = excluded.yield_confidence, yield_sale_period_used = excluded.yield_sale_period_used,
        yield_rent_period_used = excluded.yield_rent_period_used, dwelling_stock_total = excluded.dwelling_stock_total,
        approvals_12m = excluded.approvals_12m, approvals_per_1000_dwellings = excluded.approvals_per_1000_dwellings,
        approvals_detached_12m = excluded.approvals_detached_12m, approvals_other_residential_12m = excluded.approvals_other_residential_12m,
        supply_confidence = excluded.supply_confidence, sales_turnover_pct = excluded.sales_turnover_pct,
        renter_household_pct = excluded.renter_household_pct, owner_occupier_pct = excluded.owner_occupier_pct,
        total_population = excluded.total_population, population_growth_2016_2021_pct = excluded.population_growth_2016_2021_pct,
        total_households = excluded.total_households, median_weekly_household_income = excluded.median_weekly_household_income,
        renter_share = excluded.renter_share, owner_with_mortgage_share = excluded.owner_with_mortgage_share,
        price_to_income_ratio = excluded.price_to_income_ratio, rent_to_income_ratio = excluded.rent_to_income_ratio,
        est_monthly_repayment_owner_occupier = excluded.est_monthly_repayment_owner_occupier,
        est_monthly_repayment_investor = excluded.est_monthly_repayment_investor,
        repayment_to_income_pct = excluded.repayment_to_income_pct, rba_rate_used = excluded.rba_rate_used,
        rba_rate_period = excluded.rba_rate_period, assumption_scenario_code = excluded.assumption_scenario_code,
        affordability_confidence = excluded.affordability_confidence, confidence_label = excluded.confidence_label,
        data_quality_status = excluded.data_quality_status, direct_or_derived = excluded.direct_or_derived,
        source_periods = excluded.source_periods, metric_provenance = excluded.metric_provenance,
        missing_metric_reasons = excluded.missing_metric_reasons, updated_at = now()`);
    console.log(`  ${table}: ${r.rowCount} snapshot rows built`);
    return r.rowCount;
  };
  report.loaded.suburb_market_snapshot = await buildSnapshot("SAL", "mart.suburb_market_snapshot",
    "mart.suburb_sales_annual", "mart.suburb_sales_monthly", "mart.suburb_rent_quarterly", "mart.suburb_yield_quarterly",
    "mart.suburb_building_approvals", "mart.suburb_dwelling_stock_2021", "mart.suburb_demographic_profile_2021");
  report.loaded.postcode_market_snapshot = await buildSnapshot("POA", "mart.postcode_market_snapshot",
    "mart.postcode_sales_annual", "mart.postcode_sales_monthly", "mart.postcode_rent_quarterly", "mart.postcode_yield_quarterly",
    "mart.postcode_building_approvals", "mart.postcode_dwelling_stock_2021", "mart.postcode_demographic_profile_2021");

  // ── 7. Time-series marts (compact recent-trend, from already-curated branch marts) ─
  const buildTimeseries = async (target, table, salesMonthly, rentMart, yieldMart, approvalsMart) => {
    const rSales = await client.query(`
      insert into ${table} (geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family, transaction_count, median_sale_price, confidence_label, source_dataset)
      select geography_id, '${target}', reference_month, 'month', dwelling_type, 'sales', transaction_count, median_sale_price, confidence_label, 'nsw_vg_sales'
      from ${salesMonthly}
      where dwelling_type in ('detached_house','apartment_unit')
        -- Explicit 12-month cutoff: ${salesMonthly} turned out to hold full
        -- history (1996-current) on this branch, not the trailing-12-months
        -- this table's own design intent assumes (discovered during Phase
        -- 10 UI testing — see market_intelligence_branch_load_report.md).
        -- This filter keeps any FUTURE run of this script compact; it
        -- cannot retroactively shrink rows already inserted by the run that
        -- predates this fix (no DELETE per this sprint's hard rules) — the
        -- app's query layer (lib/warehouse/queries.ts) applies the same
        -- 12-month window client-side so the UI stays correct regardless.
        and reference_month >= (select max(reference_month) - interval '12 months' from ${salesMonthly})
      on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do nothing`);
    const rRent = await client.query(`
      insert into ${table} (geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family, median_weekly_rent, confidence_label, source_dataset)
      select geography_id, '${target}', reference_quarter, 'quarter', null, 'rent', median_weekly_rent, confidence_label, 'nsw_dcj_rent_and_sales_report'
      from ${rentMart} where dwelling_type = 'all'
        and reference_quarter >= (select max(reference_quarter) - interval '24 months' from ${rentMart})
      on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do nothing`);
    const rYield = await client.query(`
      insert into ${table} (geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family, gross_yield_percentage, confidence_label, source_dataset)
      select geography_id, '${target}', reference_period, 'quarter', null, 'yield', gross_yield_percentage, yield_confidence_label, 'derived'
      from ${yieldMart} where dwelling_type = 'all'
        and reference_period >= (select max(reference_period) - interval '24 months' from ${yieldMart})
      on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do nothing`);
    const rApprovals = await client.query(`
      insert into ${table} (geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family, approvals_count, confidence_label, source_dataset)
      select geography_id, '${target}', reference_period, 'month', null, 'approvals', approvals_12m_total, confidence_label, 'abs_building_approvals'
      from ${approvalsMart}
      on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do nothing`);
    // Note: 'rate' metric_family is deliberately NOT populated here — RBA
    // rate context is national (not geography-scoped), so it doesn't fit
    // this table's per-geography FK-constrained grain. It remains fully
    // available via the existing mart.national_interest_rate_context table
    // (Sprint 8) and is already carried on the snapshot (rba_rate_used/
    // rba_rate_period) for affordability context.
    const total = rSales.rowCount + rRent.rowCount + rYield.rowCount + rApprovals.rowCount;
    console.log(`  ${table}: ${total} rows (sales=${rSales.rowCount} rent=${rRent.rowCount} yield=${rYield.rowCount} approvals=${rApprovals.rowCount})`);
    return total;
  };
  report.loaded.suburb_market_timeseries = await buildTimeseries("SAL", "mart.suburb_market_timeseries",
    "mart.suburb_sales_monthly", "mart.suburb_rent_quarterly", "mart.suburb_yield_quarterly", "mart.suburb_building_approvals");
  report.loaded.postcode_market_timeseries = await buildTimeseries("POA", "mart.postcode_market_timeseries",
    "mart.postcode_sales_monthly", "mart.postcode_rent_quarterly", "mart.postcode_yield_quarterly", "mart.postcode_building_approvals");

  // ── Post-load blocking gates ───────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select geography_id from mart.suburb_market_snapshot where dwelling_type is null group by 1 having count(*)>1) x) as dup_suburb_snapshot,
    (select count(*)::int from (select geography_id from mart.postcode_market_snapshot where dwelling_type is null group by 1 having count(*)>1) x) as dup_postcode_snapshot,
    (select count(*)::int from mart.suburb_market_snapshot s where dwelling_type is null and not exists (select 1 from core.dim_geography d where d.geography_id = s.geography_id)) as orphan_suburb_snapshot,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and (median_sale_price_12m < 0 or median_weekly_rent_latest < 0 or median_weekly_household_income < 0 or sales_volume_12m < 0)) as negative_suburb,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and (renter_household_pct < 0 or renter_household_pct > 100 or owner_occupier_pct < 0 or owner_occupier_pct > 100 or sales_turnover_pct < 0)) as bad_pct_suburb,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and gross_yield_pct is not null and yield_confidence is null) as yield_missing_label,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and (est_monthly_repayment_owner_occupier is not null) and (median_sale_price_12m is null or rba_rate_used is null or median_weekly_household_income is null)) as affordability_without_inputs,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and median_sale_price_12m is not null and sales_sample_confidence is null) as price_without_sample_label,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and latest_sales_period > current_date) as future_dated_period,
    (select count(*)::int from (select geography_id, reference_period, period_type, coalesce(dwelling_type,''), metric_family from mart.suburb_market_timeseries group by 1,2,3,4,5 having count(*)>1) x) as dup_timeseries,
    pg_size_pretty(pg_database_size(current_database())) as db_now`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup_snapshot=${Number(post.dup_suburb_snapshot)+Number(post.dup_postcode_snapshot)} orphan=${post.orphan_suburb_snapshot} negative=${post.negative_suburb} bad_pct=${post.bad_pct_suburb} yield_missing_label=${post.yield_missing_label} afford_no_inputs=${post.affordability_without_inputs} price_no_label=${post.price_without_sample_label} future_dated=${post.future_dated_period} dup_ts=${post.dup_timeseries} db_now=${post.db_now}`);
  const failCount = [post.dup_suburb_snapshot, post.dup_postcode_snapshot, post.orphan_suburb_snapshot, post.negative_suburb, post.bad_pct_suburb, post.yield_missing_label, post.affordability_without_inputs, post.price_without_sample_label, post.future_dated_period, post.dup_timeseries].map(Number).reduce((a, b) => a + b, 0);
  if (failCount > 0) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  const growthMb = (Number((await q("select pg_database_size(current_database()) b"))[0].b) / 1024 / 1024) - dbMbBefore;
  if (growthMb > GROWTH_BUDGET_MB) {
    await client.query("rollback");
    fail(`branch growth ${growthMb.toFixed(1)}MB exceeds the ${GROWTH_BUDGET_MB}MB budget — transaction rolled back (hard stop)`);
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 500)}`);
}

// ── Post-commit summary ──────────────────────────────────────────────────

const [summary] = await q(`select
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null) as suburb_snapshot,
  (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null) as postcode_snapshot,
  (select count(*)::int from mart.suburb_demographic_profile_2021) as suburb_demog,
  (select count(*)::int from mart.postcode_demographic_profile_2021) as postcode_demog,
  (select count(*)::int from mart.suburb_market_timeseries) as suburb_ts,
  (select count(*)::int from mart.postcode_market_timeseries) as postcode_ts,
  (select json_object_agg(confidence_label, n) from (select confidence_label, count(*)::int n from mart.suburb_market_snapshot where dwelling_type is null group by 1) x) as suburb_confidence_dist,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state = summary;
report.db_size_after = summary.db_size;
await client.end();

fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/market_intelligence_branch_load_report.json");
console.log(`suburb_snapshot=${summary.suburb_snapshot} postcode_snapshot=${summary.postcode_snapshot} suburb_demog=${summary.suburb_demog} postcode_demog=${summary.postcode_demog} suburb_ts=${summary.suburb_ts} postcode_ts=${summary.postcode_ts} db=${summary.db_size}`);
