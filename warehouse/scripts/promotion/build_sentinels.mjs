#!/usr/bin/env node
/**
 * Build the deterministic cross-state sentinel pack: load the EXACT pinned
 * SA+VIC payload into an in-memory real-PostgreSQL (PGlite) with migrations 056
 * (tables/view) + 057 (consumer RPC), then capture the RPC output for a fixed set
 * of representative geographies (SA complete, SA partial, VIC bedroom-specific)
 * plus the Calderwood contextual-postcode regression. The pack is the golden
 * fixture for deterministic replay of the consumer path.
 *
 * SAFETY: local only (PGlite in-memory) — no network, no remote DB, no write to
 * any Supabase project. Reads the gitignored merged payload; emits a committed,
 * checksummed sentinel pack (aggregate values only — no PII, no internal ids).
 *
 * Usage:
 *   node warehouse/scripts/promotion/build_sentinels.mjs \
 *     --payload warehouse/data/local/v4a_payload/merged_payload.json \
 *     --out warehouse/reports/v4a/cross_state_sentinels.json
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PGlite } from "@electric-sql/pglite";
import { INSERT_OBSERVATION, INSERT_MART, observationValues } from "./officialPromotion.mjs";

const arg = (name, def) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const PAYLOAD_PATH = arg("--payload", "warehouse/data/local/v4a_payload/merged_payload.json");
const OUT_PATH = arg("--out", "warehouse/reports/v4a/cross_state_sentinels.json");
const CALDERWOOD_POSTCODE = "POA_2527_ASGS3_2021";

async function main() {
  const payload = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8"));
  const rows = payload.rows;
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(fs.readFileSync("supabase/migrations/056_official_suburb_metrics.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/057_official_suburb_metrics_consumer_rpc.sql", "utf8"));
  for (const r of rows) await db.query(INSERT_OBSERVATION, observationValues(r));
  for (const r of rows) await db.query(INSERT_MART, [r.id]);

  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const rpc = async (geo) => q(`select metric, property_type, bedroom_group, value::float8 value, unit, period_end, status, is_derived, derived_from, source_id from public.get_official_suburb_metrics_v1($1) order by metric, property_type, bedroom_group`, [geo]);

  // Deterministic sentinel selection (lowest geography_id in each category):
  // SA complete = SA suburb (SAL_4*) that has house price + rent + a derived yield.
  const saComplete = (await q(`
    select o.geography_id from core.official_observation o
    where o.geography_id like 'SAL_4%' and o.metric='gross_yield'
    order by o.geography_id limit 1`))[0]?.geography_id;
  // SA partial = SA suburb (SAL_4*) with rent but no house price (=> no yield).
  const saPartial = (await q(`
    select v.geography_id from mart.official_suburb_metric v
    where v.geography_id like 'SAL_4%' and v.metric='median_rent'
      and not exists (select 1 from mart.official_suburb_metric x where x.geography_id=v.geography_id and x.metric='median_house_price')
    order by v.geography_id limit 1`))[0]?.geography_id;
  // VIC = VIC suburb (SAL_2*) with a bedroom-specific rent.
  const vic = (await q(`
    select geography_id from mart.official_suburb_metric
    where geography_id like 'SAL_2%' and metric='median_rent' and bedroom_group <> 'all'
    order by geography_id limit 1`))[0]?.geography_id;

  const sentinels = [
    { id: "sa_complete", geography_id: saComplete, expectation: "SA suburb with direct house price + rent AND a derived gross_yield", rpc: await rpc(saComplete) },
    { id: "sa_partial", geography_id: saPartial, expectation: "SA suburb with direct rent only; NO house price and NO yield", rpc: await rpc(saPartial) },
    { id: "vic_bedroom_specific", geography_id: vic, expectation: "VIC suburb with direct bedroom-specific rent only; NO yield", rpc: await rpc(vic) },
    { id: "calderwood_contextual_postcode", geography_id: CALDERWOOD_POSTCODE, expectation: "contextual postcode row is never returned; no false suburb yield", rpc: await rpc(CALDERWOOD_POSTCODE) },
  ];

  // Invariants baked into the pack (fail closed if a sentinel violates them).
  const complete = sentinels[0].rpc, partial = sentinels[1].rpc, vicR = sentinels[2].rpc, cald = sentinels[3].rpc;
  const invariants = {
    sa_complete_has_direct_price_rent_and_derived_yield:
      complete.some((r) => r.metric === "median_house_price" && r.status === "direct") &&
      complete.some((r) => r.metric === "median_rent" && r.status === "direct") &&
      complete.some((r) => r.metric === "gross_yield" && r.is_derived === true),
    sa_partial_rent_only_no_yield:
      partial.some((r) => r.metric === "median_rent") &&
      !partial.some((r) => r.metric === "median_house_price") &&
      !partial.some((r) => r.metric === "gross_yield"),
    vic_direct_bedroom_specific_rent_only:
      vicR.length > 0 && vicR.every((r) => r.metric === "median_rent" && r.status === "direct") &&
      vicR.some((r) => r.bedroom_group !== "all") && !vicR.some((r) => r.metric === "gross_yield"),
    calderwood_postcode_returns_nothing: cald.length === 0,
  };
  const allOk = Object.values(invariants).every(Boolean);
  if (!allOk) { console.error("FAIL CLOSED: sentinel invariant violated", JSON.stringify(invariants)); process.exit(1); }

  const body = { as_of: payload.as_of, payload_sha256: payload.payload_sha256, sentinels, invariants };
  const sentinels_sha256 = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const pack = { generated_note: "Deterministic cross-state sentinel pack — golden RPC output for representative geographies, replayed from the pinned payload through migrations 056+057. Aggregate values only; no PII / no internal ids.", ...body, sentinels_sha256 };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(pack, null, 2));

  console.log(`sentinels: SA complete=${saComplete}  SA partial=${saPartial}  VIC=${vic}`);
  console.log(`invariants: ${JSON.stringify(invariants)}`);
  console.log(`sentinels_sha256: ${sentinels_sha256}`);
  console.log(`pack -> ${OUT_PATH}`);
}
main();
