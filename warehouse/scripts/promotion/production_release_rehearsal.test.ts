import { describe, expect, it } from "vitest";
import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { INSERT_OBSERVATION, INSERT_MART, PAYLOAD, GROWTH_PAYLOAD, observationValues } from "./officialPromotion.mjs";

/**
 * Full Production release-package rehearsal (real PostgreSQL via PGlite): applies
 * the release migrations IN ORDER — 055 (widen get_market_snapshot_v2 via a
 * drop+recreate) → 056 (official tables/view) → 057 (official consumer RPC) —
 * against BOTH a blank database AND a Production-equivalent current schema (which
 * already holds the narrow migration-052 function and its grants). Verifies the
 * exact widened 57-column contract, that all intended role permissions survive the
 * replacement, that the function's security/volatility/search_path are preserved,
 * that a failed recreation rolls back atomically (narrow function intact), and the
 * consumer + official-delta rollback behaviour. No remote write.
 */
const M055 = fs.readFileSync("supabase/migrations/055_widen_get_market_snapshot_v2.sql", "utf8");
const M056 = fs.readFileSync("supabase/migrations/056_official_suburb_metrics.sql", "utf8");
const M057 = fs.readFileSync("supabase/migrations/057_official_suburb_metrics_consumer_rpc.sql", "utf8");
const M058 = fs.readFileSync("supabase/migrations/058_signed_price_growth_constraint.sql", "utf8");

// The REAL migration-052 narrow get_market_snapshot_v2 (42-column contract) + the
// current post-046 ACL (PUBLIC revoked; EXECUTE for anon, authenticated,
// service_role). This is the Production "current schema" the corrected 055 replaces.
const M052_NARROW_FN = `
CREATE OR REPLACE FUNCTION public.get_market_snapshot_v2(p_geography_id text)
 RETURNS TABLE(geography_id text, geography_code text, geography_name text, jurisdiction text, state_code text, geography_method text, latest_sales_period date, latest_rent_period date, latest_yield_period date, latest_approvals_period date, latest_demographics_period integer, snapshot_generated_at timestamp with time zone, coverage_status text, sales_volume_12m integer, median_sale_price_12m numeric, annual_price_change_pct numeric, median_sale_price_detached numeric, median_sale_price_apartment numeric, median_sale_price_townhouse numeric, sales_sample_confidence text, median_weekly_rent_latest numeric, median_weekly_rent_prev numeric, annual_rent_change_pct numeric, rent_confidence text, gross_yield_pct numeric, yield_confidence text, dwelling_stock_total integer, approvals_12m integer, approvals_per_1000_dwellings numeric, supply_confidence text, total_population integer, total_households integer, median_weekly_household_income integer, renter_share numeric, owner_with_mortgage_share numeric, population_growth_2016_2021_pct numeric, price_to_income_ratio numeric, est_monthly_repayment_owner_occupier numeric, repayment_to_income_pct numeric, affordability_confidence text, confidence_label text, missing_metric_reasons jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'mart'
AS $function$
  select
    coalesce(s.geography_id, p.geography_id), coalesce(s.geography_code, p.geography_code), coalesce(s.geography_name, p.geography_name),
    coalesce(s.jurisdiction, p.jurisdiction), coalesce(s.state_code, p.state_code), coalesce(s.geography_method, p.geography_method),
    coalesce(s.latest_sales_period, p.latest_sales_period), coalesce(s.latest_rent_period, p.latest_rent_period), coalesce(s.latest_yield_period, p.latest_yield_period),
    coalesce(s.latest_approvals_period, p.latest_approvals_period), coalesce(s.latest_demographics_period, p.latest_demographics_period),
    coalesce(s.snapshot_generated_at, p.snapshot_generated_at), coalesce(s.coverage_status, p.coverage_status),
    coalesce(s.sales_volume_12m, p.sales_volume_12m), coalesce(s.median_sale_price_12m, p.median_sale_price_12m), coalesce(s.annual_price_change_pct, p.annual_price_change_pct),
    coalesce(s.median_sale_price_detached, p.median_sale_price_detached), coalesce(s.median_sale_price_apartment, p.median_sale_price_apartment), coalesce(s.median_sale_price_townhouse, p.median_sale_price_townhouse), coalesce(s.sales_sample_confidence, p.sales_sample_confidence),
    coalesce(s.median_weekly_rent_latest, p.median_weekly_rent_latest), coalesce(s.median_weekly_rent_prev, p.median_weekly_rent_prev), coalesce(s.annual_rent_change_pct, p.annual_rent_change_pct), coalesce(s.rent_confidence, p.rent_confidence),
    coalesce(s.gross_yield_pct, p.gross_yield_pct), coalesce(s.yield_confidence, p.yield_confidence),
    coalesce(s.dwelling_stock_total, p.dwelling_stock_total), coalesce(s.approvals_12m, p.approvals_12m), coalesce(s.approvals_per_1000_dwellings, p.approvals_per_1000_dwellings), coalesce(s.supply_confidence, p.supply_confidence),
    coalesce(s.total_population, p.total_population), coalesce(s.total_households, p.total_households), coalesce(s.median_weekly_household_income, p.median_weekly_household_income), coalesce(s.renter_share, p.renter_share), coalesce(s.owner_with_mortgage_share, p.owner_with_mortgage_share),
    coalesce(s.population_growth_2016_2021_pct, p.population_growth_2016_2021_pct),
    coalesce(s.price_to_income_ratio, p.price_to_income_ratio), coalesce(s.est_monthly_repayment_owner_occupier, p.est_monthly_repayment_owner_occupier), coalesce(s.repayment_to_income_pct, p.repayment_to_income_pct), coalesce(s.affordability_confidence, p.affordability_confidence),
    coalesce(s.confidence_label, p.confidence_label), coalesce(s.missing_metric_reasons, p.missing_metric_reasons)
  from (select * from mart.suburb_market_snapshot where geography_id = p_geography_id and dwelling_type is null) s
  full outer join (select * from mart.postcode_market_snapshot where geography_id = p_geography_id and dwelling_type is null) p
    on false;
$function$;
revoke all on function public.get_market_snapshot_v2(text) from public;
grant execute on function public.get_market_snapshot_v2(text) to anon, authenticated, service_role;`;

// Parse a CREATE FUNCTION's RETURNS TABLE(...) into ordered {name,type} pairs.
function parseReturnsTable(sql: string): { name: string; type: string }[] {
  const noComments = sql.replace(/--[^\n]*\n/g, "\n");
  const m = noComments.match(/RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE/i);
  if (!m) throw new Error("could not parse RETURNS TABLE");
  return m[1].split(",").map((c) => c.trim()).filter(Boolean).map((c) => {
    const sp = c.indexOf(" ");
    return { name: c.slice(0, sp).toLowerCase(), type: c.slice(sp + 1).trim().toLowerCase() };
  });
}
const WIDE_COLS = parseReturnsTable(M055);      // 57 — corrected 055 contract
const NARROW_COLS = parseReturnsTable(M052_NARROW_FN); // 42 — migration-052 contract

// Stub the snapshot tables from the WIDE contract (superset of both) + dwelling_type.
function snapshotColumns(): string {
  return WIDE_COLS.map((c) => `${c.name} ${c.type}`).join(", ") + ", dwelling_type text";
}

const count = async (db: PGlite, sql: string) => Number((await db.query<{ c: number }>(sql)).rows[0].c);
const ok = async (db: PGlite, sql: string) => (await db.query<{ ok: boolean }>(sql)).rows[0].ok;

// Actual OUT columns of the live function, in ordinal order.
async function actualOutColumns(db: PGlite): Promise<{ name: string; type: string }[]> {
  const rows = (await db.query<{ parameter_name: string; data_type: string }>(
    `select parameter_name, data_type from information_schema.parameters
     where specific_schema='public' and specific_name like 'get_market_snapshot_v2%' and parameter_mode='OUT'
     order by ordinal_position`)).rows;
  return rows.map((r) => ({ name: r.parameter_name.toLowerCase(), type: r.data_type.toLowerCase() }));
}
// prosecdef / provolatile / proconfig for the function.
async function fnProps(db: PGlite) {
  return (await db.query<{ prosecdef: boolean; provolatile: string; proconfig: string[] | null }>(
    `select p.prosecdef, p.provolatile, p.proconfig from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='get_market_snapshot_v2'`)).rows[0];
}
async function execGrants(db: PGlite) {
  const g = async (role: string) => ok(db, `select has_function_privilege('${role}','public.get_market_snapshot_v2(text)','EXECUTE') ok`);
  return { anon: await g("anon"), authenticated: await g("authenticated"), service_role: await g("service_role"), nobody: await g("nobody_role") };
}

async function baseDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create role nobody_role;");
  await db.exec(`create schema if not exists mart;`);
  await db.exec(`create table mart.suburb_market_snapshot (${snapshotColumns()});`);
  await db.exec(`create table mart.postcode_market_snapshot (${snapshotColumns()});`);
  return db;
}
// Production-equivalent: base + the narrow 052 function already installed & granted.
async function currentSchemaDb(): Promise<PGlite> {
  const db = await baseDb();
  await db.exec(M052_NARROW_FN);
  return db;
}

describe("Production release rehearsal (055 drop+recreate → 056 → 057, real PostgreSQL via PGlite)", () => {
  it("BLANK database: applies 055→056→057 in order and exposes the candidate safely", async () => {
    const db = await baseDb();
    await db.exec(M055); // DROP IF EXISTS is a no-op on a blank db
    await db.exec(M056);
    await db.exec(M057);
    await db.exec(M058); // metric-aware value invariant (signed price_growth_12m)

    // widened contract present with the exact 57 columns
    expect((await actualOutColumns(db)).length).toBe(57);
    expect(await count(db, `select count(*)::int c from information_schema.tables where table_schema='core' and table_name='official_observation'`)).toBe(1);
    expect(await count(db, `select count(*)::int c from information_schema.routines where routine_name='get_official_suburb_metrics_v1'`)).toBe(1);
    // grants restored (anon/authenticated/service_role EXECUTE; PUBLIC revoked)
    expect(await execGrants(db)).toEqual({ anon: true, authenticated: true, service_role: true, nobody: false });

    for (const r of [...PAYLOAD, ...GROWTH_PAYLOAD]) await db.query(INSERT_OBSERVATION, observationValues(r));
    for (const r of [...PAYLOAD, ...GROWTH_PAYLOAD]) await db.query(INSERT_MART, [r.id]);
    expect((await db.query(`select 1 from public.get_official_suburb_metrics_v1('SAL_40085_ASGS3_2021') where metric='gross_yield'`)).rows.length).toBe(1);
    expect((await db.query(`select 1 from public.v_official_suburb_metric_v1 where geography_id='SAL_40085_ASGS3_2021' and metric='gross_yield'`)).rows.length).toBe(0);
    // 058: signed growth (incl. the -6.11 negative) is accepted and exposed via the RPC
    expect(Number((await db.query<{ value: number }>(`select value from public.get_official_suburb_metrics_v1('SAL_40085_ASGS3_2021') where metric='price_growth_12m'`)).rows[0].value)).toBe(-6.11);
    expect(await ok(db, `select has_function_privilege('anon','public.get_official_suburb_metrics_v1(text)','EXECUTE') ok`)).toBe(true);
    expect(await ok(db, `select has_table_privilege('anon','core.official_observation','SELECT') ok`)).toBe(false);
  });

  it("CURRENT schema: 055 REPLACES the narrow 052 function — exact 57-col contract, ACL & properties preserved", async () => {
    const db = await currentSchemaDb();
    // precondition: the real narrow 42-column function with its post-046 ACL
    expect(await actualOutColumns(db)).toEqual(NARROW_COLS);
    expect(NARROW_COLS.length).toBe(42);
    expect(await execGrants(db)).toEqual({ anon: true, authenticated: true, service_role: true, nobody: false });

    await db.exec(M055); // drop + recreate widened + regrant

    // exact widened contract: names, order AND types match 055 verbatim
    expect(await actualOutColumns(db)).toEqual(WIDE_COLS);
    expect(WIDE_COLS.length).toBe(57);
    // every intended role permission survives the replacement; PUBLIC stays revoked
    expect(await execGrants(db)).toEqual({ anon: true, authenticated: true, service_role: true, nobody: false });
    // security mode / volatility / pinned search_path preserved (SECURITY DEFINER, STABLE, public+mart)
    const props = await fnProps(db);
    expect(props.prosecdef).toBe(true);
    expect(props.provolatile).toBe("s");
    expect((props.proconfig ?? []).some((c) => /search_path=.*public.*mart/i.test(c))).toBe(true);

    // behaviour: the widened function actually returns the appended columns
    await db.exec(`insert into mart.suburb_market_snapshot (geography_id, median_sale_price_12m, direct_or_derived, rba_rate_used, dwelling_type)
                   values ('SAL_10749_ASGS3_2021', 1114000, 'direct', 6.2, null);`);
    const snap = (await db.query<{ median_sale_price_12m: number; direct_or_derived: string; rba_rate_used: number }>(
      `select median_sale_price_12m, direct_or_derived, rba_rate_used from public.get_market_snapshot_v2('SAL_10749_ASGS3_2021')`)).rows[0];
    expect(Number(snap.median_sale_price_12m)).toBe(1114000);
    expect(snap.direct_or_derived).toBe("direct"); // an appended (055-only) column now returned

    // full sequence continues on the current schema
    await db.exec(M056);
    await db.exec(M057);
    await db.exec(M058); // metric-aware value invariant (signed price_growth_12m)
    for (const r of PAYLOAD) await db.query(INSERT_OBSERVATION, observationValues(r));
    for (const r of PAYLOAD) await db.query(INSERT_MART, [r.id]);
    expect((await db.query(`select 1 from public.get_official_suburb_metrics_v1('SAL_40085_ASGS3_2021') where metric='gross_yield' and is_derived`)).rows.length).toBe(1);
  });

  it("ATOMIC: a failed recreation rolls back, leaving the narrow 052 function and its grants intact", async () => {
    const db = await currentSchemaDb();
    let threw = false;
    try {
      await db.exec("begin");
      await db.exec("drop function if exists public.get_market_snapshot_v2(text);");
      // recreation fails at CREATE (SQL body references a non-existent column)
      await db.exec(`create function public.get_market_snapshot_v2(p_geography_id text)
        returns table(geography_id text, bogus text) language sql stable as $$
          select geography_id, this_column_does_not_exist from mart.suburb_market_snapshot $$;`);
      await db.exec("commit");
    } catch {
      threw = true;
      await db.exec("rollback");
    }
    expect(threw).toBe(true);
    // the narrow function is intact (42-col contract) and still granted
    expect(await actualOutColumns(db)).toEqual(NARROW_COLS);
    expect(await execGrants(db)).toEqual({ anon: true, authenticated: true, service_role: true, nobody: false });
  });

  it("official-delta rollback: dropping 057+056 objects leaves the 055-era objects intact", async () => {
    const db = await currentSchemaDb();
    await db.exec(M055);
    await db.exec(M056);
    await db.exec(M057);
    await db.exec(M058); // metric-aware value invariant (signed price_growth_12m)
    for (const r of PAYLOAD) await db.query(INSERT_OBSERVATION, observationValues(r));

    await db.exec(`
      drop function if exists public.get_official_suburb_metrics_v1(text);
      drop view if exists public.v_official_suburb_metric_v1;
      drop table if exists mart.official_suburb_metric;
      drop table if exists core.official_observation;`);

    expect(await count(db, `select count(*)::int c from information_schema.routines where routine_name='get_official_suburb_metrics_v1'`)).toBe(0);
    expect(await count(db, `select count(*)::int c from information_schema.tables where table_name='official_observation'`)).toBe(0);
    expect(await count(db, `select count(*)::int c from information_schema.views where table_name='v_official_suburb_metric_v1'`)).toBe(0);
    // pre-existing objects untouched — widened snapshot RPC still present with its grants
    expect((await actualOutColumns(db)).length).toBe(57);
    expect(await execGrants(db)).toEqual({ anon: true, authenticated: true, service_role: true, nobody: false });
    expect(await count(db, `select count(*)::int c from information_schema.tables where table_schema='mart' and table_name='suburb_market_snapshot'`)).toBe(1);
  });
});
