#!/usr/bin/env node
/**
 * ASGS backbone loader — staging phase (Sprint 2, Part C4).
 *
 * Loads the downloaded + inspected ABS ASGS Edition 3 artefacts into
 * staging.asgs_geography and staging.asgs_correspondence with full lineage
 * (meta.source / meta.dataset / meta.load_run / meta.source_file), then
 * records staging-level coverage and quality results.
 *
 * Safety (enforced in code, not convention):
 *   - target database MUST be the warehouse-validation Supabase branch:
 *     the connection string in WAREHOUSE_VALIDATION_DB_URL (.env.local) must
 *     contain the branch ref "lzonauinzatmtytyoems" and must NOT contain the
 *     production ref "oshquaxsloolqucwvigc"; the URL is never printed
 *   - additive SQL only: INSERT / UPDATE / SELECT on staging.* and meta.*;
 *     no DROP, TRUNCATE, DELETE or resets; re-runs create a new load_run and
 *     leave prior rows untouched
 *   - invalid rows are quarantined in place (is_quarantined + reason),
 *     never fixed or dropped; unknown values stay NULL, never zero-filled
 *   - core promotion (core.dim_geography + bridges) is BLOCKED here and
 *     requires explicit approval after staging validation
 *
 * Usage:
 *   node load_asgs_backbone.mjs                 # dry run: plan + preflight only
 *   node load_asgs_backbone.mjs --execute       # run the staging load
 *   node load_asgs_backbone.mjs --execute --only STATE|GCCSA|...|correspondences
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

const BRANCH_REF = "lzonauinzatmtytyoems"; // warehouse-validation branch (the ONLY allowed target)
const PROD_REF = "oshquaxsloolqucwvigc"; // production — never written by this script
const BOUNDARY_VERSION = "ASGS3_2021";
const REFERENCE_PERIOD = "2021";
const SOURCE_ID = "abs_asgs";
const SOURCE_SRID = 7844; // GDA2020 geographic, per .prj inspection

const MANIFEST = rel("warehouse", "reports", "asgs_source_manifest.json");
const INVENTORY = rel("warehouse", "reports", "asgs_download_inventory.json");
const INSPECTION = rel("warehouse", "reports", "asgs_local_file_inspection.json");
const PROCESSED = rel("warehouse", "data", "processed", "asgs", "ASGS3_2021");
const DICTIONARY = rel("warehouse", "metadata", "geography_dictionary.csv");
const REGISTER = rel("warehouse", "metadata", "source_register.csv");

// Load order: smallest levels first so the pipeline is proven before SA1.
const LEVELS = [
  { level: "STATE", dataset: "asgs_state_2021_boundaries", code: "STE_CODE21", name: "STE_NAME21", parent: null },
  { level: "GCCSA", dataset: "asgs_gccsa_2021_boundaries", code: "GCC_CODE21", name: "GCC_NAME21", parent: "STE_CODE21" },
  { level: "SA4", dataset: "asgs_sa4_2021_boundaries", code: "SA4_CODE21", name: "SA4_NAME21", parent: "GCC_CODE21" },
  { level: "SA3", dataset: "asgs_sa3_2021_boundaries", code: "SA3_CODE21", name: "SA3_NAME21", parent: "SA4_CODE21" },
  { level: "LGA", dataset: "asgs_lga_2021_boundaries", code: "LGA_CODE21", name: "LGA_NAME21", parent: null },
  { level: "POA", dataset: "asgs_poa_2021_boundaries", code: "POA_CODE21", name: "POA_NAME21", parent: null },
  { level: "SA2", dataset: "asgs_sa2_2021_boundaries", code: "SA2_CODE21", name: "SA2_NAME21", parent: "SA3_CODE21" },
  { level: "SAL", dataset: "asgs_sal_2021_boundaries", code: "SAL_CODE21", name: "SAL_NAME21", parent: null },
  { level: "SA1", dataset: "asgs_sa1_2021_boundaries", code: "SA1_CODE21", name: null, parent: "SA2_CODE21" },
];

const CORR_TARGETS = [
  { target: "SAL", file: "SAL_2021_AUST.xlsx", codeCol: "SAL_CODE_2021", sa1Dataset: "asgs_corr_sa1_to_sal_2021", sa2Dataset: "asgs_corr_sa2_to_sal_2021" },
  { target: "POA", file: "POA_2021_AUST.xlsx", codeCol: "POA_CODE_2021", sa1Dataset: "asgs_corr_sa1_to_poa_2021", sa2Dataset: "asgs_corr_sa2_to_poa_2021" },
  { target: "LGA", file: "LGA_2021_AUST.xlsx", codeCol: "LGA_CODE_2021", sa1Dataset: "asgs_corr_sa1_to_lga_2021", sa2Dataset: "asgs_corr_sa2_to_lga_2021" },
];

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

// ── Preflight ────────────────────────────────────────────────────────────

const preflightProblems = [];
function requireFile(p, hint) {
  if (!fs.existsSync(p)) preflightProblems.push(`${path.relative(repoRoot, p)} missing — ${hint}`);
}
requireFile(MANIFEST, "run discover_asgs_sources.mjs");
requireFile(INVENTORY, "run download_asgs_sources.mjs");
requireFile(INSPECTION, "run inspect_asgs_local_files.mjs");

let inventory = null;
if (fs.existsSync(INVENTORY)) {
  inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
  for (const f of inventory.files) {
    if (!fs.existsSync(rel(f.raw_storage_path))) {
      preflightProblems.push(`raw file missing on disk: ${f.raw_storage_path}`);
    }
  }
}

// Connection string: read .env.local without ever printing values.
try {
  process.loadEnvFile(rel(".env.local"));
} catch {
  /* .env.local optional; the env var may be set another way */
}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
let dbTargetOk = false;
if (!dbUrl) {
  preflightProblems.push(
    "WAREHOUSE_VALIDATION_DB_URL not set — add the warehouse-validation branch Session-pooler connection string to .env.local"
  );
} else if (dbUrl.includes(PROD_REF)) {
  fail("connection string references the PRODUCTION project — refusing to run (hard stop)");
} else if (!dbUrl.includes(BRANCH_REF)) {
  fail(`connection string does not reference the warehouse-validation branch (${BRANCH_REF}) — refusing to run (hard stop)`);
} else {
  dbTargetOk = true;
}

console.log(`load_asgs_backbone — ${EXECUTE ? "EXECUTE (staging load, branch only)" : "DRY RUN (no changes)"}${ONLY ? `, only=${ONLY}` : ""}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);
console.log("\nPreflight:");
console.log(`  manifest/inventory/inspection: ${preflightProblems.length === 0 ? "all present" : "PROBLEMS"}`);
console.log(`  db target: ${dbTargetOk ? "branch connection string present and verified (not printed)" : "NOT CONFIGURED"}`);
for (const p of preflightProblems) console.log(`  - ${p}`);

console.log("\nBlocked regardless of flags:");
console.log("  - any write to production or the main branch database");
console.log("  - core promotion (core.dim_geography + bridges) — separate approval after staging validation");

if (!EXECUTE) {
  console.log("\nDry run complete — nothing was contacted or changed. Use --execute to run the staging load.");
  process.exit(preflightProblems.length === 0 ? 0 : 1);
}
if (preflightProblems.length > 0) fail("preflight failed — resolve the problems above");

// ── DB helpers ───────────────────────────────────────────────────────────

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

// Guard: the branch schema must already exist (migrations 003-005 applied there).
{
  const { rows } = await client.query(
    "select to_regclass('staging.asgs_geography') as g, to_regclass('staging.asgs_correspondence') as c, to_regclass('meta.load_run') as r"
  );
  if (!rows[0].g || !rows[0].c || !rows[0].r) fail("staging/meta tables missing on target — wrong database or migrations not applied");
}

async function insertBatch(table, cols, rows, geomParamIdx = -1) {
  if (rows.length === 0) return;
  const params = [];
  const tuples = rows.map((row) => {
    const ph = row.map((v, i) => {
      params.push(v);
      const n = `$${params.length}`;
      if (i === geomParamIdx) {
        // GeoJSON coords are GDA2020 lon/lat: override the implied 4326, then transform.
        return `case when ${n}::text is null then null else ST_Transform(ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(${n}::text)), ${SOURCE_SRID}), 4326) end`;
      }
      return n;
    });
    return `(${ph.join(",")})`;
  });
  await client.query(`insert into ${table} (${cols.join(",")}) values ${tuples.join(",")}`, params);
}

async function startRun(datasetId) {
  const { rows } = await client.query(
    "insert into meta.load_run (dataset_id, run_status) values ($1,'running') returning load_run_id",
    [datasetId]
  );
  return rows[0].load_run_id;
}
async function finishRun(loadRunId, status, extracted, loaded, quarantined, errorMessage = null) {
  await client.query(
    "update meta.load_run set run_status=$2, finished_at=now(), records_extracted=$3, records_loaded=$4, records_quarantined=$5, error_message=$6 where load_run_id=$1",
    [loadRunId, status, extracted, loaded, quarantined, errorMessage]
  );
}
async function registerSourceFile(loadRunId, invFile) {
  const { rows } = await client.query(
    `insert into meta.source_file (load_run_id, source_id, source_url, file_name, file_format, file_hash, reference_period)
     values ($1,$2,$3,$4,$5,$6,$7) returning source_file_id`,
    [loadRunId, SOURCE_ID, invFile.source_url, invFile.file_name, path.extname(invFile.file_name).slice(1), invFile.sha256, REFERENCE_PERIOD]
  );
  return rows[0].source_file_id;
}
async function recordQuality(loadRunId, datasetId, ruleId, severity, status, failedCount, details) {
  await client.query(
    `insert into meta.data_quality_result (load_run_id, dataset_id, rule_id, severity, status, failed_record_count, details)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [loadRunId, datasetId, ruleId, severity, status, failedCount, JSON.stringify(details)]
  );
}

// ── meta.source + meta.dataset registration ──────────────────────────────

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const invByDataset = new Map(inventory.files.map((f) => [f.dataset_id, f]));

{
  // abs_asgs row from the committed source register (first 10 columns fixed, rest = limitations).
  const line = fs.readFileSync(REGISTER, "utf8").split(/\r?\n/).find((l) => l.startsWith("abs_asgs,"));
  const parts = line.split(",");
  const [sourceId, name, publisher, category, offInd, url, licence, access, freq, implStatus] = parts;
  const limitations = parts.slice(10).join(",");
  await client.query(
    `insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent,
       source_url, licence, access_method, update_frequency, implementation_status, known_limitations)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (source_id) do update set implementation_status=excluded.implementation_status,
       known_limitations=excluded.known_limitations, updated_at=now()`,
    [sourceId, name, publisher, category, offInd, url, licence, access, freq, implStatus, limitations]
  );
}
{
  const datasetEntries = manifest.entries.filter((e) => e.entry_type !== "documentation");
  for (const e of datasetEntries) {
    await client.query(
      `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
       values ($1,$2,$3,$4,$5,$5,$6,'five_yearly',$7)
       on conflict (dataset_id) do nothing`,
      [e.dataset_id, SOURCE_ID, e.dataset_name, e.geography_level, REFERENCE_PERIOD, e.file_format, e.notes]
    );
  }
  console.log(`\nmeta registered: source abs_asgs + ${datasetEntries.length} datasets`);
}

// ── Boundary staging load ────────────────────────────────────────────────

const GEO_COLS = [
  "load_run_id", "source_id", "dataset_id", "source_file_id",
  "geography_type", "geography_code", "geography_name", "state_code", "state_name",
  "parent_code", "boundary_version", "reference_period", "area_square_km",
  "source_srid", "geom", "raw_attributes", "is_quarantined", "quarantine_reason",
];
const GEOM_IDX = GEO_COLS.indexOf("geom");

const prop = (props, field) => {
  if (!field) return null;
  const v = props[field];
  if (v === undefined || v === null || v === "") return null;
  return String(v).trim();
};

async function loadLevel(cfg) {
  const inv = invByDataset.get(cfg.dataset);
  const dir = path.join(PROCESSED, cfg.level);
  const shp = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".shp"));
  const dbf = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".dbf"));
  if (!shp || !dbf) fail(`${cfg.level}: extracted shapefile not found in ${dir} — run inspect_asgs_local_files.mjs`);

  const loadRunId = await startRun(cfg.dataset);
  const sourceFileId = await registerSourceFile(loadRunId, inv);
  const shapefile = await import("shapefile");

  let extracted = 0;
  let loaded = 0;
  let quarantinedAtInsert = 0;
  let batch = [];
  let batchChars = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    try {
      await insertBatch("staging.asgs_geography", GEO_COLS, batch, GEOM_IDX);
    } catch {
      // A bad geometry poisons the whole batch: retry row-by-row and
      // quarantine only the offenders (geom NULL, reason recorded).
      for (const row of batch) {
        try {
          await insertBatch("staging.asgs_geography", GEO_COLS, [row], GEOM_IDX);
        } catch (rowErr) {
          const q = [...row];
          q[GEOM_IDX] = null;
          q[GEO_COLS.indexOf("is_quarantined")] = true;
          q[GEO_COLS.indexOf("quarantine_reason")] = `geometry_parse_error: ${String(rowErr.message).slice(0, 120)}`;
          quarantinedAtInsert++;
          await insertBatch("staging.asgs_geography", GEO_COLS, [q], GEOM_IDX);
        }
      }
    }
    loaded += batch.length;
    batch = [];
    batchChars = 0;
  };

  const source = await shapefile.open(path.join(dir, shp), path.join(dir, dbf));
  for (let r = await source.read(); !r.done; r = await source.read()) {
    const f = r.value;
    extracted++;
    const props = f.properties ?? {};
    const geojson = f.geometry ? JSON.stringify(f.geometry) : null;
    const noGeom = geojson === null;
    if (noGeom) quarantinedAtInsert++;
    const areaField = Object.keys(props).find((k) => /^AREASQKM/i.test(k));
    batch.push([
      loadRunId, SOURCE_ID, cfg.dataset, sourceFileId,
      cfg.level, prop(props, cfg.code), prop(props, cfg.name),
      prop(props, "STE_CODE21"), prop(props, "STE_NAME21"),
      cfg.parent ? prop(props, cfg.parent) : null,
      BOUNDARY_VERSION, REFERENCE_PERIOD,
      areaField ? props[areaField] : null,
      SOURCE_SRID, geojson, JSON.stringify(props),
      noGeom, noGeom ? "missing_geometry" : null,
    ]);
    batchChars += geojson?.length ?? 0;
    if (batch.length >= 100 || batchChars > 4_000_000) await flush();
  }
  await flush();

  // Quarantine invalid geometries in place — counted, never fixed or dropped.
  const inv1 = await client.query(
    `update staging.asgs_geography set is_quarantined=true, quarantine_reason='invalid_geometry'
     where load_run_id=$1 and not is_quarantined and geom is not null and not ST_IsValid(geom)`,
    [loadRunId]
  );
  const nullCodes = await client.query(
    `update staging.asgs_geography set is_quarantined=true, quarantine_reason='null_geography_code'
     where load_run_id=$1 and not is_quarantined and geography_code is null`,
    [loadRunId]
  );
  const dup = await client.query(
    `select count(*)::int as n from (select geography_code from staging.asgs_geography
      where load_run_id=$1 group by 1 having count(*)>1) d`,
    [loadRunId]
  );
  const quarantined = quarantinedAtInsert + inv1.rowCount + nullCodes.rowCount;

  await recordQuality(loadRunId, cfg.dataset, "geometry_valid", "warning",
    inv1.rowCount + quarantinedAtInsert === 0 ? "passed" : "failed",
    inv1.rowCount + quarantinedAtInsert,
    { level: cfg.level, invalid_geometries: inv1.rowCount, parse_or_missing: quarantinedAtInsert });
  await recordQuality(loadRunId, cfg.dataset, "no_duplicate_grain", "blocker",
    dup.rows[0].n === 0 ? "passed" : "failed", dup.rows[0].n, { level: cfg.level, duplicate_codes: dup.rows[0].n });
  await recordQuality(loadRunId, cfg.dataset, "nulls_not_zero", "blocker",
    nullCodes.rowCount === 0 ? "passed" : "failed", nullCodes.rowCount, { level: cfg.level, null_codes: nullCodes.rowCount });

  await finishRun(loadRunId, "succeeded", extracted, loaded, quarantined);
  console.log(`  ${cfg.level.padEnd(6)} ${String(extracted).padStart(6)} features -> ${loaded} staged, ${quarantined} quarantined`);
  return { level: cfg.level, dataset: cfg.dataset, loadRunId, extracted, loaded, quarantined };
}

// ── Correspondence staging load ──────────────────────────────────────────

async function readXlsx(filePath, wanted) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore", worksheets: "emit",
  });
  const out = [];
  for await (const sheet of wb) {
    let colIdx = null;
    for await (const row of sheet) {
      const vals = row.values;
      if (!colIdx) {
        colIdx = {};
        vals.forEach((v, i) => { if (v != null) colIdx[String(v).trim()] = i; });
        const missing = wanted.filter((w) => !(w in colIdx));
        if (missing.length) fail(`${path.basename(filePath)}: expected columns missing: ${missing.join(", ")}`);
        continue;
      }
      const cell = (name) => {
        let v = vals[colIdx[name]];
        if (v && typeof v === "object" && "result" in v) v = v.result;
        if (v === undefined || v === null || v === "") return null;
        return typeof v === "number" ? v : String(v).trim();
      };
      out.push(wanted.map(cell));
    }
    break; // data lives on the first worksheet
  }
  return out;
}

const CORR_COLS = [
  "load_run_id", "source_id", "dataset_id", "source_file_id",
  "source_geography_type", "source_geography_code", "target_geography_type", "target_geography_code",
  "ratio", "ratio_basis", "correspondence_method", "correspondence_version",
  "boundary_version", "reference_period", "raw_attributes", "is_quarantined", "quarantine_reason",
];

// POA codes can carry leading zeros (e.g. NT 0800): normalise numerics to 4 digits.
const poaCode = (v) => (typeof v === "number" ? String(v).padStart(4, "0") : v);

async function loadCorrespondences() {
  // Shared MB main-structure input (registered under its own dataset/run).
  const mbInv = invByDataset.get("asgs_mb_2021_allocation");
  const mbRun = await startRun("asgs_mb_2021_allocation");
  await registerSourceFile(mbRun, mbInv);
  console.log("  reading MB_2021_AUST.xlsx (MB -> SA1/SA2 + Albers area)...");
  const mbRows = await readXlsx(rel(mbInv.raw_storage_path), ["MB_CODE_2021", "SA1_CODE_2021", "SA2_CODE_2021", "AREA_ALBERS_SQKM"]);
  const mb = new Map();
  let mbMissingKeys = 0;
  for (const [mbCode, sa1, sa2, area] of mbRows) {
    if (mbCode == null || sa1 == null || sa2 == null) { mbMissingKeys++; continue; }
    mb.set(String(mbCode), { sa1: String(sa1), sa2: String(sa2), area: typeof area === "number" ? area : null });
  }
  await finishRun(mbRun, "succeeded", mbRows.length, 0, 0,
    mbMissingKeys ? `${mbMissingKeys} MB rows without SA1/SA2 codes (not allocatable)` : null);
  console.log(`    ${mbRows.length} MB rows (${mbMissingKeys} without SA1/SA2 codes)`);

  const summaries = [];
  for (const t of CORR_TARGETS) {
    const inv = invByDataset.get(t.sa1Dataset);
    console.log(`  ${t.target}: joining ${t.file} on MB_CODE_2021...`);
    const rows = await readXlsx(rel(inv.raw_storage_path), ["MB_CODE_2021", t.codeCol]);

    // Aggregate MB Albers areas up to SA1->target and SA2->target.
    const agg = { SA1: new Map(), SA2: new Map() };
    const tot = { SA1: new Map(), SA2: new Map() };
    let unknownMb = 0;
    let noTarget = 0;
    for (const [mbCode, rawTarget] of rows) {
      if (rawTarget == null) { noTarget++; continue; }
      const rec = mb.get(String(mbCode));
      if (!rec) { unknownMb++; continue; }
      const target = t.target === "POA" ? poaCode(rawTarget) : String(rawTarget);
      const area = rec.area ?? 0;
      for (const [srcType, srcCode] of [["SA1", rec.sa1], ["SA2", rec.sa2]]) {
        const key = `${srcCode}|${target}`;
        const cur = agg[srcType].get(key) ?? { area: 0, mbs: 0 };
        cur.area += area;
        cur.mbs += 1;
        agg[srcType].set(key, cur);
        tot[srcType].set(srcCode, (tot[srcType].get(srcCode) ?? 0) + area);
      }
    }

    for (const [srcType, datasetId, method] of [
      ["SA1", t.sa1Dataset, "abs_sa1_allocation"],
      ["SA2", t.sa2Dataset, "derived_sa1_aggregation"],
    ]) {
      const runId = await startRun(datasetId);
      const sourceFileId = await registerSourceFile(runId, inv);
      let loaded = 0;
      let quarantined = 0;
      let batch = [];
      for (const [key, { area, mbs }] of agg[srcType]) {
        const [srcCode, targetCode] = key.split("|");
        const total = tot[srcType].get(srcCode) ?? 0;
        const ratio = total > 0 ? area / total : null; // zero-area source: NULL, never 0
        const q = ratio === null;
        if (q) quarantined++;
        batch.push([
          runId, SOURCE_ID, datasetId, sourceFileId,
          srcType, srcCode, t.target, targetCode,
          ratio, "area", method, BOUNDARY_VERSION, BOUNDARY_VERSION, REFERENCE_PERIOD,
          JSON.stringify({ mb_count: mbs, sum_area_albers_sqkm: area, source_total_area_sqkm: total, derived_from: "official ABS MB allocation files" }),
          q, q ? "zero_area_source" : null,
        ]);
        if (batch.length >= 500) { await insertBatch("staging.asgs_correspondence", CORR_COLS, batch); loaded += batch.length; batch = []; }
      }
      await insertBatch("staging.asgs_correspondence", CORR_COLS, batch);
      loaded += batch.length;

      // Staging check: weights per source must sum to 1.0 (±0.001).
      const rec = await client.query(
        `select count(*)::int as bad from (
           select source_geography_code from staging.asgs_correspondence
           where load_run_id=$1 and not is_quarantined
           group by 1 having abs(sum(ratio) - 1.0) > 0.001) x`,
        [runId]
      );
      const srcCount = await client.query(
        `select count(distinct source_geography_code)::int as n from staging.asgs_correspondence where load_run_id=$1`,
        [runId]
      );
      const bad = rec.rows[0]?.bad ?? 0;
      await recordQuality(runId, datasetId, "weights_reconcile", "blocker",
        bad === 0 ? "passed" : "failed", bad,
        { pair: `${srcType}->${t.target}`, sources_total: srcCount.rows[0].n, sources_not_reconciling: bad, tolerance: 0.001, unknown_mb_rows: unknownMb, rows_without_target: noTarget });
      await finishRun(runId, "succeeded", rows.length, loaded, quarantined);
      console.log(`    ${srcType}->${t.target}: ${loaded} pairs staged (${quarantined} quarantined, ${bad} not reconciling)`);
      summaries.push({ pair: `${srcType}->${t.target}`, dataset: datasetId, loadRunId: runId, loaded, quarantined, notReconciling: bad });
    }
  }
  return summaries;
}

// ── Coverage results ─────────────────────────────────────────────────────

async function recordCoverage(levelResults) {
  const dict = fs.readFileSync(DICTIONARY, "utf8").split(/\r?\n/).slice(1).filter(Boolean);
  const expected = new Map(dict.map((l) => {
    const c = l.split(",");
    return [c[0], Number(c[4])];
  }));
  for (const r of levelResults) {
    const exp = expected.get(r.level) ?? null;
    const actual = r.loaded - r.quarantined;
    await client.query(
      `insert into meta.coverage_result (dataset_id, geography_type, reference_period, expected_count, actual_count, coverage_score, details)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [r.dataset, r.level, REFERENCE_PERIOD, exp, actual,
        exp ? Math.min(actual / exp, 1) : null,
        JSON.stringify({
          stage: "staging", load_run_id: r.loadRunId, extracted: r.extracted, loaded: r.loaded, quarantined: r.quarantined,
          note: r.level === "STATE" ? "dictionary expects 9; ABS file includes 'Outside Australia' (Z) special code" : undefined,
        })]
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

try {
  const levelResults = [];
  const levels = LEVELS.filter((l) => !ONLY || ONLY === l.level);
  if (levels.length > 0) {
    console.log("\nBoundary staging load:");
    for (const cfg of levels) levelResults.push(await loadLevel(cfg));
    await recordCoverage(levelResults);
  }
  let corr = [];
  if (!ONLY || ONLY === "correspondences") {
    console.log("\nCorrespondence staging load:");
    corr = await loadCorrespondences();
  }
  console.log("\nStaging load complete (branch only; core promotion still blocked).");
  console.log(`  boundary rows:      ${levelResults.reduce((s, r) => s + r.loaded, 0)} (${levelResults.reduce((s, r) => s + r.quarantined, 0)} quarantined)`);
  console.log(`  correspondence rows: ${corr.reduce((s, r) => s + r.loaded, 0)} (${corr.reduce((s, r) => s + r.quarantined, 0)} quarantined)`);
} finally {
  await client.end();
}
