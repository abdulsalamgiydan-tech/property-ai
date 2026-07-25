import { describe, expect, it } from "vitest";
import { sortExploreResults } from "./exploreSort";
import type { GeographySearchResultV2 } from "@/lib/warehouse/queries";

function result(overrides: Partial<GeographySearchResultV2> = {}): GeographySearchResultV2 {
  return {
    geography_id: "geo-1",
    geography_type: "SAL",
    geography_code: "SAL123",
    geography_name: "Calderwood",
    jurisdiction: "NSW",
    has_suburb_snapshot: false,
    has_postcode_snapshot: false,
    ...overrides,
  };
}

describe("sortExploreResults", () => {
  it("'name' sorts alphabetically regardless of data availability", () => {
    const results = [
      result({ geography_id: "1", geography_name: "Wollongong", has_suburb_snapshot: true }),
      result({ geography_id: "2", geography_name: "Albury" }),
      result({ geography_id: "3", geography_name: "Melbourne", has_suburb_snapshot: true }),
    ];
    const sorted = sortExploreResults(results, "name");
    expect(sorted.map((r) => r.geography_name)).toEqual(["Albury", "Melbourne", "Wollongong"]);
  });

  it("'data_first' groups geographies with a suburb or postcode snapshot ahead of those without", () => {
    const results = [
      result({ geography_id: "1", geography_name: "NoData1" }),
      result({ geography_id: "2", geography_name: "HasData1", has_suburb_snapshot: true }),
      result({ geography_id: "3", geography_name: "NoData2" }),
      result({ geography_id: "4", geography_name: "HasData2", has_postcode_snapshot: true }),
    ];
    const sorted = sortExploreResults(results, "data_first");
    expect(sorted.map((r) => r.geography_id)).toEqual(["2", "4", "1", "3"]);
  });

  it("'data_first' is a stable sort — preserves original relative order within each group", () => {
    const results = [
      result({ geography_id: "1", geography_name: "Z", has_suburb_snapshot: true }),
      result({ geography_id: "2", geography_name: "A", has_suburb_snapshot: true }),
      result({ geography_id: "3", geography_name: "M" }),
      result({ geography_id: "4", geography_name: "B" }),
    ];
    const sorted = sortExploreResults(results, "data_first");
    // original order within the "has data" group (1, 2) and "no data" group (3, 4) is unchanged
    expect(sorted.map((r) => r.geography_id)).toEqual(["1", "2", "3", "4"]);
  });

  it("never drops or duplicates a result — output length always matches input length", () => {
    const results = [result({ geography_id: "1" }), result({ geography_id: "2", has_suburb_snapshot: true })];
    expect(sortExploreResults(results, "data_first")).toHaveLength(2);
    expect(sortExploreResults(results, "name")).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const results = [result({ geography_id: "1", geography_name: "Z" }), result({ geography_id: "2", geography_name: "A" })];
    const snapshot = [...results];
    sortExploreResults(results, "name");
    expect(results).toEqual(snapshot);
  });
});
