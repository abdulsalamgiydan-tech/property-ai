import { describe, expect, it } from "vitest";
import { mergeExploreResults, resolveExploreJurisdictions, SUPPORTED_EXPLORE_JURISDICTIONS } from "./exploreScope";
import type { GeographySearchResultV2 } from "@/lib/warehouse/queries";

function geo(overrides: Partial<GeographySearchResultV2>): GeographySearchResultV2 {
  return {
    geography_id: "SAL_1",
    geography_type: "SAL",
    geography_code: "1",
    geography_name: "Aaa",
    jurisdiction: "NSW",
    has_suburb_snapshot: true,
    has_postcode_snapshot: false,
    ...overrides,
  };
}

describe("resolveExploreJurisdictions", () => {
  it("defaults to the full supported set (NSW + VIC) when no state is selected", () => {
    expect(resolveExploreJurisdictions(undefined)).toEqual(["NSW", "VIC"]);
    expect(resolveExploreJurisdictions("")).toEqual(["NSW", "VIC"]);
    expect(resolveExploreJurisdictions(null)).toEqual(["NSW", "VIC"]);
  });

  it("narrows to a single explicitly-selected supported state", () => {
    expect(resolveExploreJurisdictions("NSW")).toEqual(["NSW"]);
    expect(resolveExploreJurisdictions("VIC")).toEqual(["VIC"]);
  });

  it("never resolves to an unsupported state — falls back to the supported set instead", () => {
    // e.g. an "NT" that a hand-crafted URL might try to inject
    expect(resolveExploreJurisdictions("NT")).toEqual(["NSW", "VIC"]);
    expect(resolveExploreJurisdictions("QLD")).toEqual(["NSW", "VIC"]);
    // whatever it resolves to is always a subset of the supported set
    for (const j of resolveExploreJurisdictions("NT")) {
      expect(SUPPORTED_EXPLORE_JURISDICTIONS).toContain(j);
    }
  });
});

describe("mergeExploreResults", () => {
  it("flattens per-jurisdiction lists, sorts by name, and caps at the limit", () => {
    const nsw = [geo({ geography_id: "SAL_C", geography_name: "Camden", jurisdiction: "NSW" })];
    const vic = [
      geo({ geography_id: "SAL_A", geography_name: "Abbotsford", jurisdiction: "VIC" }),
      geo({ geography_id: "SAL_B", geography_name: "Ballarat", jurisdiction: "VIC" }),
    ];
    const merged = mergeExploreResults([nsw, vic], 2);
    expect(merged.map((r) => r.geography_name)).toEqual(["Abbotsford", "Ballarat"]);
  });

  it("only ever surfaces the (supported) rows it was given — no unsupported geography can appear", () => {
    const nsw = [geo({ jurisdiction: "NSW" })];
    const vic = [geo({ geography_id: "SAL_2", geography_name: "Bbb", jurisdiction: "VIC" })];
    const merged = mergeExploreResults([nsw, vic]);
    expect(merged.every((r) => r.jurisdiction === "NSW" || r.jurisdiction === "VIC")).toBe(true);
    expect(merged).toHaveLength(2);
  });
});
