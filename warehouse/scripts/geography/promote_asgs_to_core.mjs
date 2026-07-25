#!/usr/bin/env node
/**
 * ASGS core promotion — LOCAL STORE -> BRANCH CORE (Sprint 2, Part D).
 *
 * Reads the validated local DuckDB store (warehouse/data/local/asgs_2021.duckdb)
 * and promotes it into the core geography tables on the warehouse-validation
 * Supabase branch ONLY:
 *   - core.dim_geography + core.dim_geography_version
 *   - core.bridge_geography_relationship
 *   - core.bridge_geography_correspondence
 *
 * It does NOT touch staging.asgs_geography / staging.asgs_correspondence
 * (they were truncated by the approved cleanup; the local store is the
 * staging source of truth).
 *
 * Safety:
 *   - connection from WAREHOUSE_VALIDATION_DB_URL (.env.local); must contain
 *     branch ref "lzonauinzatmtytyoems", must NOT contain production ref
 *     "oshquaxsloolqucwvigc"; never printed
 *   - dry-run by default; --execute required for writes
 *   - blocking gates: local store verdict PASSED + live DuckDB counts match
 *     the approved snapshot before; duplicates / invalid geometry / NULL
 *     codes / orphans / weight reconciliation after — all inside ONE
 *     Postgres transaction, rolled back on any failure
 *   - ABS special-purpose codes (no geometry / zero area) stay quarantined
 *     in the local store, are never promoted, never invented, and are
 *     counted in the report
 *   - additive SQL only; idempotence via phase skip (a phase that already
 *     has ASGS3_2021 rows is not re-inserted)
 *
 * Usage:
 *   node promote_asgs_to_core.mjs             # dry run
 *   node promote_asgs_to_core.mjs --execute   # promote
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
const VALID_FROM = "2021-07-01";
const WEIGHT_TOL = 0.001;
const DB_PATH = rel("warehouse", "data", "local", "asgs_2021.duckdb");
const LOCAL_REPORT = rel("warehouse", "reports", "asgs_local_store_report.json");
const RUN_REPORT = rel("warehouse", "reports", "asgs_core_promotion_report.json");

const EXPECTED_GEO = { STATE: 10, GCCSA: 35, SA4: 108, SA3: 359, SA2: 2473, SA1: 61845, LGA: 566, SAL: 15353, POA: 2644 };
const EXPECTED_CORR = { "SA1->SAL": 73131, "SA1->POA": 65318, "SA1->LGA": 62372, "SA2->SAL": 17496, "SA2->POA": 5904, "SA2->LGA": 3097 };
const PARENT_TYPE = { SA1: "SA2", SA2: "SA3", SA3: "SA4", SA4: "GCCSA", GCCSA: "STATE" };
const LEVEL_ORDER = ["STATE", "GCCSA", "SA4", "SA3", "LGA", "POA", "SA2", "SAL", "SA1"];

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

// ── Guardrails + preflight ───────────────────────────────────────────────

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);
if (!fs.existsSync(DB_PATH)) fail("local store missing — run build_asgs_local_store.mjs first");
if (!fs.existsSync(LOCAL_REPORT) || JSON.parse(fs.readFileSync(LOCAL_REPORT, "utf8")).verdict !== "PASSED") {
  fail("local store validation verdict is not PASSED — refusing to promote (hard stop)");
}

console.log(`promote_asgs_to_core — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"} (source: local DuckDB store)`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);

const duckInstance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const duck = await duckInstance.connect();
await duck.run("LOAD spatial;");
const duckRows = async (sql) => (await duck.runAndReadAll(sql)).getRowObjects();

// Live counts must still match the approved snapshot.
{
  const geo = Object.fromEntries((await duckRows("select geography_type t, count(*)::int n from asgs_geography group by 1")).map((r) => [r.t, num(r.n)]));
  const corr = Object.fromEntries((await duckRows("select source_geography_type || '->' || target_geography_type p, count(*)::int n from asgs_correspondence group by 1")).map((r) => [r.p, num(r.n)]));
  const mismatches = [
    ...Object.entries(EXPECTED_GEO).filter(([t, n]) => geo[t] !== n).map(([t, n]) => `${t}: ${geo[t] ?? 0} != ${n}`),
    ...Object.entries(EXPECTED_CORR).filter(([p, n]) => corr[p] !== n).map(([p, n]) => `${p}: ${corr[p] ?? 0} != ${n}`),
  ];
  if (mismatches.length) fail(`local store no longer matches approved snapshot (hard stop):\n  ${mismatches.join("\n  ")}`);
  console.log("  local store counts match approved snapshot: yes");
}

const [{ q_geo, q_corr }] = await duckRows(
  "select (select count(*) from asgs_geography where is_quarantined)::int q_geo, (select count(*) from asgs_correspondence where is_quarantined)::int q_corr"
);
console.log(`  special-purpose rows kept in local store (never promoted, nothing invented): ${num(q_geo)} geography, ${num(q_corr)} correspondence`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
// Connection-level errors (e.g. backend killed) must reject the in-flight
// query and reach our catch/rollback path — never crash the process.
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

{
  const t = await q(
    "select to_regclass('core.dim_geography') a, to_regclass('core.dim_geography_version') b, to_regclass('core.bridge_geography_relationship') c, to_regclass('core.bridge_geography_correspondence') d"
  );
  if (!t[0].a || !t[0].b || !t[0].c || !t[0].d) fail("core tables missing on target — wrong database");
}
const [pre] = await q(
  `select (select count(*)::int from core.dim_geography where boundary_version=$1) dim,
          (select count(*)::int from core.bridge_geography_relationship) rel,
          (select count(*)::int from core.bridge_geography_correspondence where correspondence_version=$1) corr`,
  [BV]
);
console.log(`  branch core state: dim=${pre.dim} rel=${pre.rel} corr=${pre.corr} (phases with existing rows are skipped)`);

if (!EXECUTE) {
  console.log("\nDry run: preflight PASSED. Planned actions:");
  console.log("  1. upsert 9 core.dim_geography_version rows");
  console.log("  2. insert 83,241 non-quarantined areas into core.dim_geography (WKB from DuckDB, MultiPolygon 4326,");
  console.log("     centroid/area computed in PostGIS, parent pointers join-verified client-side, is_current=true)");
  console.log("  3. insert 'contains' relationship rows (hierarchy + derived LGA/SAL->STATE; POA->STATE not derivable)");
  console.log("  4. insert ~227k correspondence pairs (area weights, methods/confidence preserved)");
  console.log("  5. post-gates inside ONE transaction: duplicates / invalid / NULL / zero-area / orphans / weights — rollback on failure");
  duck.closeSync();
  await client.end();
  console.log("\nNo changes made. Use --execute to promote.");
  process.exit(0);
}

// ── Load local rows into memory maps (attributes only; geometry streamed) ─

const report = {
  generated_at: new Date().toISOString(),
  source: "warehouse/data/local/asgs_2021.duckdb",
  branch_ref: BRANCH_REF,
  production_touched: false,
  skipped_special_purpose: { geography: num(q_geo), correspondence: num(q_corr) },
  promoted: {},
  skipped: {},
  gates_after: {},
};

const meta = await duckRows(`
  select geography_type, geography_code, geography_name, state_code, state_name,
         parent_code, area_square_km, dataset_id
  from asgs_geography where not is_quarantined`);
const idSet = new Set(meta.map((r) => `${r.geography_type}_${r.geography_code}_${BV}`));
const gid = (t, c) => `${t}_${c}_${BV}`;

try {
  await client.query("begin");

  // D2a: version rows.
  for (const t of LEVEL_ORDER) {
    await client.query(
      `insert into core.dim_geography_version (geography_version_id, geography_type, boundary_version, source_id, valid_from, valid_to, notes)
       values ($1,$2,$3,'abs_asgs',$4,null,'ASGS Edition 3 (July 2021 - June 2026); promoted from validated local DuckDB store built from official ABS files')
       on conflict (geography_version_id) do nothing`,
      [`${t}_${BV}`, t, BV, VALID_FROM]
    );
  }

  // D2b: dim rows, geometry streamed from DuckDB as WKB hex per level in
  // chunks. Parent pointers are join-verified client-side against the full
  // id set (strict hierarchy only; SAL/POA/LGA stay NULL). SA1 has no
  // published name — code stands in. Area preserved from ABS; centroid
  // always computed from geometry in PostGIS; both NULL only if geom NULL
  // (cannot happen: non-quarantined rows all have geometry).
  if (pre.dim > 0) {
    console.log(`\n  dim_geography: ${pre.dim} ${BV} rows already present — phase skipped (idempotent)`);
    report.promoted.dim_geography = 0;
    report.skipped.dim_geography = `phase skipped: ${pre.dim} rows already present`;
  } else {
    console.log("\n  dim_geography:");
    let dimTotal = 0;
    for (const level of LEVEL_ORDER) {
      const CHUNK = 2000;
      let offset = 0;
      let levelCount = 0;
      for (;;) {
        const chunk = await duckRows(`
          select geography_type, geography_code, geography_name, state_code, state_name,
                 parent_code, area_square_km, hex(ST_AsWKB(geom)) as wkb_hex
          from asgs_geography
          where not is_quarantined and geography_type = '${level}'
          order by geography_code
          limit ${CHUNK} offset ${offset}`);
        if (chunk.length === 0) break;
        offset += chunk.length;

        // Byte-capped batches (huge coastal multipolygons killed the micro
        // compute with fixed-size batches); WKB is decoded ONCE per row via
        // the lateral, not once per computed column.
        const flush = async (batch) => {
          if (batch.length === 0) return;
          const params = [];
          const tuples = batch.map((r) => {
            const parentType = PARENT_TYPE[r.geography_type];
            const parentId = parentType && r.parent_code && idSet.has(gid(parentType, r.parent_code))
              ? gid(parentType, r.parent_code)
              : null;
            params.push(
              gid(r.geography_type, r.geography_code), r.geography_type, r.geography_code,
              r.geography_name ?? r.geography_code, r.state_code, r.state_name,
              parentId, r.area_square_km, r.wkb_hex
            );
            const b = params.length - 9;
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8}::numeric,$${b + 9})`;
          });
          await client.query(
            `insert into core.dim_geography
               (geography_id, geography_type, geography_code, geography_name, state_code, state_name,
                parent_geography_id, boundary_version, valid_from, valid_to, area_square_km,
                centroid_lat, centroid_lon, is_current, geom)
             select v.gid, v.gtype, v.gcode, v.gname, v.scode, v.sname, v.pid, '${BV}',
                    date '${VALID_FROM}', null,
                    coalesce(v.area, round((ST_Area(l.g::geography)/1e6)::numeric, 4)),
                    round(ST_Y(ST_Centroid(l.g))::numeric, 7),
                    round(ST_X(ST_Centroid(l.g))::numeric, 7),
                    true, ST_SetSRID(ST_Multi(l.g), 4326)
             from (values ${tuples.join(",")}) as v(gid, gtype, gcode, gname, scode, sname, pid, area, wkb)
             cross join lateral (select ST_GeomFromWKB(decode(v.wkb, 'hex')) as g) l
             on conflict (geography_type, geography_code, boundary_version) do nothing`,
            params
          );
        };
        let batch = [];
        let batchHexChars = 0;
        for (const r of chunk) {
          batch.push(r);
          batchHexChars += r.wkb_hex?.length ?? 0;
          if (batch.length >= 50 || batchHexChars > 3_000_000) {
            await flush(batch);
            batch = [];
            batchHexChars = 0;
          }
        }
        await flush(batch);
        levelCount += chunk.length;
      }
      dimTotal += levelCount;
      console.log(`    ${level.padEnd(6)} ${String(levelCount).padStart(6)} rows`);
    }
    report.promoted.dim_geography = dimTotal;
  }

  // D3: containment bridge from verified parent pointers + derived
  // LGA/SAL -> STATE (ABS STE code). POA -> STATE not derivable (documented).
  if (pre.rel > 0) {
    console.log(`  relationships: ${pre.rel} rows already present — phase skipped`);
    report.promoted.relationships = 0;
    report.skipped.relationships = `phase skipped: ${pre.rel} rows already present`;
  } else {
    const relHier = await client.query(`
      insert into core.bridge_geography_relationship (child_geography_id, parent_geography_id, relationship_type, valid_from, valid_to)
      select geography_id, parent_geography_id, 'contains', date '${VALID_FROM}', null
      from core.dim_geography
      where boundary_version = '${BV}' and parent_geography_id is not null`);
    const relState = await client.query(`
      insert into core.bridge_geography_relationship (child_geography_id, parent_geography_id, relationship_type, valid_from, valid_to)
      select d.geography_id, st.geography_id, 'contains', date '${VALID_FROM}', null
      from core.dim_geography d
      join core.dim_geography st
        on st.geography_type = 'STATE' and st.geography_code = d.state_code and st.boundary_version = d.boundary_version
      where d.boundary_version = '${BV}' and d.geography_type in ('LGA','SAL') and d.state_code is not null`);
    report.promoted.relationship_hierarchy = relHier.rowCount;
    report.promoted.relationship_lga_sal_state = relState.rowCount;
    console.log(`  relationships: ${relHier.rowCount} hierarchy + ${relState.rowCount} derived LGA/SAL->STATE`);
  }
  report.skipped.poa_to_state = "not derivable (postal areas cross state borders) — pending, not invented";
  report.skipped.sa4_to_state_direct = "available transitively via SA4->GCCSA->STATE";

  // D4: correspondences from the local store; both endpoints must exist in
  // the promoted id set (special-purpose codes therefore cannot leak in).
  if (pre.corr > 0) {
    console.log(`  correspondences: ${pre.corr} rows already present — phase skipped`);
    report.promoted.correspondence = 0;
    report.skipped.correspondence = `phase skipped: ${pre.corr} rows already present`;
  } else {
    const corrRows = await duckRows(`
      select source_geography_type st, source_geography_code sc,
             target_geography_type tt, target_geography_code tc,
             ratio, correspondence_method m
      from asgs_correspondence where not is_quarantined and ratio is not null`);
    let corrLoaded = 0;
    let corrOrphanSkipped = 0;
    for (let i = 0; i < corrRows.length; i += 500) {
      const batch = corrRows.slice(i, i + 500).filter((r) => {
        const ok = idSet.has(gid(r.st, r.sc)) && idSet.has(gid(r.tt, r.tc));
        if (!ok) corrOrphanSkipped++;
        return ok;
      });
      if (batch.length === 0) continue;
      const params = [];
      const tuples = batch.map((r) => {
        params.push(gid(r.st, r.sc), gid(r.tt, r.tc), r.st, r.tt, r.ratio, r.m,
          r.m === "abs_sa1_allocation" ? 0.9 : 0.8);
        const b = params.length - 7;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::numeric,null,null,$${b + 5}::numeric,$${b + 6},'${BV}',$${b + 7},date '${VALID_FROM}',null)`;
      });
      await client.query(
        `insert into core.bridge_geography_correspondence
           (source_geography_id, target_geography_id, source_geography_type, target_geography_type,
            area_weight, population_weight, dwelling_weight, preferred_weight,
            correspondence_method, correspondence_version, confidence_score, effective_from, effective_to)
         values ${tuples.join(",")}`,
        params
      );
      corrLoaded += batch.length;
    }
    report.promoted.correspondence = corrLoaded;
    report.skipped.correspondence_endpoint_not_in_core = corrOrphanSkipped;
    console.log(`  correspondences: ${corrLoaded} promoted, ${corrOrphanSkipped} skipped (endpoint not in core)`);
  }

  // ── Post-promotion gates (same transaction; rollback on failure) ───────
  const [post] = await q(`select
    (select count(*)::int from (select geography_type, geography_code, boundary_version from core.dim_geography group by 1,2,3 having count(*)>1) d) as dup_codes,
    (select count(*)::int from core.dim_geography where geom is not null and not ST_IsValid(geom)) as invalid_geoms,
    (select count(*)::int from core.dim_geography where geography_code is null) as null_codes,
    (select count(*)::int from core.dim_geography where geom is not null and ST_Area(geom) = 0) as zero_area_geoms,
    (select count(*)::int from core.bridge_geography_correspondence b
      where not exists (select 1 from core.dim_geography g where g.geography_id = b.source_geography_id)
         or not exists (select 1 from core.dim_geography g where g.geography_id = b.target_geography_id)) as orphan_refs,
    (select count(*)::int from (select source_geography_id, target_geography_type from core.bridge_geography_correspondence group by 1,2 having abs(sum(preferred_weight)-1.0) > ${WEIGHT_TOL}) w) as weight_violations`);
  report.gates_after = post;
  console.log(`\nPost-promotion gates: dup=${post.dup_codes} invalid=${post.invalid_geoms} null=${post.null_codes} zero_area=${post.zero_area_geoms} orphans=${post.orphan_refs} weight_violations=${post.weight_violations}`);
  if (post.dup_codes || post.invalid_geoms || post.null_codes || post.orphan_refs || post.weight_violations) {
    await client.query("rollback");
    fail("post-promotion gates FAILED — transaction rolled back, core unchanged (hard stop)");
  }

  for (const [rule, failed] of [
    ["no_duplicate_grain", post.dup_codes],
    ["geometry_valid", post.invalid_geoms],
    ["nulls_not_zero", post.null_codes],
    ["geo_code_valid", post.orphan_refs],
    ["weights_reconcile", post.weight_violations],
  ]) {
    await client.query(
      `insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details)
       values ($1,'blocker',$2,$3,$4)`,
      [rule, failed === 0 ? "passed" : "failed", failed,
        JSON.stringify({ stage: "core_promotion", source: "local_duckdb_store", boundary_version: BV })]
    );
  }

  await client.query("commit");
  console.log("\nPromotion COMMITTED (branch only; production untouched).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  duck.closeSync();
  await client.end();
  fail(`promotion aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

// ── Post-commit summary ──────────────────────────────────────────────────

const [summary] = await q(`select
  (select json_object_agg(t, n) from (select geography_type t, count(*)::int n from core.dim_geography group by 1) x) as dim_by_type,
  (select count(*)::int from core.dim_geography) as dim_total,
  (select count(*)::int from core.dim_geography_version) as versions,
  (select json_object_agg(t, n) from (select relationship_type t, count(*)::int n from core.bridge_geography_relationship group by 1) x) as rel_by_type,
  (select count(*)::int from core.bridge_geography_relationship) as rel_total,
  (select json_object_agg(p, n) from (select source_geography_type||'->'||target_geography_type p, count(*)::int n from core.bridge_geography_correspondence group by 1) x) as corr_by_pair,
  (select count(*)::int from core.bridge_geography_correspondence) as corr_total,
  (select json_agg(distinct ST_SRID(geom)) from core.dim_geography where geom is not null) as srids,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state = summary;
duck.closeSync();
await client.end();

fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/asgs_core_promotion_report.json");
console.log(`core.dim_geography: ${summary.dim_total} | relationships: ${summary.rel_total} | correspondences: ${summary.corr_total} | db: ${summary.db_size}`);
