import { describe, expect, it } from "vitest";
import { resolveMetric, computeGrossYield, type MetricCandidate } from "./metricFallback";

const propellectSuburb = (value: number | null, over: Partial<MetricCandidate> = {}): MetricCandidate => ({
  value,
  unit: "AUD",
  provider: "Propellect",
  sourceField: "v_suburb_market_snapshot_v1.median_sale_price_12m",
  geographyLevel: "suburb",
  propertyType: "house",
  bedrooms: null,
  asOf: "2026-06-01",
  retrievedAt: "2026-07-22",
  status: "direct",
  quality: "high",
  ...over,
});
const stashSuburb = (value: number | null, over: Partial<MetricCandidate> = {}): MetricCandidate => ({
  value,
  unit: "AUD/week",
  provider: "Stash Property",
  sourceField: "stash.median_rent.house",
  geographyLevel: "suburb",
  propertyType: "house",
  bedrooms: null,
  asOf: "2026-06-30",
  retrievedAt: "2026-08-02",
  status: "direct",
  quality: "medium",
  ...over,
});
const postcodeContext = (value: number | null, over: Partial<MetricCandidate> = {}): MetricCandidate => ({
  value,
  unit: "AUD/week",
  provider: "Propellect",
  sourceField: "v_postcode_market_snapshot_v1.median_weekly_rent_latest",
  geographyLevel: "postcode",
  geographyLabel: "Postcode 2527",
  propertyType: "house",
  bedrooms: null,
  asOf: "2026-01-01",
  retrievedAt: "2026-07-22",
  status: "direct",
  quality: "high",
  ...over,
});

describe("resolveMetric precedence", () => {
  it("prefers a direct Propellect suburb value over Stash and postcode context", () => {
    const r = resolveMetric([propellectSuburb(900000), stashSuburb(905000), postcodeContext(977500)]);
    expect(r.provider).toBe("Propellect");
    expect(r.geographyLevel).toBe("suburb");
    expect(r.value).toBe(900000);
    expect(r.status).toBe("direct");
    expect(r.fallbackReason).toBeNull();
  });

  it("uses Stash only to fill a null Propellect suburb gap (never overwrites a populated value)", () => {
    const filled = resolveMetric([propellectSuburb(null, { unit: "AUD/week" }), stashSuburb(680)]);
    expect(filled.provider).toBe("Stash Property");
    expect(filled.value).toBe(680);
    expect(filled.status).toBe("direct");

    const kept = resolveMetric([propellectSuburb(700, { unit: "AUD/week" }), stashSuburb(680)]);
    expect(kept.provider).toBe("Propellect");
    expect(kept.value).toBe(700);
  });

  it("labels a postcode/LGA fallback as contextual with an explicit reason", () => {
    const r = resolveMetric([propellectSuburb(null), stashSuburb(null), postcodeContext(710)]);
    expect(r.status).toBe("contextual");
    expect(r.geographyLevel).toBe("postcode");
    expect(r.value).toBe(710);
    expect(r.fallbackReason).toContain("Postcode 2527");
  });

  it("returns unavailable with a specific reason when nothing compatible exists", () => {
    const r = resolveMetric([propellectSuburb(null), stashSuburb(null)], { unavailableReason: "no rent source at any level" });
    expect(r.status).toBe("unavailable");
    expect(r.value).toBeNull();
    expect(r.fallbackReason).toContain("no rent source");
  });

  it("never mixes house and unit — a unit-typed value is skipped when a house value is required", () => {
    const r = resolveMetric([stashSuburb(640000, { propertyType: "unit" })], { propertyType: "house" });
    expect(r.status).toBe("unavailable");
    expect(r.fallbackReason).toMatch(/property-type/);
  });

  it("never mixes aggregate and bedroom-specific statistics", () => {
    const r = resolveMetric([stashSuburb(650, { bedrooms: 3 })], { propertyType: "house", bedrooms: null });
    expect(r.status).toBe("unavailable");
    expect(r.fallbackReason).toMatch(/bedroom/);
  });
});

describe("computeGrossYield compatibility", () => {
  it("computes yield when price and rent share geography and property type", () => {
    const y = computeGrossYield(
      { value: 900000, geographyLevel: "suburb", propertyType: "house" },
      { value: 680, geographyLevel: "suburb", propertyType: "house" }
    );
    expect(y.value).toBeCloseTo(3.93, 2);
    expect(y.reason).toBeNull();
  });

  it("refuses to compute yield from a suburb price and a postcode rent (geography mismatch)", () => {
    const y = computeGrossYield(
      { value: 900000, geographyLevel: "suburb", propertyType: "house" },
      { value: 710, geographyLevel: "postcode", propertyType: "house" }
    );
    expect(y.value).toBeNull();
    expect(y.reason).toMatch(/geography/);
  });

  it("refuses to compute yield across property types", () => {
    const y = computeGrossYield(
      { value: 900000, geographyLevel: "suburb", propertyType: "house" },
      { value: 500, geographyLevel: "suburb", propertyType: "unit" }
    );
    expect(y.value).toBeNull();
    expect(y.reason).toMatch(/property type/);
  });
});
