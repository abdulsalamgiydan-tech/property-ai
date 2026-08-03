import { describe, expect, it } from "vitest";
import { parseSaHouseSales, PARSER_VERSION } from "./parse.mjs";
import { REAL_ROWS, DRIFTED_ROWS } from "./fixtures.mjs";

const opts = { retrievedAt: "2026-08-02T00:00:00Z", resourceSha: "9cfa8aa7" };

describe("parseSaHouseSales (real SA CC-BY schema)", () => {
  it("fails closed on schema drift", () => {
    const r = parseSaHouseSales(DRIFTED_ROWS, opts);
    expect(r.drift).toBe(true);
    expect(r.records).toHaveLength(0);
  });

  it("derives the quarter periods from the real header labels", () => {
    const r = parseSaHouseSales(REAL_ROWS, opts);
    expect(r.currentPeriodEnd).toBe("2026-06-30");
    expect(r.priorPeriodEnd).toBe("2025-06-30");
  });

  it("accepts only suburbs with a positive median AND sales >= 10; quarantines the rest", () => {
    const r = parseSaHouseSales(REAL_ROWS, opts);
    expect(r.records.map((x) => x.suburb).sort()).toEqual(["BELAIR", "STIRLING"]);
    const belair = r.records.find((x) => x.suburb === "BELAIR");
    expect(belair).toMatchObject({ property_type: "house", house_median: 1455000, sales_count: 16, state: "SA", parser_version: PARSER_VERSION, current_period_end: "2026-06-30" });
    // Adelaide (6 sales), Aldgate (9), Ashton (1), Balhannah (5) are quarantined
    expect(r.quarantined.some((q) => q.suburb === "ADELAIDE" && q.quarantine_reason === "insufficient_sample")).toBe(true);
  });

  it("never fabricates a value — suppressed medians are quarantined, not zero-filled", () => {
    const r = parseSaHouseSales(REAL_ROWS, opts);
    expect(r.records.every((x) => (x.house_median ?? 0) > 0 && (x.sales_count ?? 0) >= 10)).toBe(true);
  });
});
