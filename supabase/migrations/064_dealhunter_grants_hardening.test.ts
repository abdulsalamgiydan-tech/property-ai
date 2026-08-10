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
const M062 = read("062_shortlist_change_events.sql");
const M063 = read("063_deal_hunter_pipeline.sql");
const M064 = read("064_dealhunter_grants_hardening.sql");
const sql = M064.toLowerCase();

describe("064 — static checks", () => {
  it("revokes the Supabase-default excess and reasserts intended grants", () => {
    expect(sql).toMatch(/revoke insert on public\.investment_shortlist_change_events from authenticated, anon, public/);
    expect(sql).toMatch(/revoke update, delete on public\.deal_listing_feedback from authenticated, anon, public/);
    expect(sql).toMatch(/revoke execute on function public\.detect_shortlist_change_events_v1\(\) from anon, public/);
    expect(sql).toMatch(/grant select, update, delete on public\.investment_shortlist_change_events to authenticated/);
    expect(sql).toMatch(/grant select, insert on public\.deal_listing_feedback to authenticated/);
    expect(sql).toMatch(/grant execute on function public\.detect_shortlist_change_events_v1\(\) to authenticated/);
  });
  it("is additive (no schema/data change)", () => {
    expect(sql).not.toMatch(/drop table|drop schema|truncate|delete from|alter table.*add|create table/);
  });
});

async function db(): Promise<PGlite> {
  const p = new PGlite();
  await p.exec("create role anon; create role authenticated;");
  await p.exec("create schema if not exists meta;");
  await p.exec("create schema auth; create table auth.users(id uuid primary key); create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;");
  await p.exec(M056); await p.exec(M058); await p.exec(M059); await p.exec(M060); await p.exec(M061); await p.exec(M062); await p.exec(M063);
  await p.exec("grant usage on schema public to anon, authenticated;");
  return p;
}

describe("064 — applied (PGlite): closes the Supabase-default grant gap", () => {
  it("after simulating Supabase defaults, 064 revokes the excess and keeps intended grants", async () => {
    const p = await db();
    // Simulate Supabase default privileges that leak onto the roles.
    await p.exec("grant insert on public.investment_shortlist_change_events to authenticated;");
    await p.exec("grant update, delete on public.deal_listing_feedback to authenticated;");
    await p.exec("grant execute on function public.detect_shortlist_change_events_v1() to anon;");
    const q = async (s: string) => (await p.query<{ ok: boolean }>(s)).rows[0].ok;
    // Pre-064: the excess is present.
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_change_events','INSERT') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.deal_listing_feedback','UPDATE') ok")).toBe(true);
    expect(await q("select has_function_privilege('anon','public.detect_shortlist_change_events_v1()','EXECUTE') ok")).toBe(true);

    await p.exec(M064);

    // Post-064: excess revoked.
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_change_events','INSERT') ok")).toBe(false);
    expect(await q("select has_table_privilege('authenticated','public.deal_listing_feedback','UPDATE') ok")).toBe(false);
    expect(await q("select has_table_privilege('authenticated','public.deal_listing_feedback','DELETE') ok")).toBe(false);
    expect(await q("select has_function_privilege('anon','public.detect_shortlist_change_events_v1()','EXECUTE') ok")).toBe(false);
    // Intended surface preserved.
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_change_events','SELECT') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_change_events','UPDATE') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_change_events','DELETE') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.deal_listing_feedback','SELECT') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.deal_listing_feedback','INSERT') ok")).toBe(true);
    expect(await q("select has_function_privilege('authenticated','public.detect_shortlist_change_events_v1()','EXECUTE') ok")).toBe(true);
  });
});
