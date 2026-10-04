import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const dir = __dirname;
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const M065 = read("065_byod_submissions.sql");
const sql = M065.toLowerCase();

const UA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INS = (u: string) =>
  `insert into public.byod_submissions(user_id,source_url,address_full,suburb,state,geography_id,property_type,bedrooms,price_display,price_lower,listing_status)
   values ('${u}','https://example.com/x','12 Test St, Grange SA 5022','Grange','SA','SAL_40530','house',3,'exact',800000,'for_sale')`;

describe("065 — static checks", () => {
  it("revokes anon/PUBLIC and grants only authenticated", () => {
    expect(sql).toMatch(/revoke all on public\.byod_submissions from anon, public/);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.byod_submissions to authenticated/);
  });
  it("scopes every policy to authenticated by (select auth.uid()) = user_id", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      expect(sql).toMatch(new RegExp(`for ${op} to authenticated`));
    }
    expect(sql).toMatch(/using \(\(select auth\.uid\(\)\) = user_id\) with check \(\(select auth\.uid\(\)\) = user_id\)/);
  });
  it("keeps source_url provenance and is additive (no drops/edits)", () => {
    expect(sql).toMatch(/source_url\s+text/);
    expect(sql).toMatch(/source_captured_at\s+timestamptz/);
    expect(sql).not.toMatch(/drop table|drop schema|truncate|delete from|alter table public\.(deal_|investment_)/);
  });
});

async function db(): Promise<PGlite> {
  const p = new PGlite();
  await p.exec("create role anon; create role authenticated;");
  await p.exec("create schema auth; create table auth.users(id uuid primary key); create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;");
  await p.exec(M065);
  await p.exec("grant usage on schema public to anon, authenticated;");
  await p.exec(`insert into auth.users(id) values ('${UA}'),('${UB}');`);
  return p;
}

describe("065 — applied stack (PGlite)", () => {
  it("rejects an invalid property_type; a valid row inserts", async () => {
    const p = await db();
    let blocked = false;
    try { await p.query(INS(UA).replace("'house'", "'mansion'")); } catch { blocked = true; }
    expect(blocked).toBe(true);
    await p.exec(INS(UA) + ";");
    expect((await p.query<{ c: number }>(`select count(*)::int c from public.byod_submissions`)).rows[0].c).toBe(1);
  });

  it("RLS: A cannot see, update or delete B's submissions", async () => {
    const p = await db();
    await p.exec(INS(UB) + ";");
    await p.exec(`select set_config('request.jwt.claim.sub','${UA}',false); set role authenticated;`);
    const visible = (await p.query<{ c: number }>(`select count(*)::int c from public.byod_submissions`)).rows[0].c;
    const updated = (await p.query<{ c: number }>(`with u as (update public.byod_submissions set suburb='Hacked' returning 1) select count(*)::int c from u`)).rows[0].c;
    const deleted = (await p.query<{ c: number }>(`with d as (delete from public.byod_submissions returning 1) select count(*)::int c from d`)).rows[0].c;
    // A can insert + read its own.
    await p.exec(INS(UA) + ";");
    const own = (await p.query<{ c: number }>(`select count(*)::int c from public.byod_submissions`)).rows[0].c;
    await p.exec("reset role;");
    expect(visible).toBe(0);
    expect(updated).toBe(0);
    expect(deleted).toBe(0);
    expect(own).toBe(1); // A sees only its own row
  });

  it("anon has no privileges; authenticated has full owner DML", async () => {
    const p = await db();
    const q = async (s: string) => (await p.query<{ ok: boolean }>(s)).rows[0].ok;
    expect(await q("select has_table_privilege('anon','public.byod_submissions','SELECT') ok")).toBe(false);
    expect(await q("select has_table_privilege('anon','public.byod_submissions','INSERT') ok")).toBe(false);
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(await q(`select has_table_privilege('authenticated','public.byod_submissions','${priv}') ok`)).toBe(true);
    }
  });
});
