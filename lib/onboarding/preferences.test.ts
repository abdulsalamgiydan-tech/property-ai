import { describe, expect, it } from "vitest";
import { normaliseOnboardingPreferences, onboardingDefaults, preferenceSummary } from "./preferences";

describe("onboarding preferences", () => {
  it("normalises a complete preference payload", () => {
    const prefs = normaliseOnboardingPreferences({
      ...onboardingDefaults(),
      primaryGoal: "investor",
      strategyFocus: "cash_flow",
      statesOfInterest: ["NSW", "VIC"],
      preferredPropertyTypes: ["house", "townhouse"],
      completionStep: 4,
    });

    expect(prefs.primaryGoal).toBe("investor");
    expect(prefs.preferredPropertyTypes).toEqual(["house", "townhouse"]);
    expect(preferenceSummary(prefs)).toContain("cash-flow");
  });

  it("rejects unsupported enum values", () => {
    expect(() => normaliseOnboardingPreferences({ ...onboardingDefaults(), strategyFocus: "hot_tip" as never })).toThrow();
  });
});
