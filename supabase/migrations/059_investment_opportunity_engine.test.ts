import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const dir = __dirname;
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const M056 = read("056_official_suburb_metrics.sql");
const M058 = read("058_signed_price_growth_constraint.sql");
const M059 = read("059_investment_opportunity_engine.sql");
const sql059 = M059.toLowerCase();

const OBS_COLS =
  "observation_id, source_id, resource_sha256, geography_id, geography_level, asgs_version, metric, property_type, bedroom_group, value, unit, sample_size, period_start, period_end, status, quality_status, formula_version, price_observation_id, rent_observation_id, licence, attribution, retrieved_at";

function obs(id: string, metric: string, value: number, status: string, unit: string, n: number): string {
  return `('${id}','sa_metro_median_house_sales','sha','SAL_40530_ASGS3_2021','suburb','ASGS3_2021','${metric}','house','all',${value},'${unit}',${n},'2025-06-30','2026-06-30','${status}','passed',${status === "derived" ? "'gross_yield@2'" : "null"},null,null,'CC BY 4.0','© Government of South Australia (CC BY 4.0)','2026-06-01T00:00:00Z')`;
}

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec("create schema if not exists meta;");
  await db.exec(
    "create schema auth; create table auth.users(id uuid primary key); " +
      "create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;",
  );
  await db.exec(M056);
  await db.exec(M058);
  await db.exec(M059);
  // Supabase grants these by default; replicate minimally for the RLS test.
  await db.exec("grant usage on schema public to anon, authenticated;");
  await db.exec("grant select, insert, update, delete on public.investment_profiles, public.investment_shortlist_items to authenticated;");
  // One eligible SA suburb with all five mandatory metrics.
  await db.exec(
    `insert into core.official_observation (${OBS_COLS}) values ` +
      [
        obs("o_price", "median_house_price", 1_690_000, "direct", "AUD", 18),
        obs("o_rent", "median_rent", 825, "direct", "AUD/week", 40),
        obs("o_yield", "gross_yield", 2.54, "derived", "%", 18),
        obs("o_vol", "sales_volume", 18, "direct", "count", 18),
        obs("o_growth", "price_growth_12m", -6.11, "direct", "%", 18),
      ].join(",") +
      ";",
  );
  return db;
}

describe("059 — static additive / least-privilege checks", () => {
  it("is additive only (no destructive DDL)", () => {
    expect(sql059).not.toMatch(/drop table/);
    expect(sql059).not.toMatch(/drop schema/);
    expect(sql059).not.toMatch(/truncate/);
    expect(sql059).not.toMatch(/delete from/);
    expect(sql059).not.toMatch(/alter table [^\n]*drop /);
  });
  it("declares it is not applied remotely", () => {
    expect(M059).toMatch(/NOT APPLIED REMOTELY/);
  });
  it("grants the consumer RPC EXECUTE-only to anon + authenticated (never a table grant)", () => {
    expect(sql059).toMatch(/revoke all on function public\.get_investment_candidates_v1\(text, text\) from public/);
    expect(sql059).toMatch(/grant execute on function public\.get_investment_candidates_v1\(text, text\) to anon, authenticated/);
    expect(sql059).not.toMatch(/grant (select|all)[^\n]*on (core|mart|meta)\./);
  });
  it("defines the four (select auth.uid()) = user_id policies on both user tables", () => {
    for (const t of ["investment_profiles", "investment_shortlist_items"]) {
      for (const op of ["select", "insert", "update", "delete"]) {
        expect(sql059).toMatch(new RegExp(`on public\\.${t} for ${op}\\s*\\n\\s*(using|with check) \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)`));
      }
    }
  });
});

describe("A7 — client roles cannot access internal schemas; RPC is the only path", () => {
  it("anon has EXECUTE on the RPC but no reach into core/mart/meta", async () => {
    const db = await freshDb();
    const priv = (await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon','public.get_investment_candidates_v1(text,text)','EXECUTE') as ok",
    )).rows[0].ok;
    expect(priv).toBe(true);
    for (const [obj, p] of [
      ["mart.suburb_scoring_input_v1", "SELECT"],
      ["core.official_observation", "SELECT"],
      ["meta.metric_provider", "SELECT"],
    ] as const) {
      const r = (await db.query<{ ok: boolean }>(`select has_table_privilege('anon','${obj}','${p}') as ok`)).rows[0].ok;
      expect(r, obj).toBe(false);
    }
    for (const s of ["core", "mart", "meta"]) {
      const r = (await db.query<{ ok: boolean }>(`select has_schema_privilege('anon','${s}','USAGE') as ok`)).rows[0].ok;
      expect(r, s).toBe(false);
    }
  });

  it("anon can call the RPC (SECURITY DEFINER) and gets the suburb with all five mandatory metrics + provenance", async () => {
    const db = await freshDb();
    await db.exec("set role anon;");
    const rows = (await db.query<{ geography_id: string; jurisdiction: string; metrics: Record<string, unknown> }>(
      "select geography_id, jurisdiction, metrics from public.get_investment_candidates_v1('SA','house')",
    )).rows;
    await db.exec("reset role;");
    expect(rows).toHaveLength(1);
    expect(rows[0].jurisdiction).toBe("SA");
    for (const k of ["median_house_price", "median_rent", "gross_yield", "sales_volume", "price_growth_12m"]) {
      expect(rows[0].metrics[k]).toBeTruthy();
    }
    const growth = rows[0].metrics.price_growth_12m as Record<string, unknown>;
    expect(Number(growth.value)).toBe(-6.11);
    expect(growth.source_id).toBe("sa_metro_median_house_sales");
    expect(growth.retrieved_at).toBeTruthy();
    expect(growth.provider).toBe("official");
  });

  it("anon selecting the internal view directly is denied", async () => {
    const db = await freshDb();
    await db.exec("set role anon;");
    let denied = false;
    try {
      await db.query("select * from mart.suburb_scoring_input_v1");
    } catch {
      denied = true;
    }
    await db.exec("reset role;");
    expect(denied).toBe(true);
  });
});

describe("A8 — no user can read another user's saved profile or shortlist", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const B = "22222222-2222-2222-2222-222222222222";

  it("RLS isolates profiles by auth.uid()", async () => {
    const db = await freshDb();
    await db.exec(`insert into auth.users(id) values ('${A}'),('${B}');`);
    // Seed one profile each (as owner, bypassing RLS).
    await db.exec(`insert into public.investment_profiles(user_id,name,inputs) values ('${A}','A plan','{}'::jsonb),('${B}','B plan','{}'::jsonb);`);

    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false); set role authenticated;`);
    const aRows = (await db.query<{ user_id: string }>("select user_id from public.investment_profiles")).rows;
    await db.exec("reset role;");
    expect(aRows.map((r) => r.user_id)).toEqual([A]);

    await db.exec(`select set_config('request.jwt.claim.sub','${B}',false); set role authenticated;`);
    const bRows = (await db.query<{ user_id: string }>("select user_id from public.investment_profiles")).rows;
    await db.exec("reset role;");
    expect(bRows.map((r) => r.user_id)).toEqual([B]);
  });

  it("a user cannot insert a row owned by someone else (WITH CHECK)", async () => {
    const db = await freshDb();
    await db.exec(`insert into auth.users(id) values ('${A}'),('${B}');`);
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false); set role authenticated;`);
    let blocked = false;
    try {
      await db.query(`insert into public.investment_shortlist_items(user_id,geography_id) values ('${B}','SAL_40530_ASGS3_2021')`);
    } catch {
      blocked = true;
    }
    await db.exec("reset role;");
    expect(blocked).toBe(true);
  });
});
