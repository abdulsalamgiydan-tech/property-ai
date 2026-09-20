import { describe, expect, it } from "vitest";
import {
  parseStrategyInput,
  strategyInputSchema,
  type StrategyInput,
} from "@/lib/strategy/strategyInput";

const VALID_INPUT: StrategyInput = {
  annualGrossIncome: 120_000,
  annualSavingsRate: 24_000,
  liquidDepositAvailable: 80_000,
  housingSituation: "renting",
  ppor: null,
  existingInvestmentProperties: [],
  otherDebts: 0,
  age: 35,
  dependentsCount: 0,
  investmentHorizonYears: 15,
  intendedPortfolioSize: 2,
  primaryGoal: "capital_growth",
  secondaryGoal: "passive_income",
  riskTolerance: "moderate",
  handsOnPreference: "light_touch",
  preferredStates: ["QLD", "NSW"],
  exclusions: {
    avoidRegional: false,
    avoidMiningTowns: true,
    avoidApartments: false,
    avoidNewBuilds: false,
  },
  successVision: "",
  primaryConcern: "",
  additionalContext: "",
};

describe("strategyInputSchema goal ranking", () => {
  it("accepts different primary and secondary goals", () => {
    expect(strategyInputSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it("accepts no secondary goal", () => {
    expect(
      strategyInputSchema.safeParse({
        ...VALID_INPUT,
        secondaryGoal: null,
      }).success
    ).toBe(true);
  });

  it("rejects a secondary goal that duplicates the primary goal", () => {
    const result = parseStrategyInput({
      ...VALID_INPUT,
      secondaryGoal: VALID_INPUT.primaryGoal,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ["secondaryGoal"],
        message: "Secondary goal must be different from primary goal.",
      })
    );
  });
});
