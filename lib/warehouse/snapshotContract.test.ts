import { describe, expect, it } from "vitest";
import { fillMissingSnapshotFields, V2_OMITTED_SNAPSHOT_FIELDS } from "./snapshotContract";
import type { MarketSnapshot, MarketSnapshotV2 } from "@/lib/warehouse/queries";

// Minimal factory — only the fields under test matter; the rest are null.
function view(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    geography_id: "SAL_10749_ASGS3_2021",
    geography_code: "10749",
    geography_name: "Calderwood",
    state_code: "1",
    latest_sales_period: "2026-06-01",
    latest_rent_period: null,
    latest_yield_period: null,
    latest_approvals_period: "2026-06-01",
    latest_demographics_period: 2021,
    snapshot_generated_at: "2026-07-22T00:00:00Z",
    coverage_status: "partial",
    sales_volume_12m: 120,
    median_sale_price_12m: 900000,
    median_sale_price_prev_12m: 850000,
    annual_price_change_pct: null,
    median_sale_price_detached: 900000,
    median_sale_price_apartment: null,
    median_sale_price_townhouse: null,
    sales_sample_confidence: "high",
    median_weekly_rent_latest: null,
    median_weekly_rent_prev: null,
    annual_rent_change_pct: null,
    rent_confidence: null,
    gross_yield_pct: null,
    yield_confidence: null,
    yield_sale_period_used: null,
    yield_rent_period_used: null,
    dwelling_stock_total: 2500,
    approvals_12m: 40,
    approvals_per_1000_dwellings: 16,
    approvals_detached_12m: 30,
    approvals_other_residential_12m: 10,
    supply_confidence: "high",
    sales_turnover_pct: 16.8,
    renter_household_pct: 20,
    owner_occupier_pct: 80,
    total_population: 6000,
    population_growth_2016_2021_pct: 120,
    total_households: 2000,
    median_weekly_household_income: 2200,
    renter_share: 0.2,
    owner_with_mortgage_share: 0.6,
    price_to_income_ratio: 7.9,
    rent_to_income_ratio: null,
    est_monthly_repayment_owner_occupier: 4200,
    est_monthly_repayment_investor: 5632.99,
    repayment_to_income_pct: 44,
    rba_rate_used: 6.2,
    rba_rate_period: "2026-05-31",
    assumption_scenario_code: "standard_20pct_deposit_30yr_pi",
    affordability_confidence: "medium",
    confidence_label: "high",
    data_quality_status: "passed",
    direct_or_derived: "direct",
    missing_metric_reasons: { rent: "no suburb-level rent source" },
    ...overrides,
  };
}

// A v2 RPC result: same geography, but with the omitted fields simply absent
// from the object (that is exactly what the narrower RETURNS TABLE produces).
function v2(overrides: Partial<MarketSnapshotV2> = {}): MarketSnapshotV2 {
  const full = view();
  const obj = { ...full, jurisdiction: "NSW", geography_method: "direct" } as unknown as Record<string, unknown>;
  for (const f of V2_OMITTED_SNAPSHOT_FIELDS) delete obj[f];
  return { ...(obj as unknown as MarketSnapshotV2), ...overrides };
}

describe("fillMissingSnapshotFields", () => {
  it("recovers every RPC-omitted field from the view for the same geography", () => {
    const merged = fillMissingSnapshotFields(v2(), view())!;
    expect(merged.est_monthly_repayment_investor).toBe(5632.99);
    expect(merged.rba_rate_used).toBe(6.2);
    expect(merged.rba_rate_period).toBe("2026-05-31");
    expect(merged.assumption_scenario_code).toBe("standard_20pct_deposit_30yr_pi");
    expect(merged.sales_turnover_pct).toBe(16.8);
    expect(merged.direct_or_derived).toBe("direct");
    expect(merged.data_quality_status).toBe("passed");
  });

  it("preserves populated primary (RPC) values and jurisdiction — never overwrites them from the view", () => {
    const primary = v2({ median_sale_price_12m: 999999, jurisdiction: "NSW" });
    const merged = fillMissingSnapshotFields(primary, view({ median_sale_price_12m: 111111 }))!;
    expect(merged.median_sale_price_12m).toBe(999999);
    expect(merged.jurisdiction).toBe("NSW");
  });

  it("leaves genuinely-null fields null in both sources (no fabrication)", () => {
    const merged = fillMissingSnapshotFields(v2(), view({ median_weekly_rent_latest: null, gross_yield_pct: null }))!;
    expect(merged.median_weekly_rent_latest).toBeNull();
    expect(merged.gross_yield_pct).toBeNull();
  });

  it("returns the view row (with null jurisdiction/method) when the RPC returns nothing", () => {
    const merged = fillMissingSnapshotFields(null, view())!;
    expect(merged.est_monthly_repayment_investor).toBe(5632.99);
    expect(merged.jurisdiction).toBeNull();
  });

  it("returns null when neither source has data", () => {
    expect(fillMissingSnapshotFields(null, null)).toBeNull();
  });
});
