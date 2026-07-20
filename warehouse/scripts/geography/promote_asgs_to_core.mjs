#!/usr/bin/env node
/**
 * ASGS core promotion (Sprint 2, Part D).
 *
 * Promotes validated staging rows into the core geography backbone on the
 * warehouse-validation Supabase branch ONLY:
 *   - core.dim_geography + core.dim_geography_version   (D2)
 *   - core.bridge_geography_relationship                (D3)
 *   - core.bridge_geography_correspondence              (D4)
 *
 * Safety:
 *   - connection from WAREHOUSE_VALIDATION_DB_URL (.env.local); must contain
 *     branch ref "lzonauinzatmtytyoems", must NOT contain production ref
 *     "oshquaxsloolqucwvigc"; never printed
 *   - dry-run by default; --execute required for writes
 *   - blocking gates before promotion (counts match approved snapshot,
 *     0 duplicates / invalid geometries / NULL codes, 6/6 weights reconcile)
 *     and after promotion inside the same transaction (rollback on failure)
 *   - additive SQL only (INSERT / UPDATE); no DROP/TRUNCATE/DELETE;
 *     idempotent upserts and insert-if-absent
 *   - ABS special-purpose records (no geometry / zero area) stay quarantined
 *     in staging and are documented — never promoted, never invented
 *
 * Usage:
 *   node promote_asgs_to_core.mjs             # dry run: gates + plan only
 *   node promote_asgs_to_core.mjs --execute   # promote
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const BV = "ASGS3_2021";
const VALID_FROM = "2021-07-01"; // ASGS Edition 3 window opens
const WEIGHT_TOL = 0.001;

// Approved staging snapshot (asgs_branch_validation_report.json) — promotion
// hard-stops if live staging no longer matches.
const EXPECTED_GEO = { STATE: 10, GCCSA: 35, SA4: 108, SA3: 359, SA2: 2473, SA1: 61845, LGA: 566, SAL: 15353, POA: 2644 };
const EXPECTED_CORR = { "SA1->SAL": 73131, "SA1->POA": 65318, "SA1->LGA": 62372, "SA2->SAL": 17496, "SA2->POA": 5904, "SA2->LGA": 3097 };

// Strict containment hierarchy (child type -> parent type). SAL/POA/LGA are
// outside it; SAL/LGA get derived state containment from ABS STE fields,
// POA -> STATE is NOT derivable (postal areas cross state borders).
const PARENT_TYPE = { SA1: "SA2", SA2: "SA3", SA3: "SA4", SA4: "GCCSA", GCCSA: "STATE" };

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`promote_asgs_to_core — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const report = {
  generated_at: new Date().toISOString(),
  mode: EXECUTE ? "execute" : "dry_run",
  branch_ref: BRANCH_REF,
  production_touched: false,
  gates_before: {},
  promoted: {},
  skipped: {},
  gates_after: {},
};

try {
  // ── Pre-promotion gates (read-only) ────────────────────────────────────
  {
    const tables = await q(
      "select to_regclass('core.dim_geography') a, to_regclass('core.dim_geography_version') b, to_regclass('core.bridge_geography_relationship') c, to_regclass('core.bridge_geography_correspondence') d"
    );
    if (!tables[0].a || !tables[0].b || !tables[0].c || !tables[0].d) fail("core tables missing on target — wrong database");
  }

  const geoCounts = Object.fromEntries(
    (await q("select geography_type t, count(*)::int n from staging.asgs_geography group by 1")).map((r) => [r.t, r.n])
  );
  const corrCounts = Object.fromEntries(
    (await q("select source_geography_type||'->'||target_geography_type p, count(*)::int n from staging.asgs_correspondence group by 1")).map((r) => [r.p, r.n])
  );
  const countMismatches = [
    ...Object.entries(EXPECTED_GEO).filter(([t, n]) => geoCounts[t] !== n).map(([t, n]) => `${t}: staging ${geoCounts[t] ?? 0} != approved ${n}`),
    ...Object.entries(EXPECTED_CORR).filter(([p, n]) => corrCounts[p] !== n).map(([p, n]) => `${p}: staging ${corrCounts[p] ?? 0} != approved ${n}`),
  ];
  if (countMismatches.length) fail(`staging no longer matches the approved validation snapshot (hard stop):\n  ${countMismatches.join("\n  ")}`);

  const [pre] = await q(`select
    (select count(*)::int from (select geography_type, geography_code from staging.asgs_geography where not is_quarantined group by 1,2 having count(*)>1) d) as dup_codes,
    (select count(*)::int from staging.asgs_geography where not is_quarantined and (geom is null or not ST_IsValid(geom))) as invalid_geoms,
    (select count(*)::int from staging.asgs_geography where not is_quarantined and geography_code is null) as null_codes,
    (select count(*)::int from (select source_geography_type, target_geography_type, source_geography_code from staging.asgs_correspondence where not is_quarantined group by 1,2,3 having abs(sum(ratio)-1.0) > ${WEIGHT_TOL}) w) as weight_violations,
    (select count(*)::int from staging.asgs_geography where is_quarantined) as staging_quarantined_geo,
    (select count(*)::int from staging.asgs_correspondence where is_quarantined) as staging_quarantined_corr`);
  report.gates_before = { counts_match_approved_snapshot: true, ...pre };
  console.log("\nPre-promotion gates:");
  console.log(`  staging counts match approved snapshot: yes`);
  console.log(`  duplicate codes: ${pre.dup_codes} | invalid geoms: ${pre.invalid_geoms} | null codes: ${pre.null_codes} | weight violations: ${pre.weight_violations}`);
  if (pre.dup_codes || pre.invalid_geoms || pre.null_codes || pre.weight_violations) fail("pre-promotion gates failed (hard stop)");
  console.log(`  special-purpose rows preserved in staging (not promoted, no geometry invented): ${pre.staging_quarantined_geo} geography, ${pre.staging_quarantined_corr} correspondence`);

  if (!EXECUTE) {
    console.log("\nDry run: gates PASSED. Planned actions:");
    console.log("  1. upsert 9 core.dim_geography_version rows (one per type, ASGS3_2021)");
    console.log("  2. upsert 83,241 non-quarantined areas into core.dim_geography (geom 4326, centroid/area, is_current)");
    console.log("  3. second pass: parent_geography_id within SA1->SA2->SA3->SA4->GCCSA->STATE, verified by join");
    console.log("  4. insert 'contains' hierarchy rows + derived LGA/SAL->STATE (POA->STATE not derivable: postal areas cross borders)");
    console.log("  5. insert 6 correspondence pairs into core.bridge_geography_correspondence (area weights, methods preserved)");
    console.log("  6. post-gates inside the same transaction; rollback on any failure");
    console.log("\nNo changes made. Use --execute to promote.");
    process.exit(0);
  }

  // ── Promotion (single transaction; rollback on any gate failure) ───────
  await client.query("begin");

  // D2a: one dim_geography_version row per type.
  for (const t of Object.keys(EXPECTED_GEO)) {
    await client.query(
      `insert into core.dim_geography_version (geography_version_id, geography_type, boundary_version, source_id, valid_from, valid_to, notes)
       values ($1,$2,$3,'abs_asgs',$4,null,'ASGS Edition 3 (July 2021 - June 2026); loaded from official ABS digital boundary files')
       on conflict (geography_version_id) do nothing`,
      [`${t}_${BV}`, t, BV, VALID_FROM]
    );
  }

  // D2b: dim_geography upsert. SA1s have no published name — code stands in
  // (documented); area preserved from ABS, computed from geometry only when
  // absent; centroid always computed from geometry (never trusted).
  const dimRes = await client.query(`
    insert into core.dim_geography
      (geography_id, geography_type, geography_code, geography_name, state_code, state_name,
       parent_geography_id, boundary_version, valid_from, valid_to, area_square_km,
       centroid_lat, centroid_lon, is_current, geom)
    select geography_type||'_'||geography_code||'_'||boundary_version,
           geography_type, geography_code,
           coalesce(geography_name, geography_code),
           state_code, state_name,
           null, boundary_version, date '${VALID_FROM}', null,
           coalesce(area_square_km, round((ST_Area(geom::geography)/1e6)::numeric, 4)),
           round(ST_Y(ST_Centroid(geom))::numeric, 7), round(ST_X(ST_Centroid(geom))::numeric, 7),
           true, geom
    from staging.asgs_geography
    where not is_quarantined
    on conflict (geography_type, geography_code, boundary_version) do update
      set geography_name=excluded.geography_name, state_code=excluded.state_code,
          state_name=excluded.state_name, area_square_km=excluded.area_square_km,
          centroid_lat=excluded.centroid_lat, centroid_lon=excluded.centroid_lon,
          geom=excluded.geom, is_current=true`);
  report.promoted.dim_geography = dimRes.rowCount;
  console.log(`\n  dim_geography: ${dimRes.rowCount} rows upserted`);

  // D2c: parent pointers, strict hierarchy only, verified by join (a parent
  // code that is not itself in core stays NULL — never invented).
  let parentTotal = 0;
  for (const [child, parent] of Object.entries(PARENT_TYPE)) {
    const r = await client.query(
      `update core.dim_geography d
       set parent_geography_id = p.geography_id
       from staging.asgs_geography s
       join core.dim_geography p
         on p.geography_type = $2 and p.geography_code = s.parent_code and p.boundary_version = s.boundary_version
       where not s.is_quarantined and s.geography_type = $1
         and d.geography_id = s.geography_type||'_'||s.geography_code||'_'||s.boundary_version
         and d.parent_geography_id is distinct from p.geography_id`,
      [child, parent]
    );
    parentTotal += r.rowCount;
  }
  report.promoted.parent_pointers = parentTotal;
  console.log(`  parent pointers set (join-verified): ${parentTotal}`);

  // D3: containment bridge. Hierarchy rows come from the verified parent
  // pointers; LGA/SAL -> STATE derived from the ABS STE_CODE21 field carried
  // in staging.state_code. POA -> STATE deliberately absent (cross-border).
  const relHier = await client.query(`
    insert into core.bridge_geography_relationship (child_geography_id, parent_geography_id, relationship_type, valid_from, valid_to)
    select d.geography_id, d.parent_geography_id, 'contains', date '${VALID_FROM}', null
    from core.dim_geography d
    where d.boundary_version = '${BV}' and d.parent_geography_id is not null
      and not exists (select 1 from core.bridge_geography_relationship b
                      where b.child_geography_id = d.geography_id
                        and b.parent_geography_id = d.parent_geography_id
                        and b.relationship_type = 'contains')`);
  const relState = await client.query(`
    insert into core.bridge_geography_relationship (child_geography_id, parent_geography_id, relationship_type, valid_from, valid_to)
    select d.geography_id, st.geography_id, 'contains', date '${VALID_FROM}', null
    from core.dim_geography d
    join core.dim_geography st
      on st.geography_type = 'STATE' and st.geography_code = d.state_code and st.boundary_version = d.boundary_version
    where d.boundary_version = '${BV}' and d.geography_type in ('LGA','SAL') and d.state_code is not null
      and not exists (select 1 from core.bridge_geography_relationship b
                      where b.child_geography_id = d.geography_id
                        and b.parent_geography_id = st.geography_id
                        and b.relationship_type = 'contains')`);
  report.promoted.relationship_hierarchy = relHier.rowCount;
  report.promoted.relationship_lga_sal_state = relState.rowCount;
  report.skipped.poa_to_state = "not derivable (postal areas cross state borders; no ABS state field) — pending, not invented";
  report.skipped.sa4_to_state_direct = "available transitively via SA4->GCCSA->STATE; direct rows not emitted to keep the bridge a strict tree";
  console.log(`  relationship rows: ${relHier.rowCount} hierarchy + ${relState.rowCount} derived LGA/SAL->STATE`);

  // D4: correspondence bridge. Only non-quarantined, non-NULL-ratio pairs
  // whose BOTH endpoints exist in core (special-purpose codes therefore
  // cannot leak in). area basis only for now: population/dwelling stay NULL.
  const corrRes = await client.query(`
    insert into core.bridge_geography_correspondence
      (source_geography_id, target_geography_id, source_geography_type, target_geography_type,
       area_weight, population_weight, dwelling_weight, preferred_weight,
       correspondence_method, correspondence_version, confidence_score, effective_from, effective_to)
    select sd.geography_id, td.geography_id, c.source_geography_type, c.target_geography_type,
           c.ratio, null, null, c.ratio,
           c.correspondence_method, c.correspondence_version,
           case c.correspondence_method when 'abs_sa1_allocation' then 0.9 else 0.8 end,
           date '${VALID_FROM}', null
    from staging.asgs_correspondence c
    join core.dim_geography sd
      on sd.geography_type = c.source_geography_type and sd.geography_code = c.source_geography_code and sd.boundary_version = c.boundary_version
    join core.dim_geography td
      on td.geography_type = c.target_geography_type and td.geography_code = c.target_geography_code and td.boundary_version = c.boundary_version
    where not c.is_quarantined and c.ratio is not null
      and not exists (select 1 from core.bridge_geography_correspondence b
                      where b.source_geography_id = sd.geography_id
                        and b.target_geography_id = td.geography_id
                        and b.correspondence_method = c.correspondence_method
                        and b.correspondence_version = c.correspondence_version)`);
  const [corrSkipped] = await q(`
    select count(*)::int as n from staging.asgs_correspondence c
    left join core.dim_geography sd
      on sd.geography_type = c.source_geography_type and sd.geography_code = c.source_geography_code and sd.boundary_version = c.boundary_version
    left join core.dim_geography td
      on td.geography_type = c.target_geography_type and td.geography_code = c.target_geography_code and td.boundary_version = c.boundary_version
    where not c.is_quarantined and c.ratio is not null and (sd.geography_id is null or td.geography_id is null)`);
  report.promoted.correspondence = corrRes.rowCount;
  report.skipped.correspondence_endpoint_not_in_core = corrSkipped.n;
  console.log(`  correspondence rows: ${corrRes.rowCount} promoted, ${corrSkipped.n} skipped (endpoint not in core)`);

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

  // Gate results into meta (promotion stage marker in details).
  const gateRows = [
    ["no_duplicate_grain", "blocker", post.dup_codes],
    ["geometry_valid", "blocker", post.invalid_geoms],
    ["nulls_not_zero", "blocker", post.null_codes],
    ["geo_code_valid", "blocker", post.orphan_refs],
    ["weights_reconcile", "blocker", post.weight_violations],
  ];
  for (const [rule, severity, failed] of gateRows) {
    await client.query(
      `insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details)
       values ($1,$2,$3,$4,$5)`,
      [rule, severity, failed === 0 ? "passed" : "failed", failed, JSON.stringify({ stage: "core_promotion", boundary_version: BV })]
    );
  }

  await client.query("commit");
  console.log("\nPromotion COMMITTED (branch only; production untouched).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  await client.end();
  fail(`promotion aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

// ── Post-commit summary for the report ────────────────────────────────────
const [summary] = await q(`select
  (select json_object_agg(t, n) from (select geography_type t, count(*)::int n from core.dim_geography group by 1) x) as dim_by_type,
  (select count(*)::int from core.dim_geography) as dim_total,
  (select count(*)::int from core.dim_geography_version) as versions,
  (select json_object_agg(t, n) from (select relationship_type t, count(*)::int n from core.bridge_geography_relationship group by 1) x) as rel_by_type,
  (select count(*)::int from core.bridge_geography_relationship) as rel_total,
  (select json_object_agg(p, n) from (select source_geography_type||'->'||target_geography_type p, count(*)::int n from core.bridge_geography_correspondence group by 1) x) as corr_by_pair,
  (select count(*)::int from core.bridge_geography_correspondence) as corr_total,
  (select json_agg(distinct ST_SRID(geom)) from core.dim_geography where geom is not null) as srids`);
report.core_state = summary;
await client.end();

fs.writeFileSync(rel("warehouse", "reports", "asgs_core_promotion_run.json"), JSON.stringify(report, null, 2) + "\n");
console.log("\nRun details written: warehouse/reports/asgs_core_promotion_run.json");
console.log(`core.dim_geography: ${summary.dim_total} | relationships: ${summary.rel_total} | correspondences: ${summary.corr_total}`);
