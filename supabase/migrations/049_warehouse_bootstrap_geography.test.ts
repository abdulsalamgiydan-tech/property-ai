import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("049_warehouse_bootstrap_geography.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "049_warehouse_bootstrap_geography.sql"), "utf8");
  const lower = sql.toLowerCase();
  // Strip `--` comment lines before checking for absence of geom/geometry --
  // the header comment deliberately explains the exclusion in prose, which
  // would otherwise trip these checks against the comment text itself.
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

  it("creates core.dim_geography with if-not-exists safety", () => {
    expect(lower).toContain("create table if not exists core.dim_geography");
  });

  it("never references a geom/geometry column or PostGIS index type", () => {
    expect(executableOnly).not.toMatch(/\bgeom\b/);
    expect(executableOnly).not.toMatch(/\bgeometry\b/);
    expect(executableOnly).not.toMatch(/using gist/);
  });

  it("has the expected primary key and natural-key unique constraint", () => {
    expect(lower).toContain("primary key (geography_id)");
    expect(lower).toContain("unique (geography_type, geography_code, boundary_version)");
  });

  it("creates the three non-spatial indexes verified on warehouse-validation", () => {
    expect(lower).toContain("dim_geography_name_idx");
    expect(lower).toContain("dim_geography_parent_idx");
    expect(lower).toContain("dim_geography_type_code_idx");
  });
});
