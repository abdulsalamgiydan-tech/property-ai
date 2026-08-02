import { describe, expect, it } from "vitest";
import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { INSERT_OBSERVATION, INSERT_MART, POSTLOAD_VALIDATIONS, PAYLOAD, observationValues } from "./officialPromotion.mjs";
import { qualifyYield } from "../../../lib/warehouse/yieldLineage.mjs";

const MIGRATION = fs.readFileSync("supabase/migrations/056_official_suburb_metrics.sql", "utf8");

type Row = (typeof PAYLOAD)[number];
async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;"); // Supabase roles the migration grants to
  await db.exec(MIGRATION);
  return db;
}
async function load(db: PGlite, rows: Row[]) {
  for (const r of rows) await db.query(INSERT_OBSERVATION, observationValues(r));
  for (const r of rows) await db.query(INSERT_MART, [r.id]);
}
const count = async (db: PGlite, sql: string) => Number(Object.values((await db.query(sql)).rows[0] as Record<string, unknown>)[0]);

describe("SA/VIC promotion rehearsal (migration 056, real PostgreSQL via PGlite)", () => {
  it("1. applies the additive migration on a BLANK database (tables + view + least-privilege grant)", async () => {
    const db = await freshDb();
    expect(await count(db, `select count(*)::int n from information_schema.tables where table_schema='core' and table_name='official_observation'`)).toBe(1);
    expect(await count(db, `select count(*)::int n from information_schema.views where table_name='v_official_suburb_metric_v1'`)).toBe(1);
    // anon has SELECT on the view, NOT on the internal core table
    expect(await count(db, `select count(*)::int n from information_schema.role_table_grants where grantee='anon' and table_name='v_official_suburb_metric_v1' and privilege_type='SELECT'`)).toBe(1);
    expect(await count(db, `select count(*)::int n from information_schema.role_table_grants where grantee='anon' and table_name='official_observation'`)).toBe(0);
  });

  it("2. applies additively on a CURRENT-schema database without altering existing objects", async () => {
    const db = new PGlite();
    await db.exec("create role anon; create role authenticated;");
    await db.exec(`create schema core; create schema mart; create table core.existing_thing(id int); insert into core.existing_thing values (1);`);
    await db.exec(MIGRATION); // additive
    expect(await count(db, `select count(*)::int n from core.existing_thing`)).toBe(1); // untouched
    expect(await count(db, `select count(*)::int n from information_schema.tables where table_name='official_observation'`)).toBe(1);
  });

  it("3. loads the candidate; all post-load validations report 0 violations", async () => {
    const db = await freshDb();
    await load(db, PAYLOAD);
    expect(await count(db, `select count(*)::int n from core.official_observation`)).toBe(PAYLOAD.length);
    for (const v of POSTLOAD_VALIDATIONS) expect(await count(db, v.sql), v.name).toBe(0);
  });

  it("4. is idempotent — a second identical load changes nothing", async () => {
    const db = await freshDb();
    await load(db, PAYLOAD);
    const before = await count(db, `select count(*)::int n from mart.official_suburb_metric`);
    await load(db, PAYLOAD);
    expect(await count(db, `select count(*)::int n from mart.official_suburb_metric`)).toBe(before);
  });

  it("5. is order-independent — a shuffled load yields the same final state", async () => {
    const a = await freshDb(); await load(a, PAYLOAD);
    const b = await freshDb(); await load(b, [...PAYLOAD].reverse());
    const dump = async (db: PGlite) => (await db.query(`select geography_id, metric, property_type, bedroom_group, value from mart.official_suburb_metric order by 1,2,3,4`)).rows;
    expect(await dump(b)).toEqual(await dump(a));
  });

  it("6. a mid-load failure rolls back transactionally (no partial state)", async () => {
    const db = await freshDb();
    try {
      await db.exec("begin");
      await db.query(INSERT_OBSERVATION, observationValues(PAYLOAD[0]));
      await db.exec(`insert into core.official_observation (observation_id) values ('broken')`); // NOT NULL violations -> error
      await db.exec("commit");
    } catch { await db.exec("rollback"); }
    expect(await count(db, `select count(*)::int n from core.official_observation`)).toBe(0);
  });

  it("7. an existing id with DIFFERENT content fails closed (never overwritten)", async () => {
    const db = await freshDb();
    await db.query(INSERT_OBSERVATION, observationValues(PAYLOAD[0]));
    const tampered = { ...PAYLOAD[0], val: 9999999 };
    await db.query(INSERT_OBSERVATION, observationValues(tampered)); // on conflict do nothing
    const v = Number((await db.query<{ value: number }>(`select value from core.official_observation where observation_id='${PAYLOAD[0].id}'`)).rows[0].value);
    expect(v).toBe(PAYLOAD[0].val); // original kept, not overwritten
  });

  it("8. the 2 SA house yields requalify through the FULL JS contract (parity with the stored derived rows)", () => {
    const opts = { minSample: 10, asOf: "2026-08-02", maxEndLagDays: 400, freshnessSlaDays: 400, maxWindowRatio: 2 };
    const ev = (priceId: string, rentId: string) => {
      const p = PAYLOAD.find((x) => x.id === priceId)!, r = PAYLOAD.find((x) => x.id === rentId)!;
      const mk = (o: Row, src: string) => ({ observationId: o.id, observationVerified: true, geographyId: o.geo, asgsVersion: "ASGS3_2021", geographyLevel: "suburb", directStatus: "direct", sourceContract: "accepted", provenanceVerified: true, sourceId: src, qualityStatus: "passed", propertyType: "house", bedroomGroup: "all", aggregateBedroomLegitimate: true, sampleSize: o.n, periodStart: o.ps, periodEnd: o.pe, value: o.val, quarantined: false });
      return { price: mk(p, "sa_metro_median_house_sales"), rent: mk(r, "sa_private_rental_report") };
    };
    expect(qualifyYield(ev("obs_sa_belair_price", "obs_sa_belair_rent"), opts).qualified).toBe(true);
    expect(qualifyYield(ev("obs_sa_stirling_price", "obs_sa_stirling_rent"), opts).qualified).toBe(true);
  });

  it("9. contextual (postcode 2527) rent never reaches the direct suburb view — no suburb yield from postcode rent", async () => {
    const db = await freshDb();
    await load(db, PAYLOAD);
    expect(await count(db, `select count(*)::int n from v_official_suburb_metric_v1 where geography_id like 'POA_%'`)).toBe(0);
    expect(await count(db, `select count(*)::int n from v_official_suburb_metric_v1 where status='contextual'`)).toBe(0);
  });
});
