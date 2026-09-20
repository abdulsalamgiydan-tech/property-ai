import { describe, expect, it } from "vitest";
import { calculateCGT, type CalculateCgtParams } from "@/lib/tax/budget2026Cgt";

const OLD_REGIME_BASE: CalculateCgtParams = {
  purchaseDate: new Date("2026-02-02T12:00:00"),
  purchasePrice: 500_000,
  saleDate: new Date("2027-02-02T12:00:00"),
  salePrice: 600_000,
  scenario: "POST_BUDGET_ESTABLISHED",
  propertyType: "established",
  holdingCostsCapitalised: 0,
  marginalRate: 0.39,
  carryForwardLossesAtSale: 0,
  cpiAnnualPercent: 0,
};

describe("old-regime CGT discount eligibility", () => {
  it("does not discount a gain when the event is on the acquisition anniversary", () => {
    const result = calculateCGT(OLD_REGIME_BASE);

    expect(result.regimeApplied).toBe("OLD_NO_DISCOUNT");
    expect(result.taxableGainAfterDiscount).toBe(100_000);
    expect(result.cgtPayable).toBe(39_000);
  });

  it("discounts a gain when the event is one day after the acquisition anniversary", () => {
    const result = calculateCGT({
      ...OLD_REGIME_BASE,
      saleDate: new Date("2027-02-03T12:00:00"),
    });

    expect(result.regimeApplied).toBe("OLD_50_DISCOUNT");
    expect(result.taxableGainAfterDiscount).toBe(50_000);
    expect(result.cgtPayable).toBe(19_500);
  });

  it("handles a leap-day acquisition as a calendar ownership period", () => {
    const result = calculateCGT({
      ...OLD_REGIME_BASE,
      purchaseDate: new Date("2024-02-29T12:00:00"),
      saleDate: new Date("2025-03-01T12:00:00"),
    });

    expect(result.regimeApplied).toBe("OLD_50_DISCOUNT");
    expect(result.taxableGainAfterDiscount).toBe(50_000);
  });

  it("does not discount the old-style side of a new-build election held under 12 months", () => {
    const result = calculateCGT({
      ...OLD_REGIME_BASE,
      purchaseDate: new Date("2027-07-01T12:00:00"),
      saleDate: new Date("2028-06-30T12:00:00"),
      propertyType: "new_build",
      scenario: "POST_BUDGET_NEW_BUILD",
    });

    expect(result.newBuildComparison?.oldRegimeTax).toBe(39_000);
  });

  it("does not discount the pre-commencement portion when total ownership is under 12 months", () => {
    const result = calculateCGT({
      ...OLD_REGIME_BASE,
      purchaseDate: new Date("2027-01-01T12:00:00"),
      purchasePrice: 100_000,
      saleDate: new Date("2027-10-01T12:00:00"),
      salePrice: 200_000,
      valueAtCommencementOverride: 150_000,
    });

    expect(result.regimeApplied).toBe("APPORTIONMENT");
    expect(result.preCommencementGain).toBe(50_000);
    expect(result.postCommencementRealGain).toBe(50_000);
    expect(result.taxableGainAfterDiscount).toBe(100_000);
    expect(result.cgtPayable).toBe(39_000);
  });
});
