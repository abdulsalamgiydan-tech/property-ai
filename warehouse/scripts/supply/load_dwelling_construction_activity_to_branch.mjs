#!/usr/bin/env node
/**
 * ABS Building Activity — dwelling commencements/completions branch load
 * (Sprint 12, Workstream 3).
 *
 * Loads core.fact_dwelling_construction_activity (migration 029) from the
 * local store. Dry-run default, production hard-refused, one transaction,
 * blocking gates, idempotent (ON CONFLICT DO NOTHING on the natural key).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const SOURCE_ID = "abs_building_activity";
const DATASET_ID = "abs_dwelling_construction_activity_state";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const LOCAL_STORE_PATH = rel("warehouse", "data", "local", "dwelling_construction_activity.json");
if (!fs.existsSync(LOCAL_STORE_PATH)) fail(`local store not found — run build_dwelling_construction_activity_local_store.mjs first`);
const store = JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, "utf8"));

const EXECUTE = process.argv.includes("--execute");
console.log(`load_dwelling_construction_activity_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN"} — ${store.points.length} points from local store`);

if (!EXECUTE) {
  console.log("Sample:", store.points.slice(0, 3));
  console.log("\nDry run complete. No writes made. Re-run with --execute to load.");
  process.exit(0);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF}`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference the validation branch ${BRANCH_REF}`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const sizeBeforeRes = await client.query("select pg_database_size(current_database())::bigint as bytes");
const sizeBeforeMb = Number(sizeBeforeRes.rows[0].bytes) / 1024 / 1024;
console.log(`  branch DB size before: ${sizeBeforeMb.toFixed(1)} MB`);
if (sizeBeforeMb / 4500 >= 0.9) fail(`branch capacity at ${((sizeBeforeMb / 4500) * 100).toFixed(1)}% of 4500 MB ceiling — refusing further writes`);

try {
  await client.query("BEGIN");

  await client.query(
    `insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent, source_url, licence, access_method, update_frequency, implementation_status, known_limitations)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (source_id) do update set implementation_status='live', updated_at=now()`,
    [
      SOURCE_ID,
      "ABS Building Activity, Australia (Tables 36 & 39: dwelling unit commencements/completions, states and territories)",
      "Australian Bureau of Statistics",
      "supply",
      "official",
      "https://www.abs.gov.au/statistics/industry/building-and-construction/building-activity-australia",
      "CC BY 4.0",
      "file_download",
      "quarterly",
      "live",
      "STATE grain only -- no free SAL/POA breakdown exists for commencements/completions (select series exist at GCCSA in this ABS publication, but not the specific tables used here). Original (not seasonally adjusted) series. Total Sectors (private+public combined), new dwellings only (excludes alterations).",
    ]
  );
  await client.query(
    `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (dataset_id) do nothing`,
    [
      DATASET_ID,
      SOURCE_ID,
      "Dwelling commencements and completions, state/territory grain",
      "STATE",
      store.points.reduce((min, p) => (p.reference_period < min ? p.reference_period : min), store.points[0].reference_period),
      store.source.reference_period,
      "xlsx",
      "quarterly",
      "Sprint 12 WS3 -- fills 2 of the top-priority national supply gaps from the Sprint 12 checkpoint.",
    ]
  );

  let inserted = 0;
  for (const p of store.points) {
    const geographyId = `STATE_${p.state_code}_ASGS3_2021`;
    const res = await client.query(
      `insert into core.fact_dwelling_construction_activity
        (geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type, stage, sector, unit_count, source_id, dataset_id, data_quality_status, confidence_label)
       values ($1,'STATE',$2,$3,'quarter',$4,$5,'total_sectors',$6,$7,$8,'passed','high')
       on conflict (geography_id, reference_period, period_type, dwelling_type, stage, sector) do nothing`,
      [geographyId, p.state_code, p.reference_period, p.dwelling_type, p.stage, p.unit_count, SOURCE_ID, DATASET_ID]
    );
    inserted += res.rowCount;
  }
  console.log(`  core.fact_dwelling_construction_activity: ${inserted} of ${store.points.length} rows newly inserted`);

  const gates = await client.query(`
    select
      (select count(*)::int from core.fact_dwelling_construction_activity where unit_count < 0) as negative_counts,
      (select count(*)::int from (select geography_id, reference_period, period_type, dwelling_type, stage, sector, count(*) from core.fact_dwelling_construction_activity group by 1,2,3,4,5,6 having count(*) > 1) d) as duplicate_keys,
      (select count(*)::int from core.fact_dwelling_construction_activity f where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_geography
  `);
  const g = gates.rows[0];
  console.log(`  gates: ${JSON.stringify(g)}`);
  if (g.negative_counts > 0 || g.duplicate_keys > 0 || g.orphan_geography > 0) {
    throw new Error(`validation gate failed: ${JSON.stringify(g)}`);
  }

  await client.query("COMMIT");
  console.log("\nCOMMITTED (branch only; production untouched).");

  const sizeAfterRes = await client.query("select pg_database_size(current_database())::bigint as bytes");
  const sizeAfterMb = Number(sizeAfterRes.rows[0].bytes) / 1024 / 1024;
  const report = {
    generated_at: new Date().toISOString(),
    branch_ref: BRANCH_REF,
    production_touched: false,
    rows_attempted: store.points.length,
    rows_newly_inserted: inserted,
    validation_gates: g,
    db_size_before_mb: Number(sizeBeforeMb.toFixed(1)),
    db_size_after_mb: Number(sizeAfterMb.toFixed(1)),
  };
  fs.writeFileSync(rel("warehouse", "reports", "dwelling_construction_activity_branch_load_report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Branch size: ${sizeBeforeMb.toFixed(1)} MB -> ${sizeAfterMb.toFixed(1)} MB`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("ROLLED BACK due to error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
