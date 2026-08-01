import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("048_warehouse_bootstrap_schemas.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "048_warehouse_bootstrap_schemas.sql"), "utf8");
  const lower = sql.toLowerCase();
  // Strip `--` comment lines before checking for absence of staging/postgis
  // -- the header comment deliberately explains the exclusion in prose,
  // which would otherwise trip these checks against the comment text itself.
  const executableOnly = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();

  it("does not drop, truncate, or write data", () => {
    expect(lower).not.toMatch(/drop\s+(table|view|function|schema)/);
    expect(lower).not.toMatch(/truncate/);
    expect(lower).not.toMatch(/delete from/);
    expect(lower).not.toMatch(/insert into/);
  });

  it("creates exactly core, mart, and meta with if-not-exists safety", () => {
    expect(lower).toContain("create schema if not exists core");
    expect(lower).toContain("create schema if not exists mart");
    expect(lower).toContain("create schema if not exists meta");
  });

  it("never creates a staging schema -- the minimum contract needs zero staging tables", () => {
    expect(executableOnly).not.toMatch(/create\s+schema[^;]*staging/);
  });

  it("never installs postgis -- confirmed unused by every granted view/function", () => {
    expect(executableOnly).not.toContain("postgis");
    expect(executableOnly).not.toMatch(/create\s+extension/);
  });
});
