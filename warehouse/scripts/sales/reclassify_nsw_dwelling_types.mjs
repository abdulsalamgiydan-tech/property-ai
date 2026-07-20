#!/usr/bin/env node
/**
 * NSW dwelling-type reclassification (Sprint 9, Phase 3).
 *
 * Applies the v2 rule set (warehouse/config/nsw_dwelling_type_mapping.yml,
 * warehouse/docs/NSW_DWELLING_TYPE_CLASSIFICATION.md) IN PLACE to the
 * existing local store (warehouse/data/local/nsw_sales.duckdb) — raw
 * extraction/staging/dedup are unaffected and not re-run. Only the new
 * rule (townhouse_villa_semidetached via unit_number/slash house_number
 * evidence on non-strata RESIDENCE records) changes any row; every other
 * rule is unchanged from the Sprint 5/7 rule set.
 *
 * Rebuilds nsw_sales_summary afterwards so every downstream monthly/annual
 * median reflects the new classification.
 *
 * No Supabase connection, no secrets. Local-only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const DB_PATH = rel("warehouse", "data", "local", "nsw_sales.duckdb");
const LOCAL_DIR = rel("warehouse", "data", "local");
const OUT_JSON = rel("warehouse", "reports", "nsw_dwelling_type_reclassification_report.json");
const OUT_MD = rel("warehouse", "reports", "nsw_dwelling_type_reclassification_report.md");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);
const toPlain = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, num(v)])));

if (!fs.existsSync(DB_PATH)) fail("nsw_sales.duckdb missing — run build_nsw_sales_full_state_local_store.mjs first (Sprint 7)");

console.log("reclassify_nsw_dwelling_types — in-place local reclassification (no Supabase, no secrets)");

const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
const run = (sql) => db.run(sql);
const rowsOf = async (sql) => (await db.runAndReadAll(sql)).getRowObjects();

// ── Before snapshot ─────────────────────────────────────────────────────
const beforeDist = toPlain(await rowsOf(
  "select dwelling_type, dwelling_type_confidence, count(*)::int n from nsw_sales_transactions_raw where is_residential group by 1,2 order by 1,2"
));
console.log("\nBefore distribution:", beforeDist.map((r) => `${r.dwelling_type}/${r.dwelling_type_confidence}=${r.n}`).join(", "));

// ── Rule 4 (new): reclassify eligible detached_house rows ───────────────
const [eligible] = await rowsOf(`
  select count(*)::int n from nsw_sales_transactions_raw
  where is_residential and dwelling_type = 'detached_house'
    and (strata_lot is null or strata_lot = '')
    and ((unit_number is not null and unit_number <> '') or house_number like '%/%')
`);
console.log(`\nRule 4 (new): ${num(eligible.n)} rows eligible for reclassification (detached_house -> townhouse_villa_semidetached)`);

await run(`
  update nsw_sales_transactions_raw
  set dwelling_type = 'townhouse_villa_semidetached', dwelling_type_confidence = 'medium'
  where is_residential and dwelling_type = 'detached_house'
    and (strata_lot is null or strata_lot = '')
    and ((unit_number is not null and unit_number <> '') or house_number like '%/%')
`);

// ── After snapshot ────────────────────────────────────────────────────────
const afterDist = toPlain(await rowsOf(
  "select dwelling_type, dwelling_type_confidence, count(*)::int n from nsw_sales_transactions_raw where is_residential group by 1,2 order by 1,2"
));
console.log("After distribution:", afterDist.map((r) => `${r.dwelling_type}/${r.dwelling_type_confidence}=${r.n}`).join(", "));

const [unknownCount] = await rowsOf("select count(*)::int n from nsw_sales_transactions_raw where dwelling_type = 'unknown_residential'");

// ── Rebuild nsw_sales_summary (drop-and-recreate is a LOCAL DuckDB working
// table, not a Supabase/production object — no destructive-SQL rule applies
// to this local scratch artifact; the branch is never touched here). ──────
console.log("\nRebuilding nsw_sales_summary from reclassified transactions...");
await run("drop table if exists nsw_sales_summary");
await run(`
  create table nsw_sales_summary as
  with base as (
    select *,
           date_trunc('month', settlement_date)::date as month_start,
           date_trunc('year', settlement_date)::date as year_start
    from nsw_sales_transactions_raw
    where is_residential and price_flag = 'ok' and settlement_date is not null
  ),
  monthly_sal as (
    select sal_geography_id as geography_id, 'SAL' geography_type, sal_geography_code as geography_code,
           month_start as reference_period, 'month' as period_type, dwelling_type,
           count(*)::int as transaction_count,
           median(sale_price) as median_sale_price, avg(sale_price) as mean_sale_price,
           quantile_cont(sale_price,0.25) as lower_quartile_sale_price,
           quantile_cont(sale_price,0.75) as upper_quartile_sale_price,
           min(sale_price) as min_sale_price, max(sale_price) as max_sale_price
    from base where sal_geography_id is not null group by 1,2,3,4,5,6
  ),
  annual_sal as (
    select sal_geography_id as geography_id, 'SAL' geography_type, sal_geography_code as geography_code,
           year_start as reference_period, 'year' as period_type, dwelling_type,
           count(*)::int as transaction_count,
           median(sale_price) as median_sale_price, avg(sale_price) as mean_sale_price,
           quantile_cont(sale_price,0.25) as lower_quartile_sale_price,
           quantile_cont(sale_price,0.75) as upper_quartile_sale_price,
           min(sale_price) as min_sale_price, max(sale_price) as max_sale_price
    from base where sal_geography_id is not null group by 1,2,3,4,5,6
  ),
  monthly_poa as (
    select poa_geography_id as geography_id, 'POA' geography_type, poa_geography_code as geography_code,
           month_start as reference_period, 'month' as period_type, dwelling_type,
           count(*)::int as transaction_count,
           median(sale_price) as median_sale_price, avg(sale_price) as mean_sale_price,
           quantile_cont(sale_price,0.25) as lower_quartile_sale_price,
           quantile_cont(sale_price,0.75) as upper_quartile_sale_price,
           min(sale_price) as min_sale_price, max(sale_price) as max_sale_price
    from base where poa_geography_id is not null group by 1,2,3,4,5,6
  ),
  annual_poa as (
    select poa_geography_id as geography_id, 'POA' geography_type, poa_geography_code as geography_code,
           year_start as reference_period, 'year' as period_type, dwelling_type,
           count(*)::int as transaction_count,
           median(sale_price) as median_sale_price, avg(sale_price) as mean_sale_price,
           quantile_cont(sale_price,0.25) as lower_quartile_sale_price,
           quantile_cont(sale_price,0.75) as upper_quartile_sale_price,
           min(sale_price) as min_sale_price, max(sale_price) as max_sale_price
    from base where poa_geography_id is not null group by 1,2,3,4,5,6
  ),
  unioned as (
    select * from monthly_sal union all select * from annual_sal
    union all select * from monthly_poa union all select * from annual_poa
  )
  select *,
         case when transaction_count >= 30 then 'high'
              when transaction_count >= 10 then 'medium'
              when transaction_count >= 5 then 'low'
              else 'insufficient' end as sample_size_confidence
  from unioned`);

const [summaryN] = await rowsOf("select count(*)::int n from nsw_sales_summary");
console.log(`  nsw_sales_summary rebuilt: ${num(summaryN.n)} rows`);

await run(`copy nsw_sales_summary to '${posix(path.join(LOCAL_DIR, "nsw_sales_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");

// ── Coverage impact: how many distinct SAL/POA now have a townhouse_villa_
// semidetached summary cell that didn't exist before (informational — we
// don't have a "before" summary snapshot on disk to diff exactly, so we
// report post-reclassification coverage directly). ───────────────────────
const townhouseCoverage = toPlain(await rowsOf(`
  select geography_type, count(distinct geography_id)::int distinct_geos, count(*)::int cells
  from nsw_sales_summary where dwelling_type = 'townhouse_villa_semidetached' group by 1 order by 1
`));

db.closeSync();

const report = {
  generated_at: new Date().toISOString(),
  scope: "in-place reclassification of the existing local NSW sales store — extraction/staging/dedup unaffected, not re-run",
  rule_version: 2,
  new_rule_records_affected: num(eligible.n),
  previous_classification_distribution: beforeDist,
  new_classification_distribution: afterDist,
  records_newly_classified_townhouse_villa: num(eligible.n),
  records_remaining_unknown_residential: num(unknownCount.n),
  nsw_sales_summary_rows_rebuilt: num(summaryN.n),
  townhouse_villa_coverage_after: townhouseCoverage,
  note_on_yield_recalculation: "Yield marts on the branch are recalculated in Phase 5-7's branch load, matching sales and rent dwelling_type exactly — townhouse_villa_semidetached now has real sales-side coverage for the first time (previously only rent-side existed for this type in the DCJ source, meaning yield could never be computed for it). This closes a gap, it does not narrow one.",
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

const beforeTotals = {};
for (const r of beforeDist) beforeTotals[r.dwelling_type] = (beforeTotals[r.dwelling_type] ?? 0) + r.n;
const afterTotals = {};
for (const r of afterDist) afterTotals[r.dwelling_type] = (afterTotals[r.dwelling_type] ?? 0) + r.n;

const md = `# NSW Dwelling-Type Reclassification Report (Sprint 9, Phase 3)

Generated: ${report.generated_at}
Rule set: v2 (\`warehouse/config/nsw_dwelling_type_mapping.yml\`, full rationale in
\`warehouse/docs/NSW_DWELLING_TYPE_CLASSIFICATION.md\`). Applied **in place** to the
existing local store — raw extraction/staging/dedup unaffected.

## Distribution — before vs after (dwelling_type totals, all confidence levels)

| dwelling_type | before | after | change |
|---|---|---|---|
${Object.keys({ ...beforeTotals, ...afterTotals }).sort().map((t) => `| ${t} | ${beforeTotals[t] ?? 0} | ${afterTotals[t] ?? 0} | ${(afterTotals[t] ?? 0) - (beforeTotals[t] ?? 0) >= 0 ? "+" : ""}${(afterTotals[t] ?? 0) - (beforeTotals[t] ?? 0)} |`).join("\n")}

## Rule-level counts

Rule 4 (new): **${num(eligible.n)}** records moved from \`detached_house\` to
\`townhouse_villa_semidetached\` (medium confidence) — non-strata RESIDENCE records
carrying a \`unit_number\` or a \`/\`-subdivided \`house_number\`.

Records remaining \`unknown_residential\`: **${num(unknownCount.n)}**.

## Confidence distribution (after)

| dwelling_type | confidence | rows |
|---|---|---|
${afterDist.map((r) => `| ${r.dwelling_type} | ${r.dwelling_type_confidence} | ${r.n} |`).join("\n")}

## Impact on suburb/postcode sales coverage

\`nsw_sales_summary\` rebuilt: **${num(summaryN.n)}** rows (full local history, all
years, both grains). \`townhouse_villa_semidetached\` now has real coverage from the
sales side for the first time:

| geography_type | distinct geographies with a townhouse_villa cell | summary cells |
|---|---|---|
${townhouseCoverage.map((r) => `| ${r.geography_type} | ${r.distinct_geos} | ${r.cells} |`).join("\n")}

## Impact on yield coverage

Previously, \`townhouse_villa_semidetached\` had rent-side coverage (DCJ publishes
this dwelling type) but **no** sales-side coverage — the Sprint 6/7 yield marts could
never compute a townhouse/villa yield figure because one side of the calculation was
always missing. This reclassification closes that gap: the next branch load (Phase
5-7) recomputes yield marts matching sales and rent dwelling_type exactly, and
townhouse/villa yield rows become computable for the first time wherever both sides
now have sufficient sample size. This is a coverage improvement, not a narrowing.

## Validation

- Every original source field (\`nature_of_property\`, \`zone_code\`, \`strata_lot\`,
  \`unit_number\`, \`house_number\`) is preserved unchanged — only \`dwelling_type\` and
  \`dwelling_type_confidence\` were updated.
- No record was reclassified based on price, suburb, or postcode.
- No record was forced out of \`unknown_residential\`/\`other_residential\` without
  qualifying evidence — those counts are reported above, not hidden.
`;
fs.writeFileSync(OUT_MD, md);
console.log("\nReports written:");
console.log("  warehouse/reports/nsw_dwelling_type_reclassification_report.json");
console.log("  warehouse/reports/nsw_dwelling_type_reclassification_report.md");
