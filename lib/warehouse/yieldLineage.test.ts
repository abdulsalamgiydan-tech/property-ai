import { describe, expect, it } from "vitest";
import { qualifyYield, deriveYieldId, type YieldEvidence, type InputEvidence } from "./yieldLineage";

const OPTS = { minSample: 10, maxPeriodGapDays: 400, freshnessSlaDays: 400 };

function input(over: Partial<InputEvidence> = {}): InputEvidence {
  return {
    observationId: "obs_price_1",
    geographyId: "SAL_14273_ASGS3_2021",
    asgsVersion: "ASGS3_2021",
    geographyLevel: "suburb",
    directStatus: "direct",
    propertyType: "house",
    bedroomGroup: "all",
    sampleSize: 40,
    qualityStatus: "passed",
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
    sourceId: "nsw_vg_sales",
    value: 640000,
    ageDays: 30,
    ...over,
  };
}
function ev(price: Partial<InputEvidence> = {}, rent: Partial<InputEvidence> = {}): YieldEvidence {
  return {
    price: input({ observationId: "obs_price_1", propertyType: "house", value: 640000, ...price }),
    rent: input({ observationId: "obs_rent_1", propertyType: "house", value: 480, sourceId: "nsw_rent", ...rent }),
  };
}

describe("qualifyYield — full lineage contract", () => {
  it("qualifies only when both inputs prove every contract condition (house/house, direct, real ids, samples, periods)", () => {
    const q = qualifyYield(ev(), OPTS);
    expect(q.qualified).toBe(true);
    expect(q.disposition).toBe("materialised_local");
    expect(q.derivedId).toMatch(/^yield_[0-9a-f]{24}$/);
  });

  it("rejects aggregate property_type 'all' (registry: house/unit only)", () => {
    const q = qualifyYield(ev({ propertyType: "all" }, { propertyType: "all" }), OPTS);
    expect(q.qualified).toBe(false);
    expect(q.disposition).toBe("incompatible_property_type");
  });

  it("rejects house price with unit rent", () => {
    const q = qualifyYield(ev({ propertyType: "house" }, { propertyType: "unit" }), OPTS);
    expect(q.qualified).toBe(false);
    expect(q.disposition).toBe("incompatible_property_type");
  });

  it("rejects incompatible bedroom groupings", () => {
    const q = qualifyYield(ev({ bedroomGroup: "all" }, { bedroomGroup: "3" }), OPTS);
    expect(q.qualified).toBe(false);
    expect(q.disposition).toBe("incompatible_bedroom_group");
  });

  it("rejects a contextual (postcode-sourced) rent input as not independently-direct", () => {
    const q = qualifyYield(ev({}, { geographyLevel: "postcode", directStatus: "contextual" }), OPTS);
    expect(q.qualified).toBe(false);
    expect(q.disposition).toBe("context_only");
  });

  it("rejects when an upstream observation id is missing (lineage_unverified)", () => {
    const q = qualifyYield(ev({ observationId: null }, {}), OPTS);
    expect(q.qualified).toBe(false);
    expect(q.disposition).toBe("lineage_unverified");
    expect(q.reasons.join(" ")).toMatch(/observation id/);
  });

  it("rejects when the two inputs have different independent direct/context status", () => {
    const q = qualifyYield(ev({ directStatus: "direct" }, { directStatus: "derived" }), OPTS);
    expect(q.qualified).toBe(false);
  });

  it("rejects missing or stale periods", () => {
    expect(qualifyYield(ev({}, { periodEnd: null }), OPTS).qualified).toBe(false);
    expect(qualifyYield(ev({ ageDays: 5000 }, {}), OPTS).disposition).toBe("stale");
  });

  it("rejects insufficient ACTUAL sample sizes (labels are not accepted as proxies)", () => {
    const q = qualifyYield(ev({ sampleSize: 4 }, { sampleSize: 4 }), OPTS);
    expect(q.qualified).toBe(false);
    expect(q.disposition).toBe("insufficient_sample");
  });

  it("rejects negative/zero rent", () => {
    expect(qualifyYield(ev({}, { value: 0 }), OPTS).qualified).toBe(false);
    expect(qualifyYield(ev({}, { value: -10 }), OPTS).qualified).toBe(false);
  });

  it("produces deterministic content-addressed derived ids from the two input ids + formula", () => {
    expect(deriveYieldId("a", "b", "gross_yield@2")).toBe(deriveYieldId("a", "b", "gross_yield@2"));
    expect(deriveYieldId("a", "b", "gross_yield@2")).not.toBe(deriveYieldId("a", "c", "gross_yield@2"));
  });

  it("mixed geography versions (different ASGS) are not qualified", () => {
    const q = qualifyYield(ev({ asgsVersion: "ASGS3_2021" }, { asgsVersion: "ASGS2_2016" }), OPTS);
    expect(q.qualified).toBe(false);
  });
});
