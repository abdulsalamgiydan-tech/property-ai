import { describe, expect, it } from "vitest";
import { parseSaRent, PARSER_VERSION } from "./parse.mjs";
import { REAL_ROWS, DRIFTED_ROWS } from "./fixtures.mjs";

const opts = { retrievedAt: "2026-08-02T00:00:00Z", resourceSha: "d0db486e", periodEnd: "2026-03-31" };

describe("parseSaRent (real SA CC-BY schema)", () => {
  it("fails closed when the dwelling header markers are missing", () => {
    const r = parseSaRent(DRIFTED_ROWS, opts);
    expect(r.drift).toBe(true);
    expect(r.observations).toHaveLength(0);
  });

  it("emits DIRECT suburb house/unit rent only where the bond count meets the minimum", () => {
    const r = parseSaRent(REAL_ROWS, opts);
    // Adelaide: house count 100 + unit count 1945 -> both accepted
    expect(r.observations.filter((o) => o.suburb === "Adelaide").map((o) => o.property_type).sort()).toEqual(["house", "unit"]);
    const adelaideHouse = r.observations.find((o) => o.suburb === "Adelaide" && o.property_type === "house");
    expect(adelaideHouse).toMatchObject({ metric: "median_rent", value: 650, sample_size: 100, geography_level: "suburb", status: "direct", parser_version: PARSER_VERSION });
    // Aberfoyle Park: house count 30 accepted; unit count '*' suppressed -> quarantined
    expect(r.observations.some((o) => o.suburb === "Aberfoyle Park" && o.property_type === "house")).toBe(true);
    expect(r.quarantined.some((q) => q.suburb === "Aberfoyle Park" && q.property_type === "unit" && q.quarantine_reason === "privacy_suppressed_count")).toBe(true);
  });

  it("quarantines an insufficient bond sample (house count 5)", () => {
    const r = parseSaRent(REAL_ROWS, opts);
    expect(r.quarantined.some((q) => q.suburb === "Alberton" && q.property_type === "house" && q.quarantine_reason === "insufficient_sample")).toBe(true);
    // Alberton unit count 10 -> accepted
    expect(r.observations.some((o) => o.suburb === "Alberton" && o.property_type === "unit")).toBe(true);
  });

  it("skips group/aggregate rows (Metro) — only real suburbs become observations", () => {
    const r = parseSaRent(REAL_ROWS, opts);
    expect(r.observations.some((o) => o.suburb === "Metro")).toBe(false);
  });
});
