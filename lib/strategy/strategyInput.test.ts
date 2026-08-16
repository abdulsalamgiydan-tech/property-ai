import { describe, expect, it } from "vitest";
import {
  stripStrategyFirstName,
  type StrategyInput,
} from "@/lib/strategy/strategyInput";

const input: StrategyInput = {
  firstName: "Alex",
  annualGrossIncome: 120_000,
  annualSavingsRate: 20_000,
  liquidDepositAvailable: 100_000,
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
  preferredStates: ["NSW"],
  exclusions: {
    avoidRegional: false,
    avoidMiningTowns: true,
    avoidApartments: false,
    avoidNewBuilds: false,
  },
  successVision: "Build a resilient portfolio.",
  primaryConcern: "Interest-rate changes.",
  additionalContext: "",
};

describe("stripStrategyFirstName", () => {
  it("removes firstName without mutating the validated input", () => {
    const stripped = stripStrategyFirstName(input);

    expect(stripped).not.toHaveProperty("firstName");
    expect(input.firstName).toBe("Alex");
    expect(stripped.annualGrossIncome).toBe(input.annualGrossIncome);
  });

  it("returns an equivalent copy when firstName is absent", () => {
    const anonymousInput: StrategyInput = { ...input };
    delete anonymousInput.firstName;

    expect(stripStrategyFirstName(anonymousInput)).toEqual(anonymousInput);
  });
});
