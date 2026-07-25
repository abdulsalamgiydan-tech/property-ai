import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("045_sprint17_preferences_feedback_controls.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "045_sprint17_preferences_feedback_controls.sql"), "utf8");
  const lower = sql.toLowerCase();
  const codeOnly = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();

  it("is additive only", () => {
    expect(lower).not.toMatch(/drop table/);
    expect(lower).not.toMatch(/drop schema/);
    expect(lower).not.toMatch(/truncate/);
    expect(lower).not.toMatch(/delete from/);
  });

  it("extends onboarding preferences without weakening ownership controls", () => {
    expect(lower).toMatch(/alter table public\.user_onboarding_preferences/);
    expect(lower).toMatch(/add column if not exists strategy_focus/);
    expect(lower).toMatch(/completion_step integer not null default 1/);
    expect(lower).not.toMatch(/disable row level security/);
  });

  it("extends feedback with duplicate protection and safe workflow status", () => {
    expect(lower).toMatch(/alter table public\.user_feedback/);
    expect(lower).toMatch(/add column if not exists client_submission_id/);
    expect(lower).toMatch(/create unique index if not exists user_feedback_user_submission_id_idx/);
    expect(lower).toMatch(/user_feedback_status_check/);
  });

  it("does not introduce SECURITY DEFINER or privileged grants", () => {
    expect(codeOnly).not.toContain("security definer");
    expect(codeOnly).not.toMatch(/grant\s+.*\s+to\s+anon/);
    expect(codeOnly).not.toMatch(/grant\s+.*\s+to\s+authenticated/);
  });
});