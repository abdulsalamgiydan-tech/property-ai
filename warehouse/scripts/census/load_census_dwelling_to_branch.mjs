#!/usr/bin/env node
/**
 * 2021 Census dwelling stock — branch-only load (Sprint 3, Part D).
 *
 * Loads the validated local Census store into the warehouse-validation
 * Supabase branch ONLY:
 *   1. meta lineage (source/dataset/load_run/source_file with SHA-256)
 *   2. core.fact_dwelling_stock   (all 5 levels, direct ABS cells)
 *   3. core.fact_household_tenure (all 5 levels)
 *   4. core.bridge_geography_correspondence: dwelling_weight + preferred_weight
 *      upgraded from Census MB dwelling counts (area weights preserved in
 *      area_weight; zero-dwelling sources keep area-based preferred_weight)
 *   5. mart.suburb_dwelling_stock_2021 + mart.postcode_dwelling_stock_2021
 *      built from SA1 facts via the dwelling-weighted correspondence bridge
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-gates
 * (rollback on failure); additive SQL + idempotent phase-skips; special-code
 * rows can never enter core (dim join filters them; counted in the report).
 *
 * Usage:
 *   node load_census_dwelling_to_branch.mjs             # dry run
 *   node load_census_dwelling_to_branch.mjs --execute
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
const BV = "ASGS3_2021";
const CENSUS_YEAR = 2021;
const CENSUS_NIGHT = "2021-08-10";
const WEIGHT_TOL = 0.001;

const DB_PATH = rel("warehouse", "data", "local", "census_2021.duckdb");
const LOCAL_REPORT = rel("warehouse", "reports", "census_dwelling_local_store_report.json");
const INVENTORY = rel("warehouse", "reports", "census_dwelling_download_inventory.json");
const MANIFEST = rel("warehouse", "reports", "census_dwelling_source_manifest.json");
const RUN_REPORT = rel("warehouse", "reports", "census_dwelling_branch_load_report.json");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

// ── Guardrails + preflight ───────────────────────────────────────────────

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);
if (!fs.existsSync(DB_PATH)) fail("local census store missing — run build_census_dwelling_local_store.mjs");
if (!fs.existsSync(LOCAL_REPORT) || JSON.parse(fs.readFileSync(LOCAL_REPORT, "utf8")).verdict !== "PASSED") {
  fail("local census store validation is not PASSED — refusing to load (hard stop)");
}
const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const invByDataset = new Map(inventory.files.map((f) => [f.dataset_id, f]));

console.log(`load_census_dwelling_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);

const duckInstance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const duck = await duckInstance.connect();
const duckRows = async (sql) => (await duck.runAndReadAll(sql)).getRowObjects();

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

{
  const t = await q(`select to_regclass('core.fact_dwelling_stock') a, to_regclass('core.fact_household_tenure') b,
                            to_regclass('mart.suburb_dwelling_stock_2021') c, to_regclass('mart.postcode_dwelling_stock_2021') d`);
  if (!t[0].a || !t[0].b || !t[0].c || !t[0].d) fail("migration 006 tables missing on branch — apply 006 first (hard stop)");
}
const [dimCheck] = await q("select count(*)::int n from core.dim_geography where boundary_version=$1", [BV]);
if (dimCheck.n < 80000) fail(`core.dim_geography looks unpopulated (${dimCheck.n} rows) — geography backbone required (hard stop)`);

const dimIds = new Set((await q("select geography_id from core.dim_geography where boundary_version=$1", [BV])).map((r) => r.geography_id));
const gid = (t, c) => `${t}_${c}_${BV}`;

const [preState] = await q(`select
  (select count(*)::int from core.fact_dwelling_stock where census_year=${CENSUS_YEAR}) facts,
  (select count(*)::int from core.fact_household_tenure where census_year=${CENSUS_YEAR}) tenure,
  (select count(*)::int from core.bridge_geography_correspondence where dwelling_weight is not null) dw_weights,
  (select count(*)::int from mart.suburb_dwelling_stock_2021) suburb_mart,
  (select count(*)::int from mart.postcode_dwelling_stock_2021) postcode_mart`);
console.log(`  branch state: facts=${preState.facts} tenure=${preState.tenure} dwelling_weights=${preState.dw_weights} suburb_mart=${preState.suburb_mart} postcode_mart=${preState.postcode_mart}`);
console.log(`  dim ids loaded for join filter: ${dimIds.size}`);

if (!EXECUTE) {
  const [d] = await duckRows(`select
    (select count(*) from census_dwelling_stock where not is_quarantined)::int dw,
    (select count(*) from census_household_tenure where not is_quarantined)::int tn,
    (select count(*) from correspondence_dwelling_weights where dwelling_ratio is not null)::int cw`);
  console.log(`\nDry run: would load ~${num(d.dw)} dwelling cells + ~${num(d.tn)} tenure cells (minus special-code rows),`);
  console.log(`upgrade ~${num(d.cw)} correspondence weights to dwelling basis, then build both marts.`);
  console.log("Phases with existing rows are skipped (idempotent). Use --execute to load.");
  duck.closeSync();
  await client.end();
  process.exit(0);
}

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  loaded: {},
  skipped: {},
  gates_after: {},
};

async function startRun(datasetId) {
  const { rows } = await client.query(
    "insert into meta.load_run (dataset_id, run_status) values ($1,'running') returning load_run_id", [datasetId]);
  return rows[0].load_run_id;
}
async function finishRun(id, extracted, loaded, quarantined) {
  await client.query(
    "update meta.load_run set run_status='succeeded', finished_at=now(), records_extracted=$2, records_loaded=$3, records_quarantined=$4 where load_run_id=$1",
    [id, extracted, loaded, quarantined]);
}

try {
  await client.query("begin");

  // 1. meta lineage.
  await client.query(`
    insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent,
      source_url, licence, access_method, update_frequency, implementation_status)
    values ('abs_census','ABS Census of Population and Housing','Australian Bureau of Statistics','demographics','official',
      'https://www.abs.gov.au/census','CC BY 4.0','file_download','five_yearly','in_progress')
    on conflict (source_id) do update set implementation_status='in_progress', updated_at=now()`);
  const runIds = new Map();
  const fileIds = new Map();
  for (const e of manifest.entries.filter((x) => x.entry_type !== "documentation")) {
    await client.query(
      `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
       values ($1,'abs_census',$2,$3,'2021','2021',$4,'five_yearly',$5) on conflict (dataset_id) do nothing`,
      [e.dataset_id, e.dataset_name, e.geography_level, e.file_format, e.notes]);
    const inv = invByDataset.get(e.dataset_id);
    if (!inv) continue;
    const runId = await startRun(e.dataset_id);
    runIds.set(e.dataset_id, runId);
    const { rows } = await client.query(
      `insert into meta.source_file (load_run_id, source_id, source_url, file_name, file_format, file_hash, reference_period)
       values ($1,'abs_census',$2,$3,$4,$5,'2021') returning source_file_id`,
      [runId, inv.source_url, inv.file_name, path.extname(inv.file_name).slice(1), inv.sha256]);
    fileIds.set(e.dataset_id, rows[0].source_file_id);
  }
  console.log(`\n  meta: source + ${runIds.size} load runs registered`);

  // 2+3. Facts (dwelling stock + tenure), all levels, dim-join filtered.
  const loadFacts = async (kind) => {
    const isDwelling = kind === "dwelling";
    const table = isDwelling ? "core.fact_dwelling_stock" : "core.fact_household_tenure";
    const already = isDwelling ? preState.facts : preState.tenure;
    if (already > 0) {
      console.log(`  ${table}: ${already} rows already present — phase skipped`);
      report.skipped[table] = `phase skipped: ${already} rows already present`;
      return { loaded: 0, skippedSpecial: 0 };
    }
    const src = isDwelling
      ? `select geography_type t, geography_code c, gcp_table, source_column, measure_name m, dwelling_type dt, value_count v, dataset_id
         from census_dwelling_stock where not is_quarantined`
      : `select geography_type t, geography_code c, gcp_table, source_column, tenure_type tt, household_count v, dataset_id
         from census_household_tenure where not is_quarantined`;
    const rows = await duckRows(src);
    let loaded = 0;
    let skippedSpecial = 0;
    const perDataset = new Map();
    for (let i = 0; i < rows.length; i += 1000) {
      const slice = rows.slice(i, i + 1000).filter((r) => {
        const ok = dimIds.has(gid(r.t, r.c));
        if (!ok) skippedSpecial++;
        return ok;
      });
      if (slice.length === 0) continue;
      const params = [];
      const tuples = slice.map((r) => {
        const ds = r.dataset_id;
        perDataset.set(ds, (perDataset.get(ds) ?? 0) + 1);
        if (isDwelling) {
          params.push(gid(r.t, r.c), r.t, r.c, r.m, r.dt, r.v === null ? null : num(r.v), ds, runIds.get(ds), fileIds.get(ds));
          const b = params.length - 9;
          return `($${b + 1},$${b + 2},$${b + 3},date '${CENSUS_NIGHT}',${CENSUS_YEAR},$${b + 4},$${b + 5},$${b + 6}::integer,'abs_census',$${b + 7},$${b + 8},$${b + 9},'passed','high')`;
        }
        params.push(gid(r.t, r.c), r.t, r.c, r.tt, r.v === null ? null : num(r.v), ds, runIds.get(ds), fileIds.get(ds));
        const b = params.length - 8;
        return `($${b + 1},$${b + 2},$${b + 3},date '${CENSUS_NIGHT}',${CENSUS_YEAR},$${b + 4},$${b + 5}::integer,'abs_census',$${b + 6},$${b + 7},$${b + 8},'passed','high')`;
      });
      const cols = isDwelling
        ? "(geography_id, geography_type, geography_code, reference_period, census_year, measure_name, dwelling_type, dwelling_count, source_id, dataset_id, load_run_id, source_file_id, data_quality_status, confidence_label)"
        : "(geography_id, geography_type, geography_code, reference_period, census_year, tenure_type, household_count, source_id, dataset_id, load_run_id, source_file_id, data_quality_status, confidence_label)";
      const conflict = isDwelling
        ? "on conflict (geography_id, census_year, measure_name, dwelling_type) do nothing"
        : "on conflict (geography_id, census_year, tenure_type) do nothing";
      await client.query(`insert into ${table} ${cols} values ${tuples.join(",")} ${conflict}`, params);
      loaded += slice.length;
    }
    for (const [ds, n] of perDataset) await finishRun(runIds.get(ds), n, n, 0);
    console.log(`  ${table}: ${loaded} rows (${skippedSpecial} special-code cells excluded by dim join)`);
    return { loaded, skippedSpecial };
  };
  report.loaded.fact_dwelling_stock = await loadFacts("dwelling");
  report.loaded.fact_household_tenure = await loadFacts("tenure");

  // 4. Correspondence weight upgrade (area -> dwelling preferred).
  if (preState.dw_weights > 0) {
    console.log(`  correspondence weights: ${preState.dw_weights} already dwelling-based — phase skipped`);
    report.skipped.correspondence_weights = `phase skipped: ${preState.dw_weights} rows already upgraded`;
  } else {
    const weights = await duckRows(
      "select source_geography_type st, source_geography_code sc, target_geography_type tt, target_geography_code tc, dwelling_ratio r from correspondence_dwelling_weights where dwelling_ratio is not null");
    let updated = 0;
    let unmatched = 0;
    for (let i = 0; i < weights.length; i += 500) {
      const slice = weights.slice(i, i + 500).filter((w) => dimIds.has(gid(w.st, w.sc)) && dimIds.has(gid(w.tt, w.tc)));
      unmatched += weights.slice(i, i + 500).length - slice.length;
      if (slice.length === 0) continue;
      const params = [];
      const tuples = slice.map((w) => {
        params.push(gid(w.st, w.sc), gid(w.tt, w.tc), w.r);
        const b = params.length - 3;
        return `($${b + 1},$${b + 2},$${b + 3}::numeric)`;
      });
      const r = await client.query(
        `update core.bridge_geography_correspondence b
         set dwelling_weight = v.ratio, preferred_weight = v.ratio
         from (values ${tuples.join(",")}) as v(sid, tid, ratio)
         where b.source_geography_id = v.sid and b.target_geography_id = v.tid and b.correspondence_version = '${BV}'`,
        params);
      updated += r.rowCount;
    }
    report.loaded.correspondence_weights_updated = updated;
    report.skipped.correspondence_weight_pairs_unmatched = unmatched;
    console.log(`  correspondence weights: ${updated} pairs upgraded to dwelling basis (${unmatched} special-code pairs skipped; zero-dwelling sources keep area preferred_weight)`);
  }

  // 5. Marts from SA1 facts via the (now dwelling-weighted) correspondence.
  const buildMart = async (target, table) => {
    const already = target === "SAL" ? preState.suburb_mart : preState.postcode_mart;
    if (already > 0) {
      console.log(`  ${table}: ${already} rows already present — phase skipped`);
      report.skipped[table] = `phase skipped: ${already} rows already present`;
      return 0;
    }
    const r = await client.query(`
      insert into ${table}
        (geography_id, geography_name, state_code, census_year,
         total_private_dwellings, occupied_private_dwellings, unoccupied_private_dwellings,
         separate_house, semi_detached_row_terrace, flat_apartment, other_dwelling,
         owner_households, renter_households,
         correspondence_method, data_coverage_score, confidence_label, source_summary)
      with corr as (
        select source_geography_id, target_geography_id, preferred_weight,
               (dwelling_weight is not null) as dwelling_based
        from core.bridge_geography_correspondence
        where target_geography_type = '${target}' and source_geography_type = 'SA1'
          and correspondence_version = '${BV}' and preferred_weight is not null
      ),
      f as (
        select geography_id, measure_name, dwelling_type, dwelling_count
        from core.fact_dwelling_stock where geography_type = 'SA1' and census_year = ${CENSUS_YEAR}
      ),
      t as (
        select geography_id, tenure_type, household_count
        from core.fact_household_tenure where geography_type = 'SA1' and census_year = ${CENSUS_YEAR}
      ),
      dw as (
        select c.target_geography_id gidt,
          round(sum(f.dwelling_count * c.preferred_weight) filter (where measure_name='total_private_dwellings' and dwelling_type='all'))::int total_pd,
          round(sum(f.dwelling_count * c.preferred_weight) filter (where measure_name='occupied_private_dwellings' and dwelling_type='all'))::int occ_pd,
          round(sum(f.dwelling_count * c.preferred_weight) filter (where measure_name='unoccupied_private_dwellings' and dwelling_type='all'))::int unocc_pd,
          round(sum(f.dwelling_count * c.preferred_weight) filter (where measure_name='occupied_private_dwellings' and dwelling_type='separate_house'))::int sep,
          round(sum(f.dwelling_count * c.preferred_weight) filter (where measure_name='occupied_private_dwellings' and dwelling_type='semi_detached_row_terrace_townhouse'))::int semi,
          round(sum(f.dwelling_count * c.preferred_weight) filter (where measure_name='occupied_private_dwellings' and dwelling_type='flat_apartment'))::int flat,
          round(sum(f.dwelling_count * c.preferred_weight) filter (where measure_name='occupied_private_dwellings' and dwelling_type='other_dwelling'))::int oth,
          sum(c.preferred_weight * (f.dwelling_count is not null)::int) filter (where measure_name='total_private_dwellings' and dwelling_type='all') /
            nullif(sum(c.preferred_weight) filter (where measure_name='total_private_dwellings' and dwelling_type='all'), 0) as coverage,
          (sum(case when c.dwelling_based then 0 else 1 end) = 0) as fully_dwelling_based
        from corr c join f on f.geography_id = c.source_geography_id
        group by 1
      ),
      tn as (
        select c.target_geography_id gidt,
          round(sum(t.household_count * c.preferred_weight) filter (where tenure_type in ('owned_outright','owned_with_mortgage')))::int owners,
          round(sum(t.household_count * c.preferred_weight) filter (where tenure_type='rented'))::int renters
        from corr c join t on t.geography_id = c.source_geography_id
        group by 1
      )
      select dw.gidt, d.geography_name, d.state_code, ${CENSUS_YEAR},
             dw.total_pd, dw.occ_pd, dw.unocc_pd, dw.sep, dw.semi, dw.flat, dw.oth,
             tn.owners, tn.renters,
             case when dw.fully_dwelling_based then 'sa1_dwelling_weighted' else 'sa1_mixed_dwelling_area_weighted' end,
             round(coalesce(dw.coverage, 0)::numeric, 4),
             case when coalesce(dw.coverage,0) >= 0.9 then 'high'
                  when coalesce(dw.coverage,0) >= 0.7 then 'medium'
                  when coalesce(dw.coverage,0) >= 0.4 then 'low' else 'insufficient_data' end,
             jsonb_build_object('source','abs_census','datasets', jsonb_build_array('census_gcp_sa1_2021'),
                                'via','core.bridge_geography_correspondence','census_year',${CENSUS_YEAR})
      from dw
      left join tn on tn.gidt = dw.gidt
      join core.dim_geography d on d.geography_id = dw.gidt
      on conflict (geography_id, census_year) do nothing`);
    console.log(`  ${table}: ${r.rowCount} rows built via correspondence`);
    return r.rowCount;
  };
  report.loaded.suburb_mart = await buildMart("SAL", "mart.suburb_dwelling_stock_2021");
  report.loaded.postcode_mart = await buildMart("POA", "mart.postcode_dwelling_stock_2021");

  // ── Post-load blocking gates ───────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select geography_id, census_year, measure_name, dwelling_type
       from core.fact_dwelling_stock group by 1,2,3,4 having count(*)>1) d) as dup_fact_grain,
    (select count(*)::int from core.fact_dwelling_stock where geography_id is null) as null_geo_ids,
    (select count(*)::int from core.fact_dwelling_stock where dwelling_count < 0) as negative_counts,
    (select count(*)::int from core.fact_dwelling_stock f
      where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_facts,
    (select count(*)::int from (select source_geography_id, target_geography_type
       from core.bridge_geography_correspondence where preferred_weight is not null
       group by 1,2 having abs(sum(preferred_weight)-1.0) > ${WEIGHT_TOL}) w) as weight_violations`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup_grain=${post.dup_fact_grain} null_geo=${post.null_geo_ids} negative=${post.negative_counts} orphans=${post.orphan_facts} weight_violations=${post.weight_violations}`);
  if (post.dup_fact_grain || post.null_geo_ids || post.negative_counts || post.orphan_facts || post.weight_violations) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  for (const [rule, failed] of [
    ["no_duplicate_grain", post.dup_fact_grain],
    ["nulls_not_zero", post.null_geo_ids],
    ["geo_code_valid", post.orphan_facts],
    ["weights_reconcile", post.weight_violations],
  ]) {
    await client.query(
      "insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details) values ($1,'blocker',$2,$3,$4)",
      [rule, failed === 0 ? "passed" : "failed", failed,
        JSON.stringify({ stage: "census_dwelling_branch_load", census_year: CENSUS_YEAR })]);
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  duck.closeSync();
  await client.end();
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

// ── Post-commit summary + mart-vs-direct cross-check ─────────────────────

const [summary] = await q(`select
  (select json_object_agg(t, n) from (select geography_type t, count(*)::int n from core.fact_dwelling_stock where census_year=${CENSUS_YEAR} group by 1) x) as facts_by_type,
  (select json_object_agg(m, n) from (select measure_name m, count(*)::int n from core.fact_dwelling_stock where census_year=${CENSUS_YEAR} group by 1) x) as facts_by_measure,
  (select count(*)::int from core.fact_dwelling_stock where census_year=${CENSUS_YEAR}) as fact_total,
  (select count(*)::int from core.fact_household_tenure where census_year=${CENSUS_YEAR}) as tenure_total,
  (select count(*)::int from mart.suburb_dwelling_stock_2021) as suburb_mart,
  (select count(*)::int from mart.postcode_dwelling_stock_2021) as postcode_mart,
  (select count(*)::int from core.bridge_geography_correspondence where dwelling_weight is not null) as dwelling_weighted_pairs,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);

// How well do correspondence-built mart values agree with the direct ABS
// SAL/POA facts? (Direct facts exist for the same measure — great QA signal.)
const crossCheck = {};
for (const [target, martTable] of [["SAL", "mart.suburb_dwelling_stock_2021"], ["POA", "mart.postcode_dwelling_stock_2021"]]) {
  const [cc] = await q(`
    with direct as (
      select geography_id, dwelling_count from core.fact_dwelling_stock
      where geography_type='${target}' and census_year=${CENSUS_YEAR}
        and measure_name='total_private_dwellings' and dwelling_type='all' and dwelling_count is not null
    )
    select count(*)::int compared,
           round(avg(abs(m.total_private_dwellings - d.dwelling_count))::numeric, 1) mean_abs_diff,
           round(percentile_cont(0.5) within group (order by abs(m.total_private_dwellings - d.dwelling_count))::numeric, 1) median_abs_diff,
           round((100.0 * count(*) filter (where abs(m.total_private_dwellings - d.dwelling_count) <= greatest(5, 0.05*d.dwelling_count)) / count(*))::numeric, 1) pct_within_5pct_or_5
    from ${martTable} m join direct d using (geography_id)
    where m.total_private_dwellings is not null`);
  crossCheck[target] = cc;
}
report.core_state = summary;
report.mart_vs_direct_abs_crosscheck = crossCheck;
duck.closeSync();
await client.end();

fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/census_dwelling_branch_load_report.json");
console.log(`facts=${summary.fact_total} tenure=${summary.tenure_total} suburb_mart=${summary.suburb_mart} postcode_mart=${summary.postcode_mart} db=${summary.db_size}`);
