import { afterEach, describe, expect, it, vi } from "vitest";
import { getSuggestedAssumptionsForSuburb } from "./suburbAssumptions";

describe("getSuggestedAssumptionsForSuburb", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns no_match without calling fetch when the suburb is blank", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const outcome = await getSuggestedAssumptionsForSuburb("", "NSW");
    expect(outcome).toEqual({ available: false, reason: "no_match" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes through an unavailable outcome for a state with no warehouse coverage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ available: false, reason: "state_not_covered" }), { status: 200 }))
    );
    const outcome = await getSuggestedAssumptionsForSuburb("Calderwood", "QLD");
    expect(outcome).toEqual({ available: false, reason: "state_not_covered" });
  });

  it("passes through a real match with partial data (rental growth missing stays null, never 0)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            available: true,
            geographyId: "abc-123",
            geographyCode: "12345",
            geographyName: "Calderwood",
            suggestions: { suburbGrowthPercent: 4.2, vacancyPercent: null, rentalGrowthPercent: null },
            medianSalePrice12m: 950000,
            medianWeeklyRentLatest: null,
          }),
          { status: 200 }
        )
      )
    );
    const outcome = await getSuggestedAssumptionsForSuburb("Calderwood", "NSW");
    expect(outcome.available).toBe(true);
    if (outcome.available) {
      expect(outcome.suggestions.suburbGrowthPercent).toBe(4.2);
      expect(outcome.suggestions.vacancyPercent).toBeNull();
      expect(outcome.suggestions.rentalGrowthPercent).toBeNull();
    }
  });

  it("treats a 404 (feature disabled) as a soft failure, not a thrown error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const outcome = await getSuggestedAssumptionsForSuburb("Calderwood", "NSW");
    expect(outcome).toEqual({ available: false, reason: "feature_disabled" });
  });

  it("treats a network failure as a soft failure, not a thrown error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const outcome = await getSuggestedAssumptionsForSuburb("Calderwood", "NSW");
    expect(outcome).toEqual({ available: false, reason: "request_failed" });
  });
});
