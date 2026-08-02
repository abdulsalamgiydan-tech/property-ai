import { describe, expect, it } from "vitest";
import { qualifyYield, deriveYieldId, checkPeriodWindow } from "./yieldLineage.mjs";

const OPTS = { minSample: 10, asOf: "2026-08-02", maxEndLagDays: 400, freshnessSlaDays: 400, maxWindowRatio: 2 };

/** A fully-qualifying input (all evidence present and valid). */
function input(over = {}) {
  return {
    observationId: "obs_price_1",
    geographyId: "SAL_14273_ASGS3_2021",
    asgsVersion: "ASGS3_2021",
    geographyLevel: "suburb",
    directStatus: "direct",
    sourceContract: "accepted",
    provenanceVerified: true,
    sourceId: "nsw_vg_sales",
    qualityStatus: "passed",
    propertyType: "house",
    bedroomGroup: "3",
    aggregateBedroomLegitimate: false,
    sampleSize: 40,
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
    value: 640000,
    quarantined: false,
    ...over,
  };
}
function ev(price = {}, rent = {}) {
  return { price: input({ observationId: "obs_price_1", ...price }), rent: input({ observationId: "obs_rent_1", sourceId: "nsw_rta", value: 480, ...rent }) };
}

describe("qualifyYield — full lineage contract", () => {
  it("qualifies only when both inputs prove the complete contract", () => {
    const q = qualifyYield(ev(), OPTS);
    expect(q.qualified).toBe(true);
    expect(q.disposition).toBe("materialised_local");
    expect(q.derivedId).toMatch(/^yield_[0-9a-f]{24}$/);
  });

  it("rejects two null bedroom groups (null is not compatible)", () => {
    const q = qualifyYield(ev({ bedroomGroup: null }, { bedroomGroup: null }), OPTS);
    expect(q.qualified).toBe(false);
    expect(q.disposition).toBe("incompatible_bedroom_group");
  });
  it("rejects one null bedroom group", () => {
    expect(qualifyYield(ev({ bedroomGroup: "3" }, { bedroomGroup: null }), OPTS).qualified).toBe(false);
  });
  it("accepts explicit 'all' bedroom group only when flagged a legitimate aggregate", () => {
    expect(qualifyYield(ev({ bedroomGroup: "all" }, { bedroomGroup: "all" }), OPTS).qualified).toBe(false);
    const ok = qualifyYield(ev({ bedroomGroup: "all", aggregateBedroomLegitimate: true }, { bedroomGroup: "all", aggregateBedroomLegitimate: true }), OPTS);
    expect(ok.qualified).toBe(true);
  });

  it("rejects aggregate 'all' property type (house/unit only)", () => {
    expect(qualifyYield(ev({ propertyType: "all" }, { propertyType: "all" }), OPTS).disposition).toBe("incompatible_property_type");
  });
  it("rejects house price with unit rent", () => {
    expect(qualifyYield(ev({ propertyType: "house" }, { propertyType: "unit" }), OPTS).disposition).toBe("incompatible_property_type");
  });

  it("rejects null/unaccepted quality status", () => {
    expect(qualifyYield(ev({ qualityStatus: null }, {}), OPTS).qualified).toBe(false);
    expect(qualifyYield(ev({ qualityStatus: "quarantined" }, {}), OPTS).qualified).toBe(false);
  });
  it("rejects null/unverified source or provenance", () => {
    expect(qualifyYield(ev({ sourceId: null }, {}), OPTS).disposition).toBe("lineage_unverified");
    expect(qualifyYield(ev({ provenanceVerified: false }, {}), OPTS).disposition).toBe("lineage_unverified");
    expect(qualifyYield(ev({ sourceContract: null }, {}), OPTS).disposition).toBe("lineage_unverified");
  });
  it("rejects a fabricated/absent observation id (lineage_unverified)", () => {
    expect(qualifyYield(ev({ observationId: null }, {}), OPTS).disposition).toBe("lineage_unverified");
  });
  it("rejects a contextual (postcode) input as not independently-direct", () => {
    expect(qualifyYield(ev({}, { geographyLevel: "postcode", directStatus: "contextual" }), OPTS).disposition).toBe("context_only");
  });
  it("rejects insufficient ACTUAL sample sizes", () => {
    expect(qualifyYield(ev({ sampleSize: 4 }, { sampleSize: 4 }), OPTS).disposition).toBe("insufficient_sample");
  });
  it("rejects negative/zero rent", () => {
    expect(qualifyYield(ev({}, { value: 0 }), OPTS).qualified).toBe(false);
    expect(qualifyYield(ev({}, { value: -5 }), OPTS).qualified).toBe(false);
  });
  it("rejects mixed ASGS geography versions", () => {
    expect(qualifyYield(ev({ asgsVersion: "ASGS3_2021" }, { asgsVersion: "ASGS2_2016" }), OPTS).qualified).toBe(false);
  });

  it("deterministic content-addressed derived ids", () => {
    expect(deriveYieldId("a", "b", "gross_yield@2")).toBe(deriveYieldId("a", "b", "gross_yield@2"));
    expect(deriveYieldId("a", "b", "gross_yield@2")).not.toBe(deriveYieldId("a", "c", "gross_yield@2"));
  });
});

describe("checkPeriodWindow — real window compatibility", () => {
  const base = { periodStart: "2025-07-01", periodEnd: "2026-06-30" };
  it("accepts overlapping, comparable-length windows", () => {
    expect(checkPeriodWindow(base, base, OPTS).ok).toBe(true);
  });
  it("rejects same end date but incompatible window lengths", () => {
    // price is a 12-month window; rent is a 1-day window ending the same day
    const rent = { periodStart: "2026-06-29", periodEnd: "2026-06-30" };
    expect(checkPeriodWindow(base, rent, OPTS).ok).toBe(false);
  });
  it("rejects an acceptable end-date gap but no window overlap", () => {
    // both ~1-month windows, ends 30 days apart (<400), but windows do not overlap
    const price = { periodStart: "2026-05-01", periodEnd: "2026-05-31" };
    const rent = { periodStart: "2026-06-15", periodEnd: "2026-06-30" };
    const r = checkPeriodWindow(price, rent, { ...OPTS, maxEndLagDays: 5 }); // tighten lag so only overlap could save it
    expect(r.ok).toBe(false);
  });
  it("rejects reversed periods", () => {
    expect(checkPeriodWindow({ periodStart: "2026-06-30", periodEnd: "2025-07-01" }, base, OPTS).ok).toBe(false);
  });
  it("rejects future-dated periods (after as-of)", () => {
    expect(checkPeriodWindow({ periodStart: "2027-01-01", periodEnd: "2027-06-30" }, base, OPTS).ok).toBe(false);
  });
  it("rejects unparseable dates", () => {
    expect(checkPeriodWindow({ periodStart: "not-a-date", periodEnd: "2026-06-30" }, base, OPTS).ok).toBe(false);
  });
});
