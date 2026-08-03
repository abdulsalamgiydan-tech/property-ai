#!/usr/bin/env node
/**
 * Emit COMPACT idempotent SQL that loads the pinned SA+VIC official-metrics
 * payload into core.official_observation + mart.official_suburb_metric.
 *
 * The 22-column contract is produced by officialPromotion.observationValues() —
 * the SAME function used for the (validated) branch load — so the loaded rows are
 * identical by construction. To keep the SQL small enough to run via the Supabase
 * MCP, the 5 constant columns (geography_level, asgs_version, quality_status,
 * licence, retrieved_at) are inlined once and the (source_id, resource_sha256,
 * attribution) triples are factored into a tiny `src` CTE keyed by a short code;
 * only the varying columns are emitted per row. FAILS CLOSED unless the payload
 * SHA-256 matches the pinned checksum and the factored columns really are constant.
 *
 * Usage:
 *   node warehouse/scripts/promotion/emit_production_load_sql.mjs --batch 175
 * Verify equivalence to the plain form:
 *   node warehouse/scripts/promotion/emit_production_load_sql.mjs --verify
 */
import fs from "fs";
import path from "path";
import { observationValues } from "./officialPromotion.mjs";

const PINNED_SHA = "cbd0b269d5ffc8b31501475c612172e0844bb3b69b400362d501f52b30392326";
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PAYLOAD = arg("--payload", "warehouse/data/local/v4a_payload/merged_payload.json");
const OUTDIR = arg("--outdir", "warehouse/data/local/v4a_payload/prodload");
const BATCH = Number(arg("--batch", "175"));
const VERIFY = process.argv.includes("--verify");

// observationValues() index → column. Constants are inlined; the rest emitted.
// [0]id [1]source_id [2]sha [3]geo [4]'suburb' [5]'ASGS3_2021' [6]metric [7]pt
// [8]bg [9]val [10]unit [11]n [12]ps [13]pe [14]status [15]'passed' [16]formula
// [17]price [18]rent [19]'CC BY 4.0' [20]attribution [21]retrieved_at
const CORE_COLS = ["observation_id", "source_id", "resource_sha256", "geography_id", "geography_level",
  "asgs_version", "metric", "property_type", "bedroom_group", "value", "unit", "sample_size",
  "period_start", "period_end", "status", "quality_status", "formula_version",
  "price_observation_id", "rent_observation_id", "licence", "attribution", "retrieved_at"];

function lit(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function build() {
  const payload = JSON.parse(fs.readFileSync(PAYLOAD, "utf8"));
  if (payload.payload_sha256 !== PINNED_SHA) { console.error(`FAIL CLOSED: sha ${payload.payload_sha256} != ${PINNED_SHA}`); process.exit(1); }
  const rows = payload.rows;
  if (rows.length !== 689) { console.error(`FAIL CLOSED: ${rows.length} != 689 rows`); process.exit(1); }

  const vals = rows.map(observationValues);
  // assert the factored columns are constant
  const CONST = { 4: "suburb", 5: "ASGS3_2021", 15: "passed", 19: "CC BY 4.0", 21: "2026-08-02T00:00:00Z" };
  for (const v of vals) for (const [i, expected] of Object.entries(CONST)) {
    if (v[i] !== expected) { console.error(`FAIL CLOSED: col ${i} not constant (${v[i]})`); process.exit(1); }
  }
  // code table for (source_id, sha, attribution)
  const codeByKey = new Map(); const src = [];
  const codeOf = (v) => {
    const key = v[1] + "|" + v[2] + "|" + v[20];
    if (!codeByKey.has(key)) { const c = "s" + src.length; codeByKey.set(key, c); src.push({ c, source_id: v[1], sha: v[2], attribution: v[20] }); }
    return codeByKey.get(key);
  };
  const compactRows = vals.map((v) => ({
    tuple: [v[0], codeOf(v), v[3], v[6], v[7], v[8], v[9], v[10], v[11], v[12], v[13], v[14], v[16], v[17], v[18]],
  }));
  return { src, compactRows, vals };
}

const ROW_COLS = "(observation_id, code, geography_id, metric, property_type, bedroom_group, value, unit, sample_size, period_start, period_end, status, formula_version, price_observation_id, rent_observation_id)";

function srcCte(src) {
  return `with src(code, source_id, resource_sha256, attribution) as (values\n` +
    src.map((s) => `  (${lit(s.c)}, ${lit(s.source_id)}, ${lit(s.sha)}, ${lit(s.attribution)})`).join(",\n") + `\n)`;
}

// One self-contained idempotent INSERT for a chunk of compact rows.
export function batchSql(src, chunk) {
  const rowsCte = `values\n` + chunk.map((r) => "  (" + r.tuple.map(lit).join(",") + ")").join(",\n");
  return `${srcCte(src)}\n` +
    `insert into core.official_observation (${CORE_COLS.join(", ")})\n` +
    `select r.observation_id, s.source_id, s.resource_sha256, r.geography_id, 'suburb', 'ASGS3_2021',\n` +
    `       r.metric, r.property_type, r.bedroom_group, r.value, r.unit, r.sample_size,\n` +
    `       r.period_start::date, r.period_end::date, r.status, 'passed', r.formula_version,\n` +
    `       r.price_observation_id, r.rent_observation_id, 'CC BY 4.0', s.attribution, '2026-08-02T00:00:00Z'::timestamptz\n` +
    `from (${rowsCte}) as r${ROW_COLS} join src s on s.code = r.code\n` +
    `on conflict (observation_id) do nothing;`;
}

export const MART_SQL =
  `insert into mart.official_suburb_metric (geography_id, metric, property_type, bedroom_group, value, unit, sample_size, period_end, status, source_id, attribution)\n` +
  `select geography_id, metric, property_type, bedroom_group, value, unit, sample_size, period_end, status, source_id, attribution\n` +
  `from core.official_observation where status in ('direct','derived')\n` +
  `on conflict (geography_id, metric, property_type, bedroom_group, period_end) do nothing;\n`;

function main() {
  if (VERIFY) return; // handled by the test harness
  const { src, compactRows } = build();
  fs.rmSync(OUTDIR, { recursive: true, force: true });
  fs.mkdirSync(OUTDIR, { recursive: true });
  let part = 0;
  for (let i = 0; i < compactRows.length; i += BATCH) {
    part += 1;
    fs.writeFileSync(path.join(OUTDIR, `part${String(part).padStart(2, "0")}.sql`), batchSql(src, compactRows.slice(i, i + BATCH)));
  }
  fs.writeFileSync(path.join(OUTDIR, "mart.sql"), MART_SQL);
  const bytes = fs.readdirSync(OUTDIR).reduce((a, f) => a + fs.statSync(path.join(OUTDIR, f)).size, 0);
  console.log(`rows=${compactRows.length} src_codes=${src.length} core_parts=${part} total_bytes=${bytes} -> ${OUTDIR}`);
}

export { build, CORE_COLS };
main();
