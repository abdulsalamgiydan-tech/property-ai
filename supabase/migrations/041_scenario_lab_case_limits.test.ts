import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURE_LIMITS } from "@/lib/auth/entitlements";

/**
 * The database trigger (041_scenario_lab_case_limits.sql) is the actual
 * enforcement — it can't be executed here (no live DB in this test
 * environment, see Sprint 13 WS8's documented decision). This test
 * instead guards against silent drift between the SQL's hardcoded CASE
 * values and lib/auth/entitlements.ts's FEATURE_LIMITS, which the UI
 * uses to show a usage count/upgrade prompt before a user hits the DB's
 * hard limit — if these two numbers disagree, the UI would show the
 * wrong limit even though the database enforces the real one correctly.
 */
describe("041_scenario_lab_case_limits.sql matches lib/auth/entitlements.ts", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "041_scenario_lab_case_limits.sql"),
    "utf8"
  );

  it("contains no destructive DDL (additive migration only)", () => {
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(/drop table/);
    expect(lower).not.toMatch(/drop schema/);
    expect(lower).not.toMatch(/truncate/);
    expect(lower).not.toMatch(/delete from/);
  });

  it("hardcodes the same free-tier limit as FEATURE_LIMITS.saved_scenarios.free", () => {
    expect(sql).toMatch(new RegExp(`else ${FEATURE_LIMITS.saved_scenarios.free}\\b`));
  });

  it("hardcodes the same research-tier limit", () => {
    expect(sql).toMatch(new RegExp(`when 'research' then ${FEATURE_LIMITS.saved_scenarios.research}\\b`));
  });

  it("hardcodes the same investor_pro-tier limit", () => {
    expect(sql).toMatch(new RegExp(`when 'investor_pro' then ${FEATURE_LIMITS.saved_scenarios.investor_pro}\\b`));
  });

  it("treats professional tier as unlimited (null), matching FEATURE_LIMITS", () => {
    expect(FEATURE_LIMITS.saved_scenarios.professional).toBeNull();
    expect(sql).toMatch(/when 'professional' then null/);
  });

  it("does not use SECURITY DEFINER (avoids the exact privilege-escalation class already flagged by the security advisor elsewhere in this project)", () => {
    // Strip comment lines first — the migration's own explanatory prose
    // mentions "security definer" (to say it's deliberately NOT used),
    // which would otherwise false-positive a naive substring check.
    const codeOnly = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .toLowerCase();
    expect(codeOnly).not.toContain("security definer");
  });
});
