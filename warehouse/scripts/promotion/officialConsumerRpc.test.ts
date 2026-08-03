import { describe, expect, it } from "vitest";
import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { INSERT_OBSERVATION, INSERT_MART, PAYLOAD, observationValues } from "./officialPromotion.mjs";

const MIGRATION_056 = fs.readFileSync("supabase/migrations/056_official_suburb_metrics.sql", "utf8");
const MIGRATION_057 = fs.readFileSync("supabase/migrations/057_official_suburb_metrics_consumer_rpc.sql", "utf8");

async function loadedDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role other_role;");
  await db.exec(MIGRATION_056);
  await db.exec(MIGRATION_057);
  for (const r of PAYLOAD) await db.query(INSERT_OBSERVATION, observationValues(r));
  for (const r of PAYLOAD) await db.query(INSERT_MART, [r.id]);
  return db;
}
const rpc = async (db: PGlite, geo: string) =>
  (await db.query<Record<string, unknown>>(`select * from public.get_official_suburb_metrics_v1($1)`, [geo])).rows;
const bool = async (db: PGlite, sql: string) => (await db.query<{ ok: boolean }>(sql)).rows[0].ok;

describe("official consumer RPC (migration 057) — safe direct+derived exposure via PGlite", () => {
  it("exposes a SA complete profile: direct price + rent AND the derived yield, with source/period/freshness/status", async () => {
    const db = await loadedDb();
    const rows = await rpc(db, "SAL_40085_ASGS3_2021"); // Belair
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric as string, r]));
    expect(Object.keys(byMetric).sort()).toEqual(["gross_yield", "median_house_price", "median_rent"]);
    // derived yield is exposed here (the direct-only view hides it)
    const y = byMetric["gross_yield"];
    expect(y.status).toBe("derived");
    expect(y.is_derived).toBe(true);
    expect(y.derived_from).toBe("gross_yield@2");
    // every returned row carries source, period window, freshness and status
    for (const r of rows) {
      expect(r.source_id).toBeTruthy();
      expect(r.period_end).toBeTruthy();
      expect(r.retrieved_at).toBeTruthy(); // freshness
      expect(["direct", "derived"]).toContain(r.status);
      expect(r.attribution).toBeTruthy();
    }
  });

  it("never returns internal lineage ids / raw checksums (no schema leak in the projection)", async () => {
    const db = await loadedDb();
    const rows = await rpc(db, "SAL_40085_ASGS3_2021");
    const cols = new Set(Object.keys(rows[0]));
    for (const forbidden of ["observation_id", "price_observation_id", "rent_observation_id", "resource_sha256", "quality_status"]) {
      expect(cols.has(forbidden)).toBe(false);
    }
  });

  it("the derived yield is exposed via the RPC but NOT via the direct-only 056 view", async () => {
    const db = await loadedDb();
    const rpcYield = (await rpc(db, "SAL_40085_ASGS3_2021")).filter((r) => r.metric === "gross_yield");
    expect(rpcYield.length).toBe(1);
    const viewYield = (await db.query(`select 1 from public.v_official_suburb_metric_v1 where geography_id='SAL_40085_ASGS3_2021' and metric='gross_yield'`)).rows;
    expect(viewYield.length).toBe(0); // view is direct-only
  });

  it("VIC exposes only its supported direct bedroom-specific rent (no yield)", async () => {
    const db = await loadedDb();
    const rows = await rpc(db, "SAL_20001_ASGS3_2021"); // Armadale VIC
    expect(rows.length).toBe(1);
    expect(rows[0].metric).toBe("median_rent");
    expect(rows[0].status).toBe("direct");
    expect(rows[0].bedroom_group).toBe("2"); // bedroom-specific
    expect(rows.some((r) => r.metric === "gross_yield")).toBe(false);
  });

  it("Calderwood rule: a contextual postcode row is never returned by the consumer RPC, and yields no suburb metric", async () => {
    const db = await loadedDb();
    const poa = await rpc(db, "POA_2527_ASGS3_2021"); // contextual rent
    expect(poa.length).toBe(0); // contextual never exposed
    // and there is no derived yield anywhere built from that postcode rent
    const anyPoaYield = (await db.query(`select 1 from core.official_observation where metric='gross_yield' and (rent_observation_id like '%postcode%' or geography_id like 'POA_%')`)).rows;
    expect(anyPoaYield.length).toBe(0);
  });

  it("least privilege: anon/authenticated may EXECUTE the RPC but have NO direct grant on core/mart", async () => {
    const db = await loadedDb();
    for (const role of ["anon", "authenticated"]) {
      expect(await bool(db, `select has_function_privilege('${role}','public.get_official_suburb_metrics_v1(text)','EXECUTE') ok`)).toBe(true);
      expect(await bool(db, `select has_table_privilege('${role}','core.official_observation','SELECT') ok`)).toBe(false);
      expect(await bool(db, `select has_table_privilege('${role}','mart.official_suburb_metric','SELECT') ok`)).toBe(false);
    }
    // a role with no explicit grant cannot execute (EXECUTE was revoked from PUBLIC)
    expect(await bool(db, `select has_function_privilege('other_role','public.get_official_suburb_metrics_v1(text)','EXECUTE') ok`)).toBe(false);
  });
});
