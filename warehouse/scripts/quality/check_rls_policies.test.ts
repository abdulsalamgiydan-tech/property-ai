import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkTableRlsCoverage, extractPublicTables, KNOWN_EXCEPTIONS } from "./check_rls_policies.mjs";

describe("extractPublicTables", () => {
  it("finds every public table created via create table if not exists", () => {
    const sql = `
      create table if not exists public.foo (id uuid);
      create table if not exists public.bar (id uuid);
    `.toLowerCase();
    expect(extractPublicTables(sql)).toEqual(["foo", "bar"]);
  });

  it("ignores tables in other schemas", () => {
    const sql = `create table if not exists core.dim_geography (id uuid);`.toLowerCase();
    expect(extractPublicTables(sql)).toEqual([]);
  });
});

describe("checkTableRlsCoverage — fixture SQL, well-formed table", () => {
  const wellFormed = `
    create table if not exists public.widgets (id uuid, user_id uuid);
    alter table public.widgets enable row level security;
    create policy "select own" on public.widgets for select using (auth.uid() = user_id);
    create policy "insert own" on public.widgets for insert with check (auth.uid() = user_id);
    create policy "update own" on public.widgets for update using (auth.uid() = user_id);
    create policy "delete own" on public.widgets for delete using (auth.uid() = user_id);
  `.toLowerCase();

  it("passes RLS enabled and all four operations", () => {
    const result = checkTableRlsCoverage(wellFormed, "widgets", {});
    expect(result.hasRls).toBe(true);
    expect(result.ops).toEqual({ select: true, insert: true, update: true, delete: true });
  });
});

describe("checkTableRlsCoverage — fixture SQL, genuinely broken table", () => {
  it("fails when RLS is never enabled", () => {
    const sql = `
      create table if not exists public.widgets (id uuid, user_id uuid);
      create policy "select own" on public.widgets for select using (auth.uid() = user_id);
    `.toLowerCase();
    const result = checkTableRlsCoverage(sql, "widgets", {});
    expect(result.hasRls).toBe(false);
  });

  it("fails when a policy exists but uses the wrong predicate (missing auth.uid() = user_id)", () => {
    const sql = `
      create table if not exists public.widgets (id uuid, user_id uuid);
      alter table public.widgets enable row level security;
      create policy "select all" on public.widgets for select using (true);
    `.toLowerCase();
    const result = checkTableRlsCoverage(sql, "widgets", {});
    expect(result.ops.select).toBe(false);
  });

  it("fails when a required operation has no policy at all", () => {
    const sql = `
      create table if not exists public.widgets (id uuid, user_id uuid);
      alter table public.widgets enable row level security;
      create policy "select own" on public.widgets for select using (auth.uid() = user_id);
    `.toLowerCase();
    const result = checkTableRlsCoverage(sql, "widgets", {});
    expect(result.ops.insert).toBe(false);
    expect(result.ops.update).toBe(false);
    expect(result.ops.delete).toBe(false);
    expect(result.requiredOps).toContain("insert");
  });

  it("does not let one table's policy satisfy a different table with a prefix-overlapping name", () => {
    const sql = `
      create table if not exists public.widgets (id uuid, user_id uuid);
      create table if not exists public.widgets_archive (id uuid, user_id uuid);
      alter table public.widgets enable row level security;
      alter table public.widgets_archive enable row level security;
      create policy "select own" on public.widgets_archive for select using (auth.uid() = user_id);
    `.toLowerCase();
    const result = checkTableRlsCoverage(sql, "widgets", {});
    expect(result.ops.select).toBe(false);
  });
});

describe("checkTableRlsCoverage — documented exceptions", () => {
  it("only requires the exception's declared ops, and applies its custom predicate check", () => {
    const sql = `
      create table if not exists public.audit_log (id uuid);
      alter table public.audit_log enable row level security;
      create policy "anyone can insert" on public.audit_log for insert with check (true);
      create policy "service role can read" on public.audit_log for select using (auth.role() = 'service_role');
    `.toLowerCase();
    const exceptions = {
      audit_log: {
        reason: "test fixture",
        requiredOps: ["select", "insert"],
        checks: {
          select: (body: string) => body.includes("auth.role() = 'service_role'"),
          insert: (body: string) => body.includes("with check (true)"),
        },
      },
    };
    const result = checkTableRlsCoverage(sql, "audit_log", exceptions);
    expect(result.ops.select).toBe(true);
    expect(result.ops.insert).toBe(true);
    expect(result.requiredOps).toEqual(["select", "insert"]);
  });
});

describe("checkTableRlsCoverage — real repository migrations", () => {
  const migrationsDir = path.join(__dirname, "..", "..", "..", "supabase", "migrations");
  const corpus = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
    .join("\n")
    .toLowerCase();

  const expectedTables = [
    "property_reports",
    "property_comparisons",
    "watchlist_items",
    "portfolio_properties",
    "strategy_reports",
    "strategy_generations",
    "waitlist",
    "scenario_lab_cases",
    "watchlist_change_events",
    "notification_preferences",
    "user_entitlements",
  ];

  it.each(expectedTables)("passes for %s against the real migration corpus", (table) => {
    const result = checkTableRlsCoverage(corpus, table, KNOWN_EXCEPTIONS);
    expect(result.hasRls).toBe(true);
    for (const op of result.requiredOps) {
      expect(result.ops[op as keyof typeof result.ops], `${table}.${op}`).toBe(true);
    }
  });

  it("finds every one of the expected tables actually declared in the migrations", () => {
    const found = extractPublicTables(corpus);
    for (const table of expectedTables) {
      expect(found).toContain(table);
    }
  });
});
