import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const dir = __dirname;
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const M063 = read("063_deal_hunter_pipeline.sql");
const sql = M063.toLowerCase();

const UA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("063 — static checks", () => {
  it("revokes anon/PUBLIC on both tables; feedback is append-only", () => {
    expect(sql).toMatch(/revoke all on public\.deal_pipeline_items\s+from anon, public/);
    expect(sql).toMatch(/revoke all on public\.deal_listing_feedback from anon, public/);
    expect(sql).toMatch(/grant select, insert on public\.deal_listing_feedback to authenticated/);
    expect(sql).not.toMatch(/deal_listing_feedback for (update|delete)/);
  });
  it("enforces rejected-needs-reason and scopes policies to authenticated", () => {
    expect(sql).toMatch(/status <> 'rejected' or rejection_reason is not null/);
    expect(sql).toMatch(/for update to authenticated\s*\n?\s*using \(\(select auth\.uid\(\)\) = user_id\) with check \(\(select auth\.uid\(\)\) = user_id\)/);
  });
  it("is additive (no drops)", () => {
    expect(sql).not.toMatch(/drop table|drop schema|truncate|delete from/);
  });
});

async function db(): Promise<PGlite> {
  const p = new PGlite();
  await p.exec("create role anon; create role authenticated;");
  await p.exec("create schema auth; create table auth.users(id uuid primary key); create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;");
  await p.exec(M063);
  await p.exec("grant usage on schema public to anon, authenticated;");
  await p.exec(`insert into auth.users(id) values ('${UA}'),('${UB}');`);
  return p;
}

describe("063 — applied stack (PGlite)", () => {
  it("a rejected pipeline item without a reason is refused by the DB check", async () => {
    const p = await db();
    let blocked = false;
    try {
      await p.query(`insert into public.deal_pipeline_items(user_id,listing_key,status) values ('${UA}','replay:RPL-0001','rejected')`);
    } catch { blocked = true; }
    expect(blocked).toBe(true);
    // With a reason it succeeds.
    await p.exec(`insert into public.deal_pipeline_items(user_id,listing_key,status,rejection_reason) values ('${UA}','replay:RPL-0001','rejected','too_expensive');`);
    const c = (await p.query<{ c: number }>(`select count(*)::int c from public.deal_pipeline_items`)).rows[0].c;
    expect(c).toBe(1);
  });

  it("RLS: A cannot see or update B's pipeline; feedback is append-only", async () => {
    const p = await db();
    await p.exec(`insert into public.deal_pipeline_items(user_id,listing_key,status) values ('${UB}','replay:RPL-0009','reviewing');`);
    await p.exec(`select set_config('request.jwt.claim.sub','${UA}',false); set role authenticated;`);
    const visible = (await p.query<{ c: number }>(`select count(*)::int c from public.deal_pipeline_items`)).rows[0].c;
    const updated = (await p.query<{ c: number }>(`with u as (update public.deal_pipeline_items set status='rejected', rejection_reason='other' returning 1) select count(*)::int c from u`)).rows[0].c;
    // A can insert + read own feedback but cannot update/delete it (append-only).
    await p.exec(`insert into public.deal_listing_feedback(user_id,listing_key,kind,reason) values ('${UA}','replay:RPL-0001','passed','too_expensive');`);
    let updBlocked = false;
    try { await p.query(`update public.deal_listing_feedback set kind='saved'`); } catch { updBlocked = true; }
    await p.exec("reset role;");
    expect(visible).toBe(0); // B's row invisible to A
    expect(updated).toBe(0); // A updates zero of B's rows
    expect(updBlocked).toBe(true); // no update privilege on feedback
  });

  it("anon has no access to either table", async () => {
    const p = await db();
    const q = async (s: string) => (await p.query<{ ok: boolean }>(s)).rows[0].ok;
    expect(await q("select has_table_privilege('anon','public.deal_pipeline_items','SELECT') ok")).toBe(false);
    expect(await q("select has_table_privilege('anon','public.deal_listing_feedback','INSERT') ok")).toBe(false);
    expect(await q("select has_table_privilege('authenticated','public.deal_pipeline_items','UPDATE') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.deal_listing_feedback','UPDATE') ok")).toBe(false);
  });
});
