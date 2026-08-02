import { describe, expect, it } from "vitest";
import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { INSERT_OBSERVATION, INSERT_MART, PAYLOAD, observationValues } from "./officialPromotion.mjs";

/**
 * Full Production release-package rehearsal (real PostgreSQL via PGlite): applies
 * the release migrations IN ORDER — 055 (widen get_market_snapshot_v2) → 056
 * (official tables/view) → 057 (official consumer RPC) — loads the candidate,
 * runs the consumer + security checks, and proves a clean rollback that leaves
 * the pre-existing (055-era) objects intact. No remote write.
 */
const M055 = fs.readFileSync("supabase/migrations/055_widen_get_market_snapshot_v2.sql", "utf8");
const M056 = fs.readFileSync("supabase/migrations/056_official_suburb_metrics.sql", "utf8");
const M057 = fs.readFileSync("supabase/migrations/057_official_suburb_metrics_consumer_rpc.sql", "utf8");

// 055 is a CREATE OR REPLACE whose SQL body references mart.suburb_market_snapshot
// and mart.postcode_market_snapshot. Its RETURNS TABLE signature is the exact
// column contract of those tables, so we parse it to build correctly-typed stubs
// (no transcription drift) — this is the 052-era base the release replaces.
function snapshotColumns(): string {
  const noComments = M055.replace(/--[^\n]*\n/g, "\n");
  const m = noComments.match(/RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE/i);
  if (!m) throw new Error("could not parse RETURNS TABLE from 055");
  const cols = m[1].split(",").map((c) => c.trim()).filter(Boolean).map((c) => {
    const sp = c.indexOf(" ");
    return `${c.slice(0, sp)} ${c.slice(sp + 1)}`;
  });
  return cols.join(", ") + ", dwelling_type text";
}

async function baseDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  const cols = snapshotColumns();
  await db.exec(`create schema if not exists mart;`);
  await db.exec(`create table mart.suburb_market_snapshot (${cols});`);
  await db.exec(`create table mart.postcode_market_snapshot (${cols});`);
  return db;
}

const count = async (db: PGlite, sql: string) => Number((await db.query<{ c: number }>(sql)).rows[0].c);

describe("Production release package rehearsal (055 → 056 → 057, real PostgreSQL via PGlite)", () => {
  it("applies all three migrations IN ORDER, then loads + exposes the candidate safely", async () => {
    const db = await baseDb();
    // in-order apply
    await db.exec(M055);
    await db.exec(M056);
    await db.exec(M057);

    // 055 widened snapshot RPC present; 056 objects + 057 function present
    expect(await count(db, `select count(*)::int c from information_schema.routines where routine_name='get_market_snapshot_v2'`)).toBe(1);
    expect(await count(db, `select count(*)::int c from information_schema.tables where table_schema='core' and table_name='official_observation'`)).toBe(1);
    expect(await count(db, `select count(*)::int c from information_schema.routines where routine_name='get_official_suburb_metrics_v1'`)).toBe(1);

    // load the candidate
    for (const r of PAYLOAD) await db.query(INSERT_OBSERVATION, observationValues(r));
    for (const r of PAYLOAD) await db.query(INSERT_MART, [r.id]);

    // consumer path: RPC exposes the derived yield; view stays direct-only
    const yieldViaRpc = (await db.query(`select 1 from public.get_official_suburb_metrics_v1('SAL_40085_ASGS3_2021') where metric='gross_yield'`)).rows;
    expect(yieldViaRpc.length).toBe(1);
    const yieldViaView = (await db.query(`select 1 from public.v_official_suburb_metric_v1 where geography_id='SAL_40085_ASGS3_2021' and metric='gross_yield'`)).rows;
    expect(yieldViaView.length).toBe(0);

    // security: anon EXECUTEs the RPC, has no table grants on internal schemas
    const ok = async (sql: string) => (await db.query<{ ok: boolean }>(sql)).rows[0].ok;
    expect(await ok(`select has_function_privilege('anon','public.get_official_suburb_metrics_v1(text)','EXECUTE') ok`)).toBe(true);
    expect(await ok(`select has_table_privilege('anon','core.official_observation','SELECT') ok`)).toBe(false);
    expect(await ok(`select has_table_privilege('anon','mart.official_suburb_metric','SELECT') ok`)).toBe(false);
  });

  it("rolls back cleanly: dropping 057+056 objects leaves the pre-existing 055-era objects intact", async () => {
    const db = await baseDb();
    await db.exec(M055);
    await db.exec(M056);
    await db.exec(M057);
    for (const r of PAYLOAD) await db.query(INSERT_OBSERVATION, observationValues(r));

    // Rollback of the official release delta (additive-only → simple drops).
    await db.exec(`
      drop function if exists public.get_official_suburb_metrics_v1(text);
      drop view if exists public.v_official_suburb_metric_v1;
      drop table if exists mart.official_suburb_metric;
      drop table if exists core.official_observation;`);

    expect(await count(db, `select count(*)::int c from information_schema.routines where routine_name='get_official_suburb_metrics_v1'`)).toBe(0);
    expect(await count(db, `select count(*)::int c from information_schema.tables where table_name='official_observation'`)).toBe(0);
    expect(await count(db, `select count(*)::int c from information_schema.views where table_name='v_official_suburb_metric_v1'`)).toBe(0);
    // pre-existing objects untouched by the rollback
    expect(await count(db, `select count(*)::int c from information_schema.routines where routine_name='get_market_snapshot_v2'`)).toBe(1);
    expect(await count(db, `select count(*)::int c from information_schema.tables where table_schema='mart' and table_name='suburb_market_snapshot'`)).toBe(1);
  });
});
