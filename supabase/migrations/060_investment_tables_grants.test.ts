import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(__dirname, "060_investment_tables_grants.sql"), "utf8").toLowerCase();

describe("060_investment_tables_grants.sql", () => {
  it("is additive (grants only — no destructive DDL, no data change)", () => {
    for (const bad of [/drop table/, /drop schema/, /truncate/, /delete from/, /alter table [^\n]*drop /, /update /]) {
      expect(sql).not.toMatch(bad);
    }
  });
  it("grants full DML on both investment user tables to authenticated", () => {
    for (const t of ["investment_profiles", "investment_shortlist_items"]) {
      expect(sql).toMatch(new RegExp(`grant select, insert, update, delete on public\\.${t}\\s+to authenticated`));
    }
  });
  it("grants anon read-only (no anon write)", () => {
    expect(sql).toMatch(/grant select on public\.investment_profiles\s+to anon/);
    expect(sql).not.toMatch(/insert[^\n]*to anon/);
  });
  it("declares it is not applied remotely", () => {
    const raw = fs.readFileSync(path.join(__dirname, "060_investment_tables_grants.sql"), "utf8");
    expect(raw).toMatch(/NOT APPLIED REMOTELY/);
  });
});
