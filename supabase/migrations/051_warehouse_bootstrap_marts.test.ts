import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("051_warehouse_bootstrap_marts.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "051_warehouse_bootstrap_marts.sql"), "utf8");
  const lower = sql.toLowerCase();

  const tables = [
    "suburb_market_snapshot",
    "postcode_market_snapshot",
    "suburb_demographic_profile_2021",
    "postcode_demographic_profile_2021",
    "suburb_market_timeseries",
    "postcode_market_timeseries",
    "suburb_rent_quarterly",
    "postcode_rent_quarterly",
    "lga_rent_quarterly",
  ];

  it("does not drop, truncate, or write data", () => {
    expect(lower).not.toMatch(/drop\s+(table|view|function|schema)/);
    expect(lower).not.toMatch(/truncate/);
    expect(lower).not.toMatch(/delete from/);
    expect(lower).not.toMatch(/insert into/);
  });

  it("creates all 9 mart tables with if-not-exists safety", () => {
    for (const t of tables) {
      expect(lower).toContain(`create table if not exists mart.${t}`);
    }
  });

  it("every table has a foreign key to core.dim_geography", () => {
    const matches = lower.match(/references core\.dim_geography/g) ?? [];
    expect(matches.length).toBe(tables.length);
  });

  it("the 3 rent-quarterly tables have the geography/quarter/dwelling-type natural-key unique constraint", () => {
    expect(lower).toContain("unique (geography_id, reference_quarter, dwelling_type)");
    const matches = lower.match(/unique \(geography_id, reference_quarter, dwelling_type\)/g) ?? [];
    expect(matches.length).toBe(3);
  });
});
