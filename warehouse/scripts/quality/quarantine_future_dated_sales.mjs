#!/usr/bin/env node
/**
 * Sprint 12, Workstream 9 — fix for the future_dated_sales rule's finding.
 *
 * WS1 first found 2 rows in core.fact_residential_sales_summary with
 * reference_period=2032-01-01 (nsw_psi_2001_current_full_state, Lindfield
 * NSW — SAL_12348_ASGS3_2021 / POA_2070_ASGS3_2021) and deferred fixing it
 * to WS9. The future_dated_sales quality rule (rule_engine.mjs) now
 * catches this automatically on every run. Investigating further: this is
 * a single erroneous 1-transaction record (already correctly labelled
 * sample_size_confidence='insufficient' at the fact-table level) that was
 * ACTIVELY CORRUPTING both wide snapshot rows for Lindfield — the
 * snapshot's "latest year with data" logic picked 2032 over the real,
 * robust 2026 data (64 apartment + 5 detached-house transactions) purely
 * because 2032 > 2026 numerically.
 *
 * Per this project's "quarantine, don't discard" rule: the 2 raw fact rows
 * are marked data_quality_status='quarantined' (never deleted), and the 2
 * corrupted snapshot rows are recomputed using the same "latest calendar
 * year with data" logic as load_market_intelligence_to_branch.mjs's
 * buildSnapshot, scoped only to these 2 known-affected geographies and
 * excluding quarantined fact rows.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default.
 *
 * Usage:
 *   node quarantine_future_dated_sales.mjs             # dry run
 *   node quarantine_future_dated_sales.mjs --execute
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

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

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`quarantine_future_dated_sales — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const badRows = await q(
  "select sales_summary_id, geography_id, geography_type, reference_period, median_sale_price, transaction_count, dataset_id from core.fact_residential_sales_summary where reference_period > current_date"
);
console.log(`\n  found ${badRows.length} future-dated row(s):`);
for (const r of badRows) console.log(`    ${r.geography_id} (${r.geography_type}) reference_period=${r.reference_period} price=${r.median_sale_price} n=${r.transaction_count} dataset=${r.dataset_id}`);

const affectedGeographyIds = [...new Set(badRows.map((r) => r.geography_id))];

if (!EXECUTE) {
  console.log(`\nDry run: would quarantine ${badRows.length} fact row(s) and recompute the wide snapshot for ${affectedGeographyIds.length} affected geography/geographies.`);
  await client.end();
  process.exit(0);
}

if (badRows.length === 0) {
  console.log("\nNothing to quarantine — already clean.");
  await client.end();
  process.exit(0);
}

const report = { generated_at: new Date().toISOString(), branch_ref: BRANCH_REF, production_touched: false };

try {
  await client.query("begin");

  const { rowCount: quarantined } = await client.query(
    "update core.fact_residential_sales_summary set data_quality_status = 'quarantined' where reference_period > current_date"
  );
  console.log(`\n  core.fact_residential_sales_summary: ${quarantined} row(s) marked quarantined (not deleted)`);
  report.fact_rows_quarantined = quarantined;

  await client.query(
    `insert into meta.data_quarantine_summary (rule_id, target_schema, target_table, reason, quarantined_count, sample_row_ids)
     values ('future_dated_sales', 'core', 'fact_residential_sales_summary', 'reference_period in the future — impossible observation date, corrupts "latest year with data" mart logic', $1, $2)`,
    [quarantined, JSON.stringify(badRows.map((r) => ({ sales_summary_id: r.sales_summary_id, geography_id: r.geography_id, reference_period: r.reference_period })))]
  );

  // Recompute the affected snapshot rows using the SAME "latest calendar
  // year with data" logic as load_market_intelligence_to_branch.mjs's
  // buildSnapshot, now correctly excluding the quarantined row.
  for (const geographyId of affectedGeographyIds) {
    for (const [martTable] of [["suburb_market_snapshot"], ["postcode_market_snapshot"]]) {
      const geoType = martTable === "suburb_market_snapshot" ? "SAL" : "POA";
      const salesTable = geoType === "SAL" ? "mart.suburb_sales_annual" : "mart.postcode_sales_annual";
      const { rows: check } = await client.query(`select 1 from mart.${martTable} where geography_id = $1 and dwelling_type is null`, [geographyId]);
      if (check.length === 0) continue; // this geography isn't of this grain (e.g. a SAL id checked against postcode_market_snapshot)

      const { rows: latestYearRows } = await client.query(
        `select max(reference_year) as ry from ${salesTable} s
         join core.fact_residential_sales_summary f on f.geography_id = s.geography_id and f.reference_period = s.reference_year and f.dwelling_type = s.dwelling_type and f.period_type = 'year'
         where s.geography_id = $1 and s.dwelling_type in ('detached_house','apartment_unit','townhouse_villa_semidetached')
           and f.data_quality_status != 'quarantined'`,
        [geographyId]
      );
      const latestYear = latestYearRows[0]?.ry;
      if (!latestYear) {
        console.log(`  ${geographyId} (${martTable}): no valid non-quarantined sales year remains — clearing snapshot sales fields to NULL`);
        await client.query(
          `update mart.${martTable} set sales_volume_12m = null, median_sale_price_12m = null, median_sale_price_detached = null,
             median_sale_price_apartment = null, median_sale_price_townhouse = null, sales_sample_confidence = null, latest_sales_period = null, updated_at = now()
           where geography_id = $1 and dwelling_type is null`,
          [geographyId]
        );
        continue;
      }
      const { rows: recomputed } = await client.query(
        `select sum(s.transaction_count) as vol_12m,
           max(s.median_sale_price) filter (where s.dwelling_type='detached_house') as med_detached,
           max(s.median_sale_price) filter (where s.dwelling_type='apartment_unit') as med_apartment,
           max(s.median_sale_price) filter (where s.dwelling_type='townhouse_villa_semidetached') as med_townhouse,
           max(s.sample_size_confidence) as sample_conf
         from ${salesTable} s where s.geography_id = $1 and s.reference_year = $2`,
        [geographyId, latestYear]
      );
      const r = recomputed[0];
      const anyMedian = r.med_detached ?? r.med_apartment ?? r.med_townhouse;
      await client.query(
        `update mart.${martTable} set
           sales_volume_12m = $2, median_sale_price_12m = $3, median_sale_price_detached = $4,
           median_sale_price_apartment = $5, median_sale_price_townhouse = $6, sales_sample_confidence = $7,
           latest_sales_period = $8, updated_at = now()
         where geography_id = $1 and dwelling_type is null`,
        [geographyId, r.vol_12m, anyMedian, r.med_detached, r.med_apartment, r.med_townhouse, r.sample_conf, latestYear]
      );
      console.log(`  ${geographyId} (${martTable}): recomputed using ${latestYear} (was corrupted by the quarantined 2032 row) — median_sale_price_12m now ${anyMedian}, sales_volume_12m now ${r.vol_12m}`);
    }
  }

  // Resolve the incident this exact bug will otherwise keep re-opening.
  await client.query(
    `update meta.data_incident set status = 'resolved', resolved_at = now(),
       resolution_notes = 'Sprint 12 WS9: 2 future-dated fact rows quarantined (not deleted); 2 corrupted wide-snapshot rows (Lindfield SAL/POA) recomputed from the real 2026 sales data.'
     where rule_id = 'future_dated_sales' and status = 'open'`
  );

  await client.query("commit");
  console.log("\nCOMMITTED (branch only; production untouched).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`aborted, transaction rolled back: ${String(err.message).slice(0, 500)}`);
}

await client.end();
fs.writeFileSync(rel("warehouse", "reports", "future_dated_sales_quarantine_report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/future_dated_sales_quarantine_report.json");
