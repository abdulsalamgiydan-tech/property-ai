import { describe, it, expect } from "vitest";
import {
  classifyFreshness,
  toMetricProvenance,
  type MetricObservation,
  type SourceRegistryEntry,
} from "./metricProvenance";

const NOW = new Date("2026-08-23T00:00:00Z");

const registry: SourceRegistryEntry[] = [
  {
    id: "sa_metro_median_house_sales",
    name: "Metropolitan Median House Sales",
    provider: "Government of South Australia (Valuer-General)",
    jurisdiction: "SA",
    landing: "https://data.sa.gov.au/data/dataset/metro-median-house-sales",
    resource_url: "https://data.sa.gov.au/data/api/3/action/package_show?id=metro-median-house-sales",
    licence: "Creative Commons Attribution",
    attribution: "© Government of South Australia (CC BY 4.0)",
    cadence: "quarterly",
  },
];

function obs(partial: Partial<MetricObservation>): MetricObservation {
  return {
    metric: "median_sale_price_overall",
    value: 750000,
    unit: "AUD",
    propertyType: "house",
    reportingPeriod: "2026-Q1",
    sourceId: "sa_metro_median_house_sales",
    sourcePublished: "2026-07-01",
    ingestedAt: "2026-07-05",
    classification: "direct",
    method: "vg_bulk_v3",
    ...partial,
  };
}

describe("classifyFreshness", () => {
  it("returns 'fresh' within the quarterly stale window", () => {
    expect(classifyFreshness("2026-07-01", NOW, "quarterly")).toBe("fresh"); // ~53 days
  });
  it("returns 'stale' past the stale window but before expiry (quarterly)", () => {
    expect(classifyFreshness("2026-01-01", NOW, "quarterly")).toBe("stale"); // ~234 days
  });
  it("returns 'expired' past the expiry window (quarterly)", () => {
    expect(classifyFreshness("2024-01-01", NOW, "quarterly")).toBe("expired");
  });
  it("annual cadence tolerates older data before going stale", () => {
    expect(classifyFreshness("2026-01-01", NOW, "annual")).toBe("fresh"); // ~234 days < 400
  });
  it("returns 'unknown' for missing, unparseable, or future dates (never 'fresh')", () => {
    expect(classifyFreshness(null, NOW, "quarterly")).toBe("unknown");
    expect(classifyFreshness("not-a-date", NOW, "quarterly")).toBe("unknown");
    expect(classifyFreshness("2099-01-01", NOW, "quarterly")).toBe("unknown");
  });
});

describe("toMetricProvenance — present values keep their classification + gain attribution", () => {
  it("direct + fresh → high confidence, full source lineage", () => {
    const p = toMetricProvenance(obs({}), registry, NOW);
    expect(p.classification).toBe("direct");
    expect(p.freshness).toBe("fresh");
    expect(p.confidence).toBe("high");
    expect(p.value).toBe(750000);
    expect(p.source).toBe("Metropolitan Median House Sales");
    expect(p.sourceUrl).toContain("data.sa.gov.au");
    expect(p.licence).toBe("Creative Commons Attribution");
    expect(p.attribution).toContain("CC BY 4.0");
    expect(p.missingReason).toBeNull();
  });

  it("direct + stale → medium; direct + expired → low", () => {
    expect(toMetricProvenance(obs({ sourcePublished: "2026-01-01" }), registry, NOW).confidence).toBe("medium");
    expect(toMetricProvenance(obs({ sourcePublished: "2024-01-01" }), registry, NOW).confidence).toBe("low");
  });

  it("derived value is never upgraded to 'direct' and caps confidence", () => {
    const p = toMetricProvenance(
      obs({ metric: "gross_yield", value: 4.2, unit: "%", classification: "derived", method: "rent*52/price" }),
      registry,
      NOW,
    );
    expect(p.classification).toBe("derived");
    expect(p.confidence).toBe("medium"); // derived + fresh
    expect(p.method).toBe("rent*52/price");
  });

  it("fallback (broader geography) is always low confidence", () => {
    const p = toMetricProvenance(obs({ classification: "fallback" }), registry, NOW);
    expect(p.classification).toBe("fallback");
    expect(p.confidence).toBe("low");
  });
});

describe("toMetricProvenance — missing values are honest, never fabricated", () => {
  it("null value is forced to 'unavailable' with a specific reason and no confidence", () => {
    const p = toMetricProvenance(
      obs({ value: null, classification: "direct", missingReason: "SA suppresses suburbs with <10 sales." }),
      registry,
      NOW,
    );
    expect(p.value).toBeNull();
    expect(p.classification).toBe("unavailable"); // cannot claim 'direct' with no value
    expect(p.freshness).toBe("unknown");
    expect(p.confidence).toBe("none");
    expect(p.missingReason).toBe("SA suppresses suburbs with <10 sales.");
  });

  it("null value with no supplied reason still yields a specific (never generic) reason", () => {
    const withSource = toMetricProvenance(obs({ value: null, missingReason: null }), registry, NOW);
    expect(withSource.missingReason).toContain("sa_metro_median_house_sales");
    const noSource = toMetricProvenance(
      obs({ value: null, sourceId: null, missingReason: null, metric: "median_weekly_rent" }),
      registry,
      NOW,
    );
    expect(noSource.missingReason).toContain("No registered source");
    expect(noSource.sourceUrl).toBeNull();
  });

  it("NaN / non-finite value is treated as missing", () => {
    const p = toMetricProvenance(obs({ value: Number.NaN }), registry, NOW);
    expect(p.value).toBeNull();
    expect(p.classification).toBe("unavailable");
  });

  it("unknown source id → no fabricated licence/url", () => {
    const p = toMetricProvenance(obs({ sourceId: "does_not_exist" }), registry, NOW);
    expect(p.source).toBeNull();
    expect(p.sourceUrl).toBeNull();
    expect(p.licence).toBeNull();
  });
});
