import { describe, expect, it } from "vitest";
import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { INSERT_OBSERVATION, INSERT_MART, POSTLOAD_VALIDATIONS, PAYLOAD, GROWTH_PAYLOAD, observationValues } from "./officialPromotion.mjs";

/**
 * Signed price_growth_12m assurance (migration 058, real PostgreSQL via PGlite).
 * Proves the metric-aware value invariant: signed growth (negative/zero/positive)
 * is accepted while prices/rents/volumes/yields stay strictly positive; the frozen
 * 056-era rows are unaffected; the consumer RPC exposes growth safely; and
 * idempotency/conflict/rollback/least-privilege all still hold.
 */
const M056 = fs.readFileSync("supabase/migrations/056_official_suburb_metrics.sql", "utf8");
const M057 = fs.readFileSync("supabase/migrations/057_official_suburb_metrics_consumer_rpc.sql", "utf8");
const M058 = fs.readFileSync("supabase/migrations/058_signed_price_growth_constraint.sql", "utf8");

type Row = (typeof PAYLOAD)[number];
async function db056_057_058(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role other_role;");
  await db.exec(M056);
  await db.exec(M057);
  await db.exec(M058); // metric-aware constraint replaces value>0
  return db;
}
async function load(db: PGlite, rows: Row[]) {
  for (const r of rows) await db.query(INSERT_OBSERVATION, observationValues(r));
  for (const r of rows) await db.query(INSERT_MART, [r.id]);
}
const n = (r: { rows: unknown[] }) => Number(Object.values(r.rows[0] as Record<string, unknown>)[0]);
const count = async (db: PGlite, sql: string) => n(await db.query(sql));
const throws = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
const insertBad = (db: PGlite, over: Partial<Row> & { id: string; metric: string; val: number }) =>
  db.query(INSERT_OBSERVATION, observationValues({ src: "sa_metro_median_house_sales", sha: "x", geo: "SAL_49999_ASGS3_2021", pt: "house", bg: "all", unit: "u", n: 10, ps: null, pe: "2026-06-30", status: "direct", ...over } as Row));

describe("signed price_growth_12m rehearsal (migration 058, PGlite)", () => {
  it("accepts negative, zero AND positive growth; keeps all other metrics strictly positive", async () => {
    const db = await db056_057_058();
    await load(db, [...PAYLOAD, ...GROWTH_PAYLOAD]);
    // signed growth accepted
    expect(await count(db, `select count(*)::int c from core.official_observation where metric='price_growth_12m'`)).toBe(3);
    expect(await count(db, `select count(*)::int c from core.official_observation where metric='price_growth_12m' and value < 0`)).toBe(1);
    expect(await count(db, `select count(*)::int c from core.official_observation where metric='price_growth_12m' and value = 0`)).toBe(1);
    expect(Number((await db.query<{ value: number }>(`select value from core.official_observation where observation_id='obs_growth_neg'`)).rows[0].value)).toBe(-6.11);

    // non-positive NON-growth metrics are still rejected by the CHECK
    expect(await throws(() => insertBad(db, { id: "bad_price", metric: "median_house_price", val: -1 }))).toBe(true);
    expect(await throws(() => insertBad(db, { id: "bad_rent", metric: "median_rent", val: 0 }))).toBe(true);
    expect(await throws(() => insertBad(db, { id: "bad_vol", metric: "sales_volume", val: -5 }))).toBe(true);
    expect(await throws(() => insertBad(db, { id: "bad_yield", metric: "gross_yield", val: 0 }))).toBe(true);
    // growth OUTSIDE the documented bounds is rejected
    expect(await throws(() => insertBad(db, { id: "bad_growth_lo", metric: "price_growth_12m", val: -101 }))).toBe(true);
    expect(await throws(() => insertBad(db, { id: "bad_growth_hi", metric: "price_growth_12m", val: 1001 }))).toBe(true);
    // none of the rejected rows landed
    expect(await count(db, `select count(*)::int c from core.official_observation where observation_id like 'bad_%'`)).toBe(0);
  });

  it("metric-aware post-load validations all report 0 violations", async () => {
    const db = await db056_057_058();
    await load(db, [...PAYLOAD, ...GROWTH_PAYLOAD]);
    for (const v of POSTLOAD_VALIDATIONS) expect(await count(db, v.sql), v.name).toBe(0);
  });

  it("Production-equivalent: applying 058 over an existing 056 load leaves those rows unchanged", async () => {
    // 056 first, load the (positive) candidate, THEN apply 058, then add growth.
    const db = new PGlite();
    await db.exec("create role anon; create role authenticated; create role other_role;");
    await db.exec(M056); await db.exec(M057);
    await load(db, PAYLOAD);
    const before = (await db.query(`select observation_id, value::text v from core.official_observation order by observation_id`)).rows;
    await db.exec(M058);
    const after = (await db.query(`select observation_id, value::text v from core.official_observation order by observation_id`)).rows;
    expect(after).toEqual(before); // existing rows untouched by the constraint swap
    await load(db, GROWTH_PAYLOAD); // and signed growth now loads
    expect(await count(db, `select count(*)::int c from core.official_observation where metric='price_growth_12m'`)).toBe(3);
  });

  it("consumer RPC exposes growth as DERIVED; the direct-only view excludes it", async () => {
    const db = await db056_057_058();
    await load(db, [...PAYLOAD, ...GROWTH_PAYLOAD]);
    const g = (await db.query<Record<string, unknown>>(`select * from public.get_official_suburb_metrics_v1('SAL_40085_ASGS3_2021') where metric='price_growth_12m'`)).rows[0];
    expect(Number(g.value)).toBe(-6.11);
    expect(g.status).toBe("derived");
    expect(g.is_derived).toBe(true);
    expect(g.derived_from).toBe("publisher_median_change@1");
    expect(g.unit).toBe("%");
    expect(g.period_end).toBeTruthy();
    expect(g.retrieved_at).toBeTruthy();
    expect(g.source_id).toBe("sa_metro_median_house_sales");
    // Derived growth is intentionally absent from the direct-only public view.
    expect(await count(db, `select count(*)::int c from public.v_official_suburb_metric_v1 where metric='price_growth_12m'`)).toBe(0);
    // no internal ids leaked in the RPC projection
    for (const k of ["observation_id", "resource_sha256", "price_observation_id"]) expect(k in g).toBe(false);
  });

  it("idempotent reload + conflict fail-closed + transactional rollback hold for growth", async () => {
    const db = await db056_057_058();
    await load(db, GROWTH_PAYLOAD);
    // idempotency
    await load(db, GROWTH_PAYLOAD);
    expect(await count(db, `select count(*)::int c from core.official_observation`)).toBe(3);
    // conflict: same id, different (in-bounds) value -> not overwritten
    await db.query(INSERT_OBSERVATION, observationValues({ ...GROWTH_PAYLOAD[0], val: 12.34 }));
    expect(Number((await db.query<{ value: number }>(`select value from core.official_observation where observation_id='obs_growth_neg'`)).rows[0].value)).toBe(-6.11);
    // rollback
    await db.exec("begin");
    await db.query(INSERT_OBSERVATION, observationValues({ id: "obs_growth_sentinel", src: "s", sha: "s", geo: "SAL_40001_ASGS3_2021", metric: "price_growth_12m", pt: "house", bg: "all", val: -3, unit: "%", n: 10, ps: "2025-06-30", pe: "2026-06-30", status: "derived", formula: "publisher_median_change@1" } as Row));
    await db.exec("rollback");
    expect(await count(db, `select count(*)::int c from core.official_observation where observation_id='obs_growth_sentinel'`)).toBe(0);
  });

  it("least-privilege + no leak still hold with growth present", async () => {
    const db = await db056_057_058();
    await load(db, [...PAYLOAD, ...GROWTH_PAYLOAD]);
    const ok = async (sql: string) => (await db.query<{ ok: boolean }>(sql)).rows[0].ok;
    expect(await ok(`select has_function_privilege('anon','public.get_official_suburb_metrics_v1(text)','EXECUTE') ok`)).toBe(true);
    expect(await ok(`select has_function_privilege('other_role','public.get_official_suburb_metrics_v1(text)','EXECUTE') ok`)).toBe(false); // PUBLIC revoked
    expect(await ok(`select has_table_privilege('anon','core.official_observation','SELECT') ok`)).toBe(false);
    expect(await ok(`select has_table_privilege('anon','mart.official_suburb_metric','SELECT') ok`)).toBe(false);
    // contextual/postcode never leaks (Calderwood rule), even with growth loaded
    expect(await count(db, `select count(*)::int c from public.v_official_suburb_metric_v1 where geography_id like 'POA_%'`)).toBe(0);
    expect((await db.query(`select 1 from public.get_official_suburb_metrics_v1('POA_2527_ASGS3_2021')`)).rows.length).toBe(0);
  });
});
