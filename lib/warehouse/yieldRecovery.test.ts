import { describe, expect, it } from "vitest";
import { recoverGrossYield, type YieldInput } from "./yieldRecovery";

const price = (over: Partial<YieldInput> = {}): YieldInput => ({
  value: 900000,
  period: "2026-06-30",
  geographyLevel: "suburb",
  propertyType: "house",
  sourceField: "v_suburb_market_snapshot_v1.median_sale_price_12m",
  ...over,
});
const rent = (over: Partial<YieldInput> = {}): YieldInput => ({
  value: 680,
  period: "2026-06-30",
  geographyLevel: "suburb",
  propertyType: "house",
  sourceField: "v_suburb_market_snapshot_v1.median_weekly_rent_latest",
  ...over,
});

describe("recoverGrossYield", () => {
  it("computes yield from compatible suburb price + rent and records both inputs", () => {
    const r = recoverGrossYield(price(), rent());
    expect(r.available).toBe(true);
    expect(r.grossYieldPct).toBeCloseTo(3.93, 2);
    expect(r.priceInput?.sourceField).toContain("median_sale_price_12m");
    expect(r.rentInput?.sourceField).toContain("median_weekly_rent_latest");
    expect(r.priceInput?.period).toBe("2026-06-30");
    expect(r.rentInput?.period).toBe("2026-06-30");
  });

  it("refuses suburb price ÷ postcode rent (the Calderwood rule)", () => {
    const r = recoverGrossYield(price(), rent({ geographyLevel: "postcode" }));
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/geography/);
  });

  it("refuses to mix property types", () => {
    const r = recoverGrossYield(price({ propertyType: "house" }), rent({ propertyType: "unit" }));
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/property type/);
  });

  it("refuses observations with incompatible periods", () => {
    const r = recoverGrossYield(price({ period: "2026-06-30" }), rent({ period: "2023-01-01" }), { maxPeriodGapDays: 400 });
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/period/);
  });

  it("is unavailable when either input is missing (no fabrication)", () => {
    expect(recoverGrossYield(price({ value: null }), rent()).available).toBe(false);
    expect(recoverGrossYield(price(), rent({ value: null })).available).toBe(false);
  });
});
