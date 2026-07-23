import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static checks only — same rationale as 042_research_copilot_queries.test.ts:
 * no live non-production DB exists for the main app schema, so
 * warehouse:rls:check plus live information_schema verification at
 * apply time are the real verification, once this migration is applied.
 */
describe("043_onboarding_preferences.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "043_onboarding_preferences.sql"), "utf8");
  const lower = sql.toLowerCase();

  it("contains no destructive DDL (additive migration only)", () => {
    expect(lower).not.toMatch(/drop table/);
    expect(lower).not.toMatch(/drop schema/);
    expect(lower).not.toMatch(/truncate/);
    expect(lower).not.toMatch(/delete from/);
  });

  it("creates the table with 'if not exists', safe to re-run", () => {
    expect(lower).toMatch(/create table if not exists public\.user_onboarding_preferences/);
  });

  it("enables row level security on the new table", () => {
    expect(lower).toMatch(/alter table public\.user_onboarding_preferences enable row level security/);
  });

  it("defines all four standard auth.uid() = user_id policies (select/insert/update/delete)", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      const re = new RegExp(`on public\\.user_onboarding_preferences for ${op}\\s*\\n\\s*(using|with check) \\(auth\\.uid\\(\\) = user_id\\)`);
      expect(lower).toMatch(re);
    }
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
