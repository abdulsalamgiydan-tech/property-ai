import { describe, it, expect } from "vitest";
import { parseVicPropertySales } from "./parse.mjs";
import { toCanonicalObservation, mapSuburbToGeography } from "./normalize.mjs";
import { REAL_ROWS, SPINE_FIXTURE } from "./fixtures.mjs";
import { toMetricProvenance, type SourceRegistryEntry } from "../../../lib/warehouse/metricProvenance";
import { resolveSuburbMetricProvenance } from "../../../lib/warehouse/suburbMetricProvenance";
import registryJson from "../../config/v3_source_registry.json";

const registry = registryJson as unknown as SourceRegistryEntry[];
const NOW = new Date("2026-08-23T00:00:00Z");
const OPTS = { retrievedAt: "2026-08-23T00:00:00Z", resourceSha: "sha-int" };

describe("VIC VG sales — one complete OFFLINE path (fixture → search result)", () => {
  it("fixture → parse → normalize → geography → provenance → rendered direct metric", () => {
    // 1. parse the representative official-format fixture
    const parsed = parseVicPropertySales(REAL_ROWS, OPTS);
    const abbHouse = parsed.records.find((r) => r.suburb === "ABBOTSFORD" && r.property_type === "house");
    expect(abbHouse).toBeTruthy();

    // 2. normalize + strict geography mapping
    const canon = toCanonicalObservation(abbHouse, SPINE_FIXTURE, { ingestedAt: "2026-08-23" });
    expect(canon.ok).toBe(true);
    if (!canon.ok) return;
    expect(canon.geography_id).toBe("SAL21134"); // VIC Abbotsford (not the NSW one)

    // 3. canonical observation → provenance (the "rendered" serving record)
    const p = toMetricProvenance(canon.observation, registry, NOW);
    expect(p.value).toBe(1275000);
    expect(p.classification).toBe("direct");
    expect(p.source).toBe("Victorian Property Sales Statistics");
    expect(p.attribution).toContain("State of Victoria");
    expect(p.reportingPeriod).toBe("2026-06-30");
    expect(p.freshness).toBe("fresh");
    expect(p.confidence).toBe("high");
    expect(p.missingReason).toBeNull();
  });

  it("serving bridge renders a full suburb result with source + freshness + honest gaps", () => {
    // MarketSnapshot-like row for a VIC suburb: has sale + growth, but NO rent.
    const snapshot = {
      state_code: "VIC",
      median_sale_price_12m: 1275000,
      annual_price_change_pct: 5.4,
      median_weekly_rent_latest: null, // missing → must be unavailable, never 0
      gross_yield_pct: null,
      latest_sales_period: "2026-06-30",
      latest_rent_period: null,
      latest_yield_period: null,
    };
    const r = resolveSuburbMetricProvenance(snapshot, registry, NOW);

    // sale price: DIRECT, sourced, fresh
    expect(r.salePrice.value).toBe(1275000);
    expect(r.salePrice.classification).toBe("direct");
    expect(r.salePrice.source).toBe("Victorian Property Sales Statistics");
    expect(r.salePrice.freshness).toBe("fresh");

    // growth: DERIVED, never upgraded to direct
    expect(r.annualGrowth.classification).toBe("derived");
    expect(r.annualGrowth.value).toBe(5.4);

    // rent + yield: missing → UNAVAILABLE with a specific reason, value stays null (never 0)
    expect(r.weeklyRent.value).toBeNull();
    expect(r.weeklyRent.classification).toBe("unavailable");
    expect(r.weeklyRent.missingReason).toBeTruthy();
    expect(r.grossYield.value).toBeNull();
    expect(r.grossYield.classification).toBe("unavailable");
    expect(r.grossYield.missingReason).toContain("both a sale-price and a rent");
  });

  it("a suburb with no price observation → unavailable, not fabricated", () => {
    const snapshot = {
      state_code: "NT", // no registered sales source
      median_sale_price_12m: null,
      annual_price_change_pct: null,
      median_weekly_rent_latest: null,
      gross_yield_pct: null,
      latest_sales_period: null,
      latest_rent_period: null,
      latest_yield_period: null,
    };
    const r = resolveSuburbMetricProvenance(snapshot, registry, NOW);
    expect(r.salePrice.classification).toBe("unavailable");
    expect(r.salePrice.value).toBeNull();
    expect(r.salePrice.missingReason).toContain("No registered sale-price source");
  });

  it("a stale observation is labelled stale, not silently 'fresh'", () => {
    const stale = toMetricProvenance(
      {
        metric: "median_sale_price_overall",
        value: 900000,
        unit: "AUD",
        reportingPeriod: "2025-06-30",
        sourceId: "vic_vg_property_sales",
        sourcePublished: "2025-06-30", // ~14 months old, quarterly cadence
        classification: "direct",
      },
      registry,
      NOW,
    );
    expect(["stale", "expired"]).toContain(stale.freshness);
    expect(stale.confidence).not.toBe("high");
  });

  it("invalid + ambiguous geography are rejected (never guessed)", () => {
    expect(mapSuburbToGeography("NOWHERE", "VIC", SPINE_FIXTURE)).toMatchObject({ ok: false });
    expect(mapSuburbToGeography("ARARAT", "VIC", SPINE_FIXTURE).ok).toBe(false); // 2 candidates → ambiguous
    expect(mapSuburbToGeography("ABBOTSFORD", "VIC", SPINE_FIXTURE)).toMatchObject({ ok: true, geography_id: "SAL21134" });
  });
});
