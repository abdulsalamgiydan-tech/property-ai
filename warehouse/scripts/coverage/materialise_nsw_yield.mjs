#!/usr/bin/env node
/**
 * Phase 3A — materialise recoverable NSW suburb gross yields into an EPHEMERAL
 * LOCAL warehouse (DuckDB) through raw → staging → core → mart, with SQL-
 * generated before/after coverage evidence and a full disposition ledger for
 * every one of the naive candidates.
 *
 * Real observations only (Propellect's own suburb snapshot, read-only). Quality
 * gates are NOT lowered to inflate coverage: a candidate is materialised only
 * when both inputs are suburb-level DIRECT, positive, period-compatible, and
 * both meet the medium+ sample tier (≥ registry minSample). Everything else is
 * quarantined with a reason. The final materialised count is whatever the rules
 * yield — never forced to 126.
 *
 * Writes ONLY to warehouse/data/local (gitignored) and warehouse/reports. No
 * remote/Production/Supabase write path. Deterministic: same frozen warehouse →
 * same checksum → same mart rows.
 *
 * Usage: node warehouse/scripts/coverage/materialise_nsw_yield.mjs [--apply-local]
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DuckDBInstance } from "@duckdb/node-api";

const APPLY = process.argv.includes("--apply-local");
const DATA_DIR = "warehouse/data/local";
const REPORT_DIR = "warehouse/reports/coverage_v2";
const RAW_JSON = path.join(DATA_DIR, "nsw_yield_candidates.json");
const MANIFEST = path.join(DATA_DIR, "nsw_yield_candidates.manifest.json");
const DB_PATH = path.join(DATA_DIR, "coverage_v2.duckdb");

// Compatibility rules (documented; see warehouse/config/metric_definitions.mjs).
const MAX_PERIOD_GAP_DAYS = 400; // annual rent vs 12m sales window
const ACCEPTED_SAMPLE_TIERS = ["medium", "high"]; // ≥ minSample 10; excludes low(<10) & insufficient(<5)
const TIER_LIST = ACCEPTED_SAMPLE_TIERS.map((t) => `'${t}'`).join(","); // single source of truth for the SQL IN-list

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(".env.local")) {
    for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      if (!l.includes("=")) continue;
      const i = l.indexOf("=");
      const k = l.slice(0, i).trim();
      if (!(k in env)) env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

async function fetchCandidates(env) {
  const base = env.WAREHOUSE_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
  const H = { apikey: env.WAREHOUSE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.WAREHOUSE_SUPABASE_ANON_KEY}` };
  const cols = "geography_id,geography_code,geography_name,state_code,median_sale_price_12m,median_weekly_rent_latest,latest_sales_period,latest_rent_period,sales_sample_confidence,rent_confidence,direct_or_derived,snapshot_generated_at";
  const endpoint = `${base}/v_suburb_market_snapshot_v1?median_sale_price_12m=not.is.null&median_weekly_rent_latest=not.is.null&gross_yield_pct=is.null&state_code=eq.1&select=${cols}&order=geography_id`;
  const rows = await (await fetch(endpoint, { headers: H })).json();
  return { rows, endpoint };
}

async function main() {
  const env = loadEnv();
  if (!env.WAREHOUSE_SUPABASE_URL || !env.WAREHOUSE_SUPABASE_ANON_KEY) {
    console.error("FAIL CLOSED: warehouse read-only creds not configured.");
    process.exit(1);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const { rows, endpoint } = await fetchCandidates(env);
  // Immutable raw + checksum (content-addressed).
  const canonical = JSON.stringify(rows);
  const checksum = crypto.createHash("sha256").update(canonical).digest("hex");
  fs.writeFileSync(RAW_JSON, JSON.stringify(rows, null, 2));
  const manifest = {
    source: "propellect_warehouse:v_suburb_market_snapshot_v1",
    endpoint,
    retrieved_at: new Date().toISOString(),
    row_count: rows.length,
    sha256: checksum,
    note: "Read-only pull of NSW suburb-level yield candidates (price+rent present, yield null).",
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

  // Ephemeral DuckDB warehouse (raw → staging → core → mart).
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
  const db = await DuckDBInstance.create(DB_PATH);
  const con = await db.connect();
  const run = (sql) => con.run(sql);
  const all = async (sql) => (await con.runAndReadAll(sql)).getRowObjects();

  for (const s of ["raw", "staging", "core", "mart"]) await run(`CREATE SCHEMA ${s};`);

  await run(`CREATE TABLE raw.yield_candidate AS SELECT * FROM read_json_auto('${RAW_JSON.replace(/\\/g, "/")}');`);
  await run(`ALTER TABLE raw.yield_candidate ADD COLUMN source_checksum VARCHAR;`);
  await run(`UPDATE raw.yield_candidate SET source_checksum='${checksum}';`);

  // Staging: validate + assign a single disposition per candidate.
  await run(`
    CREATE TABLE staging.yield_candidate AS
    SELECT *,
      CASE
        WHEN median_sale_price_12m IS NULL OR median_sale_price_12m <= 0
          OR median_weekly_rent_latest IS NULL OR median_weekly_rent_latest <= 0 THEN 'invalid_value'
        WHEN direct_or_derived <> 'direct' THEN 'context_only'
        WHEN abs(date_diff('day', CAST(latest_sales_period AS DATE), CAST(latest_rent_period AS DATE))) > ${MAX_PERIOD_GAP_DAYS} THEN 'incompatible_period'
        WHEN sales_sample_confidence NOT IN (${TIER_LIST}) OR rent_confidence NOT IN (${TIER_LIST}) THEN 'insufficient_sample'
        ELSE 'materialised'
      END AS disposition
    FROM raw.yield_candidate;
  `);

  // Core: one observation row per accepted input (both price and rent get IDs).
  await run(`
    CREATE TABLE core.market_observation AS
    SELECT 'obs_'||geography_id||'_price' AS observation_id, geography_id, 'suburb' AS geography_level,
           'median_sale_price' AS metric, 'all' AS property_type, median_sale_price_12m AS value,
           CAST(latest_sales_period AS DATE) AS period, sales_sample_confidence AS confidence,
           'v_suburb_market_snapshot_v1.median_sale_price_12m' AS source_field, 'direct' AS status
    FROM staging.yield_candidate WHERE disposition='materialised'
    UNION ALL
    SELECT 'obs_'||geography_id||'_rent', geography_id, 'suburb',
           'median_weekly_rent', 'all', median_weekly_rent_latest,
           CAST(latest_rent_period AS DATE), rent_confidence,
           'v_suburb_market_snapshot_v1.median_weekly_rent_latest', 'direct'
    FROM staging.yield_candidate WHERE disposition='materialised';
  `);

  // Mart: derived gross yield with BOTH input observation IDs + formula version.
  await run(`
    CREATE TABLE mart.suburb_yield_recovered AS
    SELECT geography_id, geography_code, geography_name,
           round(median_weekly_rent_latest*52/median_sale_price_12m*100, 2) AS gross_yield_pct,
           'all' AS property_type, 'suburb' AS geography_level,
           'obs_'||geography_id||'_price' AS price_observation_id,
           'obs_'||geography_id||'_rent'  AS rent_observation_id,
           CAST(latest_sales_period AS DATE) AS sales_period,
           CAST(latest_rent_period AS DATE) AS rent_period,
           'gross_yield@1' AS formula_version, 'direct' AS status
    FROM staging.yield_candidate WHERE disposition='materialised';
  `);

  // ── SQL-generated evidence ──
  const dispo = await all(`SELECT disposition, count(*) AS n FROM staging.yield_candidate GROUP BY 1 ORDER BY n DESC;`);
  const [{ candidates }] = await all(`SELECT count(*) AS candidates FROM raw.yield_candidate;`);
  const [{ materialised }] = await all(`SELECT count(*) AS materialised FROM mart.suburb_yield_recovered;`);
  const [{ obs_rows }] = await all(`SELECT count(*) AS obs_rows FROM core.market_observation;`);
  const sample = await all(`SELECT geography_code, geography_name, gross_yield_pct, price_observation_id, rent_observation_id, sales_period, rent_period FROM mart.suburb_yield_recovered ORDER BY gross_yield_pct DESC LIMIT 8;`);

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? "apply-local" : "dry-run",
    db_path: DB_PATH,
    source_manifest: manifest,
    naive_candidates: Number(candidates),
    materialised_yields: Number(materialised),
    core_observation_rows: Number(obs_rows),
    disposition_ledger: dispo.map((d) => ({ disposition: d.disposition, count: Number(d.n) })),
    sample_materialised: sample.map((s) => ({ ...s, gross_yield_pct: Number(s.gross_yield_pct) })),
  };

  console.log(`\nPhase 3A — NSW yield materialisation (${report.mode})`);
  console.log(`raw candidates: ${report.naive_candidates}  →  materialised: ${report.materialised_yields}  (core obs rows: ${report.core_observation_rows})`);
  console.log("disposition ledger:");
  for (const d of report.disposition_ledger) console.log(`  ${d.disposition.padEnd(22)} ${d.count}`);
  console.log("sample materialised yields:");
  for (const s of report.sample_materialised) console.log(`  ${s.geography_name} (${s.geography_code}): ${s.gross_yield_pct}%`);

  if (APPLY) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, "nsw_yield_materialisation.json"), JSON.stringify(report, null, 2));
    const csv = ["disposition,count"].concat(report.disposition_ledger.map((d) => `${d.disposition},${d.count}`)).join("\n");
    fs.writeFileSync(path.join(REPORT_DIR, "nsw_yield_disposition.csv"), csv);
    const md = [
      `# Phase 3A — NSW yield materialisation (${report.mode})`, "",
      `Source: \`${manifest.source}\` · sha256 \`${checksum.slice(0, 16)}…\` · retrieved ${manifest.retrieved_at}`, "",
      `**Naive candidates:** ${report.naive_candidates} → **materialised:** ${report.materialised_yields}`, "",
      "| disposition | count |", "|---|--:|",
      ...report.disposition_ledger.map((d) => `| ${d.disposition} | ${d.count} |`),
    ].join("\n");
    fs.writeFileSync(path.join(REPORT_DIR, "nsw_yield_materialisation.md"), md);
    console.log(`\nWrote SQL-generated evidence to ${REPORT_DIR}/ (local artifacts only — no DB/remote write).`);
  } else {
    console.log("\n[dry-run] pass --apply-local to persist the SQL evidence report locally.");
  }

  await con.closeSync?.();
}

main().catch((e) => {
  console.error("materialise_nsw_yield failed:", e.message);
  process.exit(1);
});
