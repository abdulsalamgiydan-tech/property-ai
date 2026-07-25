#!/usr/bin/env node
/**
 * ABS Total Value of Dwellings — branch load (Sprint 12, Workstream 2).
 *
 * Loads TAS/NT/ACT GCCSA-grain median price + transfer count into
 * core.fact_residential_sales_summary (the same shared fact table
 * NSW/VIC/QLD's SAL/POA-grain sales use, at a coarser geography level —
 * GCCSA, not SAL/POA, since no jurisdiction has a suburb-grain free
 * sales source). Additive only: ON CONFLICT DO NOTHING, no destructive
 * statements, never touches existing NSW/VIC rows.
 *
 * --dry-run (default): describes what would be inserted, no DB connection.
 * --execute: connects (validation branch only, production hard-refused)
 *   and performs the upsert inside a transaction.
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

const LOCAL_STORE_PATH = rel("warehouse", "data", "local", "abs_tvd_tas_act_nt.json");
if (!fs.existsSync(LOCAL_STORE_PATH)) fail(`local store not found at ${LOCAL_STORE_PATH} — run build_abs_tvd_local_store.mjs first`);
const store = JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, "utf8"));

const isExecute = process.argv.includes("--execute");

console.log(`ABS Total Value of Dwellings branch load — ${store.points.length} points loaded from local store (generated ${store.generated_at})`);
console.log(`Reference period: ${store.source.reference_period}`);
console.log(`Geographies: ${Object.keys(store.summary_by_geography).join(", ")}`);

if (!isExecute) {
  console.log("\nDRY RUN — no database connection made. Sample of what would be inserted:");
  console.table(store.points.slice(0, 5));
  console.log(`\n...and ${store.points.length - 5} more rows across ${Object.keys(store.summary_by_geography).length} geographies x 2 dwelling types.`);
  console.log("Run with --execute to actually load to the validation branch.");
  process.exit(0);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF} (hard stop)`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference the validation branch ${BRANCH_REF} (hard stop)`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const SOURCE_ID = "abs_total_value_dwellings";
const DATASET_ID = "abs_tvd_tas_act_nt_gccsa";

try {
  await client.query("begin");

  await client.query(
    `insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent, source_url, licence, access_method, update_frequency, implementation_status, known_limitations)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (source_id) do update set implementation_status='live', updated_at=now()`,
    [
      SOURCE_ID,
      "ABS Total Value of Dwellings (Table 2: Median Price and Number of Transfers)",
      "Australian Bureau of Statistics",
      "sales",
      "official",
      "https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings",
      "CC BY 4.0",
      "file_download",
      "quarterly",
      "live",
      "GCCSA grain only (capital city / rest of state) — no SAL/POA detail. Successor to the discontinued 'Residential Property Price Indexes: Eight Capital Cities' (cat. 6432.0, ceased Dec 2021 issue). Used here specifically as the official-aggregate fallback for TAS/NT/ACT, which have no free bulk transaction-level source.",
    ]
  );

  await client.query(
    `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (dataset_id) do nothing`,
    [
      DATASET_ID,
      SOURCE_ID,
      "ABS TVD — TAS/NT/ACT median sale price and transfer count, GCCSA grain",
      "GCCSA",
      "2002-03-01",
      store.source.reference_period,
      "xlsx",
      "quarterly",
      "Sprint 12 Workstream 2 — fills the TAS/NT/ACT sales gap identified in national_coverage_audit.md, at GCCSA (not SAL/POA) grain since no suburb-level free source exists for these 3 jurisdictions.",
    ]
  );

  let inserted = 0;
  for (const p of store.points) {
    const res = await client.query(
      `insert into core.fact_residential_sales_summary
        (geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
         transaction_count, median_sale_price, sample_size_confidence, source_id, dataset_id, data_quality_status, confidence_label)
       values ($1,'GCCSA',$2,$3,'quarter',$4,$5,$6,$7,$8,$9,'passed',$7)
       on conflict (geography_id, reference_period, period_type, dwelling_type) do nothing`,
      [p.geography_id, p.geography_code, p.reference_period, p.dwelling_type, p.transfer_count, p.median_price, p.sample_size_confidence, SOURCE_ID, DATASET_ID]
    );
    inserted += res.rowCount;
  }

  await client.query("commit");
  console.log(`\nCommitted. ${inserted} of ${store.points.length} rows newly inserted (rest already present, ON CONFLICT DO NOTHING).`);

  const report = {
    generated_at: new Date().toISOString(),
    source_id: SOURCE_ID,
    dataset_id: DATASET_ID,
    branch_ref: BRANCH_REF,
    points_attempted: store.points.length,
    rows_newly_inserted: inserted,
  };
  fs.writeFileSync(rel("warehouse", "reports", "abs_tvd_branch_load_report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("Wrote warehouse/reports/abs_tvd_branch_load_report.json");
} catch (err) {
  await client.query("rollback");
  console.error("Transaction rolled back:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
