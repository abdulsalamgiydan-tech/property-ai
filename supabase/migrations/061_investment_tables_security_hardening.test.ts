import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const dir = __dirname;
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const M056 = read("056_official_suburb_metrics.sql");
const M058 = read("058_signed_price_growth_constraint.sql");
const M059 = read("059_investment_opportunity_engine.sql");
const M060 = read("060_investment_tables_grants.sql");
const M061 = read("061_investment_tables_security_hardening.sql");
const sql = M061.toLowerCase();

describe("061 — static security hardening checks", () => {
  it("revokes all from anon and PUBLIC on both user tables", () => {
    expect(sql).toMatch(/revoke all on public\.investment_profiles\s+from anon, public/);
    expect(sql).toMatch(/revoke all on public\.investment_shortlist_items\s+from anon, public/);
  });
  it("scopes every ownership policy to authenticated with explicit WITH CHECK on update", () => {
    for (const t of ["investment_profiles", "investment_shortlist_items"]) {
      expect(sql).toMatch(new RegExp(`for update to authenticated\\s*\\n?\\s*using \\(\\(select auth\\.uid\\(\\)\\) = user_id\\) with check \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)`));
      expect(sql).toMatch(new RegExp(`for select to authenticated`));
      expect(sql).toContain(t);
    }
  });
  it("enforces same-user profile link via composite FK with profile_id-only SET NULL", () => {
    expect(sql).toMatch(/foreign key \(profile_id, user_id\)\s*\n?\s*references public\.investment_profiles \(id, user_id\)\s*\n?\s*on delete set null \(profile_id\)/);
    expect(sql).toMatch(/add constraint investment_profiles_id_user_key unique \(id, user_id\)/);
  });
  it("does not touch the candidates RPC / anon execute, or core/mart/meta", () => {
    expect(sql).not.toContain("get_investment_candidates_v1");
    expect(sql).not.toMatch(/(core|mart|meta)\./);
  });
  it("keeps RLS enabled and is additive (no data/table drops)", () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).not.toMatch(/drop table|drop schema|truncate|delete from/);
  });
});

async function db(): Promise<PGlite> {
  const p = new PGlite();
  await p.exec("create role anon; create role authenticated;");
  await p.exec("create schema if not exists meta;");
  await p.exec("create schema auth; create table auth.users(id uuid primary key); create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;");
  await p.exec(M056);
  await p.exec(M058);
  await p.exec(M059);
  await p.exec(M060);
  await p.exec(M061);
  await p.exec("grant usage on schema public to anon, authenticated;");
  return p;
}

describe("061 — applied stack (PGlite) enforces the hardening", () => {
  it("anon has no table access; authenticated keeps DML", async () => {
    const p = await db();
    const q = async (s: string) => (await p.query<{ ok: boolean }>(s)).rows[0].ok;
    expect(await q("select has_table_privilege('anon','public.investment_profiles','SELECT') ok")).toBe(false);
    expect(await q("select has_table_privilege('anon','public.investment_shortlist_items','SELECT') ok")).toBe(false);
    expect(await q("select has_table_privilege('authenticated','public.investment_profiles','INSERT') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_items','DELETE') ok")).toBe(true);
  });

  it("composite FK blocks linking a shortlist to another user's profile; orphan sets profile_id null", async () => {
    const p = await db();
    await p.exec("insert into auth.users(id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');");
    await p.exec("insert into public.investment_profiles(id,user_id,name,inputs) values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A','{}'::jsonb);");
    // A links to own profile → ok
    await p.exec("insert into public.investment_shortlist_items(user_id,geography_id,profile_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','SAL_1','dddddddd-dddd-dddd-dddd-dddddddddddd');");
    // B links to A's profile → FK violation
    let blocked = false;
    try {
      await p.query("insert into public.investment_shortlist_items(user_id,geography_id,profile_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','SAL_2','dddddddd-dddd-dddd-dddd-dddddddddddd')");
    } catch {
      blocked = true;
    }
    expect(blocked).toBe(true);
    // delete A's profile → A's shortlist row kept, profile_id null
    await p.exec("delete from public.investment_profiles where id='dddddddd-dddd-dddd-dddd-dddddddddddd';");
    const row = (await p.query<{ c: number; n: number }>("select count(*)::int c, count(*) filter (where profile_id is null)::int n from public.investment_shortlist_items where geography_id='SAL_1'")).rows[0];
    expect(row.c).toBe(1);
    expect(row.n).toBe(1);
  });
});
