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
const sql = M062.toLowerCase();

const UA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const GEO = "SAL40001";

describe("062 — static security checks", () => {
  it("revokes all from anon and PUBLIC on both new user tables", () => {
    expect(sql).toMatch(/revoke all on public\.investment_shortlist_change_events from anon, public/);
    expect(sql).toMatch(/revoke all on public\.investment_notification_prefs\s+from anon, public/);
  });
  it("grants authenticated SELECT/UPDATE/DELETE on events but NOT insert (definer-only writer)", () => {
    expect(sql).toMatch(/grant select, update, delete on public\.investment_shortlist_change_events to authenticated/);
    expect(sql).not.toMatch(/grant[^;]*insert[^;]*on public\.investment_shortlist_change_events/);
    // and there is no INSERT policy for authenticated on the events table
    expect(sql).not.toMatch(/investment_shortlist_change_events for insert/);
  });
  it("enforces same-user + must-be-shortlisted via composite FK to the shortlist", () => {
    expect(sql).toMatch(/foreign key \(user_id, geography_id\)\s*\n?\s*references public\.investment_shortlist_items \(user_id, geography_id\)\s*\n?\s*on delete cascade/);
  });
  it("detector is SECURITY DEFINER with a pinned search_path and authenticated-only EXECUTE", () => {
    expect(sql).toMatch(/create or replace function public\.detect_shortlist_change_events_v1\(\)/);
    expect(sql).toContain("security definer");
    expect(sql).toMatch(/set search_path to 'public', 'core', 'mart'/);
    expect(sql).toMatch(/grant execute on function public\.detect_shortlist_change_events_v1\(\) to authenticated/);
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
  await p.exec(M062);
  await p.exec("grant usage on schema public to anon, authenticated;");
  await p.exec(`insert into auth.users(id) values ('${UA}'),('${UB}');`);
  return p;
}

/** Seed one accepted official observation → feeds mart.suburb_scoring_input_v1. */
async function seedMetric(
  p: PGlite,
  o: { geo?: string; metric: string; value: number; periodEnd: string; source?: string; attribution?: string; ptype?: string },
) {
  const geo = o.geo ?? GEO;
  const ptype = o.ptype ?? "house";
  const id = `${geo}:${o.metric}:${ptype}:${o.periodEnd}`;
  await p.query(
    `insert into core.official_observation
      (observation_id, source_id, resource_sha256, geography_id, asgs_version, metric, property_type,
       bedroom_group, value, unit, period_end, status, licence, attribution, retrieved_at)
     values ($1,$2,'sha',$3,'2021',$4,$5,'all',$6,'AUD',$7::date,'direct','CC-BY',$8, now())`,
    [id, o.source ?? "SA-VG", geo, o.metric, ptype, o.value, o.periodEnd, o.attribution ?? "Government of SA"],
  );
}

async function asUser(p: PGlite, uid: string) {
  // Session-level (is_local=false): PGlite autocommits each query, so a
  // transaction-local setting would not survive to the detector call.
  await p.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
}

describe("062 — applied stack (PGlite)", () => {
  it("anon has no access; authenticated may read/update/delete events but not insert", async () => {
    const p = await db();
    const q = async (s: string) => (await p.query<{ ok: boolean }>(s)).rows[0].ok;
    expect(await q("select has_table_privilege('anon','public.investment_shortlist_change_events','SELECT') ok")).toBe(false);
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_change_events','SELECT') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_change_events','UPDATE') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_change_events','DELETE') ok")).toBe(true);
    expect(await q("select has_table_privilege('authenticated','public.investment_shortlist_change_events','INSERT') ok")).toBe(false);
  });

  it("composite FK blocks an event for a suburb NOT on the user's shortlist; cascade clears on un-shortlist", async () => {
    const p = await db();
    // A shortlists GEO; B does not.
    await p.exec(`insert into public.investment_shortlist_items(user_id,geography_id) values ('${UA}','${GEO}');`);
    // Event for A's shortlisted suburb → ok.
    await p.exec(`insert into public.investment_shortlist_change_events(user_id,geography_id,metric,property_type,direction,new_value,new_period_end) values ('${UA}','${GEO}','median_house_price','house','new',700000,'2025-06-30');`);
    // Event for B (suburb not shortlisted) → FK violation.
    let blocked = false;
    try {
      await p.query(`insert into public.investment_shortlist_change_events(user_id,geography_id,metric,property_type,direction,new_value,new_period_end) values ('${UB}','${GEO}','median_house_price','house','new',700000,'2025-06-30')`);
    } catch { blocked = true; }
    expect(blocked).toBe(true);
    // Un-shortlist → the event cascades away.
    await p.exec(`delete from public.investment_shortlist_items where user_id='${UA}' and geography_id='${GEO}';`);
    const c = (await p.query<{ c: number }>(`select count(*)::int c from public.investment_shortlist_change_events where user_id='${UA}'`)).rows[0].c;
    expect(c).toBe(0);
  });

  it("detector is deterministic + idempotent, scopes to the caller, and records provenance + direction", async () => {
    const p = await db();
    await p.exec(`insert into public.investment_shortlist_items(user_id,geography_id) values ('${UA}','${GEO}');`);
    await seedMetric(p, { metric: "median_house_price", value: 700000, periodEnd: "2025-03-31" });
    await seedMetric(p, { metric: "gross_yield", value: 4.2, periodEnd: "2025-03-31" });

    // First run as A → one 'new' event per metric.
    await asUser(p, UA);
    const first = (await p.query<{ detect_shortlist_change_events_v1: number }>("select public.detect_shortlist_change_events_v1()")).rows[0].detect_shortlist_change_events_v1;
    expect(first).toBe(2);
    // Idempotent: same period, no new rows.
    const again = (await p.query<{ detect_shortlist_change_events_v1: number }>("select public.detect_shortlist_change_events_v1()")).rows[0].detect_shortlist_change_events_v1;
    expect(again).toBe(0);

    // Provenance is copied verbatim from the official observation.
    const ev = (await p.query<{ direction: string; source_id: string; attribution: string; new_value: string }>(
      `select direction, source_id, attribution, new_value from public.investment_shortlist_change_events where metric='median_house_price'`,
    )).rows[0];
    expect(ev.direction).toBe("new");
    expect(ev.source_id).toBe("SA-VG");
    expect(ev.attribution).toBe("Government of SA");
    expect(Number(ev.new_value)).toBe(700000);

    // A newer period with a higher value → an 'up' event with the prior value.
    await seedMetric(p, { metric: "median_house_price", value: 735000, periodEnd: "2025-06-30" });
    const third = (await p.query<{ detect_shortlist_change_events_v1: number }>("select public.detect_shortlist_change_events_v1()")).rows[0].detect_shortlist_change_events_v1;
    expect(third).toBe(1);
    const up = (await p.query<{ direction: string; old_value: string; new_value: string }>(
      `select direction, old_value, new_value from public.investment_shortlist_change_events where metric='median_house_price' and new_period_end='2025-06-30'`,
    )).rows[0];
    expect(up.direction).toBe("up");
    expect(Number(up.old_value)).toBe(700000);
    expect(Number(up.new_value)).toBe(735000);

    // Cross-user isolation: B runs the detector and gets nothing (B has no shortlist).
    await asUser(p, UB);
    const bRun = (await p.query<{ detect_shortlist_change_events_v1: number }>("select public.detect_shortlist_change_events_v1()")).rows[0].detect_shortlist_change_events_v1;
    expect(bRun).toBe(0);
    const bCount = (await p.query<{ c: number }>(`select count(*)::int c from public.investment_shortlist_change_events where user_id='${UB}'`)).rows[0].c;
    expect(bCount).toBe(0);
  });

  it("unauthenticated detector call is a no-op", async () => {
    const p = await db();
    await p.query(`select set_config('request.jwt.claim.sub', '', false)`);
    const n = (await p.query<{ detect_shortlist_change_events_v1: number }>("select public.detect_shortlist_change_events_v1()")).rows[0].detect_shortlist_change_events_v1;
    expect(n).toBe(0);
  });
});

// RLS enforced as the REAL `authenticated` role (set role) — proves the first-write
// path and that events cannot be forged by a client, not just privilege bits.
describe("062 — RLS enforcement as real roles", () => {
  it("a first-time authenticated user can CREATE prefs (insert, not just update)", async () => {
    const p = await db();
    // A has no prefs row yet — the very first write must succeed under RLS.
    await p.exec(`select set_config('request.jwt.claim.sub','${UA}',false); set role authenticated;`);
    await p.exec(`insert into public.investment_notification_prefs(user_id, alerts_enabled, min_change_pct) values ('${UA}', true, 2);`);
    const mine = (await p.query<{ c: number }>(`select count(*)::int c from public.investment_notification_prefs`)).rows[0].c;
    expect(mine).toBe(1); // RLS shows A exactly their own new row
    // A cannot create a row owned by B (insert WITH CHECK denies).
    let denied = false;
    try { await p.query(`insert into public.investment_notification_prefs(user_id) values ('${UB}')`); } catch { denied = true; }
    expect(denied).toBe(true);
    await p.exec("reset role;");
  });

  it("anon cannot read or write prefs at all", async () => {
    const p = await db();
    await p.exec(`insert into public.investment_notification_prefs(user_id) values ('${UA}');`);
    await p.exec("set role anon;");
    let readBlocked = false, writeBlocked = false;
    try { await p.query(`select * from public.investment_notification_prefs`); } catch { readBlocked = true; }
    try { await p.query(`insert into public.investment_notification_prefs(user_id) values ('${UA}')`); } catch { writeBlocked = true; }
    await p.exec("reset role;");
    expect(readBlocked).toBe(true);
    expect(writeBlocked).toBe(true);
  });

  it("a client (authenticated) CANNOT forge a change event — no INSERT privilege", async () => {
    const p = await db();
    await p.exec(`insert into public.investment_shortlist_items(user_id,geography_id) values ('${UA}','${GEO}');`);
    await p.exec(`select set_config('request.jwt.claim.sub','${UA}',false); set role authenticated;`);
    let forgeBlocked = false;
    try {
      // Even for their own shortlisted suburb, a direct client insert is refused.
      await p.query(`insert into public.investment_shortlist_change_events(user_id,geography_id,metric,property_type,direction,new_value,new_period_end) values ('${UA}','${GEO}','median_house_price','house','up',9999999,'2099-01-01')`);
    } catch { forgeBlocked = true; }
    await p.exec("reset role;");
    expect(forgeBlocked).toBe(true);
    const c = (await p.query<{ c: number }>(`select count(*)::int c from public.investment_shortlist_change_events`)).rows[0].c;
    expect(c).toBe(0); // nothing forged
  });

  it("authenticated user A cannot see or mark-seen user B's events (cross-user isolation)", async () => {
    const p = await db();
    // Seed one legitimate event for B via the definer detector.
    await p.exec(`insert into public.investment_shortlist_items(user_id,geography_id) values ('${UB}','${GEO}');`);
    await seedMetric(p, { metric: "median_house_price", value: 700000, periodEnd: "2025-03-31" });
    await asUser(p, UB);
    await p.query("select public.detect_shortlist_change_events_v1()");
    // Now act as A: B's event must be invisible and un-updatable.
    await p.exec(`select set_config('request.jwt.claim.sub','${UA}',false); set role authenticated;`);
    const visible = (await p.query<{ c: number }>(`select count(*)::int c from public.investment_shortlist_change_events`)).rows[0].c;
    const updated = (await p.query<{ c: number }>(`with u as (update public.investment_shortlist_change_events set seen_at=now() returning 1) select count(*)::int c from u`)).rows[0].c;
    await p.exec("reset role;");
    expect(visible).toBe(0);
    expect(updated).toBe(0); // RLS lets A update zero of B's rows
  });
});
