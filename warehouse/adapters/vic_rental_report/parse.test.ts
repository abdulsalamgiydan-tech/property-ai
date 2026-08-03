import { describe, expect, it } from "vitest";
import { parseVicRent, locateLatest, monthQuarterEnd, PARSER_VERSION } from "./parse.mjs";
import { REAL_ROWS_2BR_HOUSE, DRIFTED_ROWS } from "./fixtures.mjs";

const opts = { retrievedAt: "2026-08-02T00:00:00Z", resourceSha: "89c37951", sheetName: "2 bedroom house" };

describe("parseVicRent (real VIC CC-BY schema)", () => {
  it("locates the LATEST period's Count/Median columns and derives the period end", () => {
    const loc = locateLatest(REAL_ROWS_2BR_HOUSE);
    expect(loc?.period).toBe("2025-06-30");
    expect(monthQuarterEnd("Jun 2025")).toBe("2025-06-30");
  });

  it("fails closed on an unmapped sheet or drifted header", () => {
    expect(parseVicRent(REAL_ROWS_2BR_HOUSE, { ...opts, sheetName: "weird sheet" }).drift).toBe(true);
    expect(parseVicRent(DRIFTED_ROWS, opts).drift).toBe(true);
  });

  it("emits direct suburb rent for single suburbs at the latest period (house/2br)", () => {
    const r = parseVicRent(REAL_ROWS_2BR_HOUSE, opts);
    expect(r.drift).toBe(false);
    expect(r.period).toBe("2025-06-30");
    const names = r.observations.map((o) => o.suburb).sort();
    expect(names).toContain("Armadale");
    expect(names).toContain("Carlton North");
    expect(names).toContain("Fitzroy");
    const armadale = r.observations.find((o) => o.suburb === "Armadale");
    expect(armadale).toMatchObject({ metric: "median_rent", value: 798, sample_size: 30, property_type: "house", bedroom_group: "2", state: "VIC", status: "direct", parser_version: PARSER_VERSION });
  });

  it("quarantines suppressed ('-') and insufficient-sample rows; never fabricates", () => {
    const r = parseVicRent(REAL_ROWS_2BR_HOUSE, opts);
    expect(r.quarantined.some((q) => q.suburb === "Docklands" && q.quarantine_reason === "suppressed_or_non_positive")).toBe(true);
    expect(r.quarantined.some((q) => q.suburb === "Tinytown" && q.quarantine_reason === "insufficient_sample")).toBe(true);
    // combined provider locality is still parsed here but is quarantined downstream by the resolver
    expect(r.observations.every((o) => (o.value ?? 0) > 0 && (o.sample_size ?? 0) >= 10)).toBe(true);
  });
});
