import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static checks only — there is no live non-production DB for the main
 * app schema (see Sprint 13 WS8's documented decision), so this
 * migration's real correctness is verified by warehouse:rls:check once
 * applied, plus live information_schema verification at apply time
 * (same pattern as migration 041). This test guards the things that are
 * checkable from the SQL text alone: additive-only, RLS enabled, and a
 * complete select/insert policy pair with no update/delete surface
 * (query records are meant to be immutable once logged).
 */
describe("042_research_copilot_queries.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "042_research_copilot_queries.sql"), "utf8");
  const lower = sql.toLowerCase();

  it("contains no destructive DDL (additive migration only)", () => {
    expect(lower).not.toMatch(/drop table/);
    expect(lower).not.toMatch(/drop schema/);
    expect(lower).not.toMatch(/truncate/);
    expect(lower).not.toMatch(/delete from/);
  });

  it("creates the table with 'if not exists', safe to re-run", () => {
    expect(lower).toMatch(/create table if not exists public\.research_copilot_queries/);
  });

  it("enables row level security on the new table", () => {
    expect(lower).toMatch(/alter table public\.research_copilot_queries enable row level security/);
  });

  it("defines exactly a select-own and insert-own policy pair, no update/delete surface", () => {
    expect(lower).toMatch(/for select\s*\n\s*using \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(lower).toMatch(/for insert\s*\n\s*with check \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(lower).not.toMatch(/for update/);
    expect(lower).not.toMatch(/for delete/);
  });

  it("wraps auth.uid() as (select auth.uid()) — Supabase performance advisor guidance to avoid per-row re-evaluation (Sprint 15 finding)", () => {
    expect(lower).not.toMatch(/using \(auth\.uid\(\) = user_id\)/);
    expect(lower).not.toMatch(/with check \(auth\.uid\(\) = user_id\)/);
  });

  it("does not use SECURITY DEFINER", () => {
    const codeOnly = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .toLowerCase();
    expect(codeOnly).not.toContain("security definer");
  });

  it("is not applied to production yet, and says so explicitly in its own header comment", () => {
    expect(sql).toMatch(/NOT applied to production/);
  });
});
