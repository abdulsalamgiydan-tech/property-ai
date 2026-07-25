import { describe, expect, it } from "vitest";
import { moveGeographyId, sortByIdOrder } from "./compareOrder";

describe("moveGeographyId", () => {
  it("swaps an item with its right neighbour", () => {
    expect(moveGeographyId(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("swaps an item with its left neighbour", () => {
    expect(moveGeographyId(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op when moving the first item further left", () => {
    expect(moveGeographyId(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when moving the last item further right", () => {
    expect(moveGeographyId(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an out-of-range index", () => {
    expect(moveGeographyId(["a", "b", "c"], 5, 1)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c"];
    moveGeographyId(input, 0, 1);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("sortByIdOrder", () => {
  const rows = [
    { geography_id: "1", name: "One" },
    { geography_id: "2", name: "Two" },
    { geography_id: "3", name: "Three" },
  ];

  it("reorders rows to match the given id order", () => {
    expect(sortByIdOrder(rows, ["3", "1", "2"]).map((r) => r.name)).toEqual(["Three", "One", "Two"]);
  });

  it("drops rows whose id has no data (RPC returned fewer rows than requested)", () => {
    expect(sortByIdOrder(rows, ["1", "99", "2"]).map((r) => r.name)).toEqual(["One", "Two"]);
  });
});
