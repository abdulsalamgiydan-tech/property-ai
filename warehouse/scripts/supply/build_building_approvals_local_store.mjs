#!/usr/bin/env node
/**
 * ABS Building Approvals local store builder (Sprint 4, Part C).
 *
 * Pulls the full July 2021 – latest SA2 series from the official ABS Data
 * API using the explicit dimension key confirmed by discovery, saves the raw
 * SDMX-CSV response (gitignored, SHA-256 recorded), and builds the local
 * DuckDB/Parquet store.
 *
 * Explicit key (never a wildcard bulk export):
 *   MEASURE.SECTOR.WORK_TYPE.BUILDING_TYPE.REGION_TYPE.REGION.FREQ
 *   = 1.9.1.110+150+100.SA2..M   (dwelling units, total sectors, new work,
 *     houses / other residential / total residential, all SA2s, monthly)
 *
 * No Supabase connection, no secrets. ABS rate-limits aggressively; the pull
 * retries with cooldowns like the other warehouse downloaders.
 * Missing data stays NULL — ABS omits zero-approval SA2-months rather than
 * publishing explicit zeros; nothing here fills those gaps with 0.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const MANIFEST = rel("warehouse", "reports", "building_approvals_source_manifest.json");
const INVENTORY_OUT = rel("warehouse", "reports", "building_approvals_download_inventory.json");
const RAW_PATH = rel("warehouse", "data", "raw", "building_approvals", "ba_sa2_monthly.csv");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "building_approvals.duckdb");

const API_BASE = "https://data.api.abs.gov.au/rest";
const FILTER_KEY = "1.9.1.110+150+100.SA2..M";
const START_PERIOD = "2021-07";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) fail("manifest missing — run discover_building_approvals_sources.mjs first");
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const entry = manifest.entries.find((e) => e.dataset_id === "building_approvals_sa2_2021");
if (!entry || entry.status !== "discovered") fail("manifest entry not discovered — resolve before pulling data");
if (entry.filter_key !== FILTER_KEY) fail("filter key mismatch vs manifest — refusing to guess a different key");

console.log("build_building_approvals_local_store — local-first (no Supabase, no secrets)");

// ── 1. Pull via the official ABS Data API (explicit key, retried) ────────

fs.mkdirSync(path.dirname(RAW_PATH), { recursive: true });
const url = `${API_BASE}/data/ABS,BA_SA2,2.0.0/${FILTER_KEY}?startPeriod=${START_PERIOD}&format=csv`;
console.log(`\nPulling: dataflow BA_SA2 v2.0.0, key ${FILTER_KEY}, from ${START_PERIOD}`);

let downloaded = false;
for (let attempt = 1; attempt <= 10 && !downloaded; attempt++) {
  try {
    process.stdout.write(`  attempt ${attempt} ... `);
    const res = await fetch(url, {
      headers: { Accept: "text/csv", "user-agent": "propellect-warehouse/1.0" },
      signal: AbortSignal.timeout(300000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.startsWith("DATAFLOW,")) throw new Error("unexpected response body (not CSV)");
    fs.writeFileSync(`${RAW_PATH}.part`, text);
    fs.renameSync(`${RAW_PATH}.part`, RAW_PATH);
    downloaded = true;
    console.log(`ok (${(text.length / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    console.log(`failed (${err.message}); cooling down 60s`);
    await new Promise((r) => setTimeout(r, 60000));
  }
}
if (!downloaded) fail("ABS Data API pull failed after retries");

const bytes = fs.statSync(RAW_PATH).size;
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(RAW_PATH)).digest("hex");
const inventory = {
  generated_at: new Date().toISOString(),
  dataset_id: entry.dataset_id,
  source_url: url,
  api_key_used: FILTER_KEY,
  raw_storage_path: "warehouse/data/raw/building_approvals/ba_sa2_monthly.csv",
  size_bytes: bytes,
  sha256,
  retrieved_at: new Date().toISOString(),
};
fs.writeFileSync(INVENTORY_OUT, JSON.stringify(inventory, null, 2) + "\n");
console.log(`Raw response saved: ${(bytes / 1024 / 1024).toFixed(1)} MB, sha256 recorded in the inventory.`);

// ── 2. DuckDB build ───────────────────────────────────────────────────────

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) {
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(DB_PATH + ".wal", { force: true });
}
const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
const run = (sql) => db.run(sql);
const one = async (sql) => (await db.runAndReadAll(sql)).getRows()[0];

await run(`
  create table building_approvals_sa2 (
    geography_type     varchar not null default 'SA2',
    geography_code     varchar not null,
    reference_period   date not null,          -- first day of the month
    dwelling_type      varchar not null,       -- houses | other_residential | total_dwellings
    approval_count     integer,                -- NULL when unpublished/zero-approval-month (ABS omits the row)
    measure_name       varchar not null,
    dataset_id         varchar,
    source_sha256      varchar,
    is_quarantined     boolean not null default false,
    quarantine_reason  varchar
  )`);

await run(`
  insert into building_approvals_sa2
  select 'SA2', "REGION",
         strptime("TIME_PERIOD", '%Y-%m')::date,
         case "BUILDING_TYPE"
           when '110' then 'houses' when '150' then 'other_residential' when '100' then 'total_dwellings'
         end,
         try_cast("OBS_VALUE" as integer),
         case "MEASURE" when '1' then 'dwelling_units_approved' end,
         '${entry.dataset_id}', '${sha256}',
         ("REGION" is null or try_cast("OBS_VALUE" as integer) < 0),
         case when "REGION" is null then 'null_geography_code'
              when try_cast("OBS_VALUE" as integer) < 0 then 'negative_count' end
  from read_csv('${posix(RAW_PATH)}', header=true, all_varchar=true)
  where "REGION_TYPE" = 'SA2' and "MEASURE" = '1' and "SECTOR" = '9' and "WORK_TYPE" = '1'
    and "BUILDING_TYPE" in ('110','150','100')`);

const [total, quarantined] = await one("select count(*), count(*) filter (is_quarantined) from building_approvals_sa2");
const [periods] = await one("select count(distinct reference_period) from building_approvals_sa2");
const [minP, maxP] = await one("select min(reference_period), max(reference_period) from building_approvals_sa2");
console.log(`\nDuckDB build: ${total} monthly cells (${quarantined} quarantined), ${periods} periods (${minP} .. ${maxP})`);

// ── 3. Parquet export ──────────────────────────────────────────────────────

await run(`copy building_approvals_sa2 to '${posix(path.join(LOCAL_DIR, "building_approvals.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
console.log("\nLocal Building Approvals store built (all gitignored):");
console.log(`  warehouse/data/local/building_approvals.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/building_approvals.parquet  ${mb1(path.join(LOCAL_DIR, "building_approvals.parquet"))} MB`);
console.log("Download inventory (hash) written: warehouse/reports/building_approvals_download_inventory.json");
console.log("No Supabase connection was made. Validate with validate_building_approvals_local_store.mjs.");
