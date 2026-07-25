import { z } from "zod";

export const onboardingGoals = ["investor", "first_home_buyer", "researching"] as const;
export const strategyFocusOptions = ["balanced", "capital_growth", "cash_flow"] as const;
export const timeframeOptions = ["0_2_years", "3_5_years", "6_10_years", "10_plus_years"] as const;
export const budgetRangeOptions = ["under_500k", "500k_750k", "750k_1m", "1m_1_5m", "1_5m_plus", "not_sure"] as const;
export const depositRangeOptions = ["under_100k", "100k_200k", "200k_350k", "350k_plus", "not_sure"] as const;
export const propertyTypeOptions = ["house", "townhouse", "apartment", "duplex", "land"] as const;
export const riskToleranceOptions = ["conservative", "balanced", "higher_growth"] as const;
export const buyerContextOptions = ["first_home_buyer", "investor", "owner_occupier", "researching"] as const;
export const portfolioStatusOptions = ["none", "one_property", "two_to_four", "five_plus"] as const;
export const guidanceLevelOptions = ["light", "guided", "detailed"] as const;
export const notificationFrequencyOptions = ["none", "weekly", "monthly"] as const;

const nullableEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).nullable().optional();

export const onboardingPreferencesSchema = z.object({
  primaryGoal: nullableEnum(onboardingGoals),
  strategyFocus: nullableEnum(strategyFocusOptions),
  investmentTimeframe: nullableEnum(timeframeOptions),
  budgetRange: nullableEnum(budgetRangeOptions),
  depositRange: nullableEnum(depositRangeOptions),
  statesOfInterest: z.array(z.string().length(3)).max(8).default([]),
  preferredPropertyTypes: z.array(z.enum(propertyTypeOptions)).max(5).default([]),
  riskTolerance: nullableEnum(riskToleranceOptions),
  buyerContext: nullableEnum(buyerContextOptions),
  portfolioStatus: nullableEnum(portfolioStatusOptions),
  guidanceLevel: nullableEnum(guidanceLevelOptions),
  notificationFrequency: nullableEnum(notificationFrequencyOptions),
  completionStep: z.number().int().min(1).max(4).default(4),
  skipped: z.boolean().default(false),
  editedFrom: z.enum(["onboarding", "settings"]).default("onboarding"),
});

export type OnboardingPreferencesInput = z.input<typeof onboardingPreferencesSchema>;
export type OnboardingPreferences = z.output<typeof onboardingPreferencesSchema>;
export type OnboardingGoal = (typeof onboardingGoals)[number];

export function normaliseOnboardingPreferences(input: OnboardingPreferencesInput): OnboardingPreferences {
  return onboardingPreferencesSchema.parse(input);
}

export function onboardingDefaults(): OnboardingPreferences {
  return normaliseOnboardingPreferences({
    primaryGoal: null,
    strategyFocus: "balanced",
    investmentTimeframe: null,
    budgetRange: null,
    depositRange: null,
    statesOfInterest: [],
    preferredPropertyTypes: [],
    riskTolerance: "balanced",
    buyerContext: null,
    portfolioStatus: null,
    guidanceLevel: "guided",
    notificationFrequency: "monthly",
    completionStep: 1,
    skipped: false,
    editedFrom: "onboarding",
  });
}

export function preferenceSummary(prefs: Partial<OnboardingPreferences>): string {
  const focus = prefs.strategyFocus === "cash_flow" ? "cash-flow" : prefs.strategyFocus === "capital_growth" ? "capital-growth" : "balanced";
  const states = prefs.statesOfInterest?.length ? prefs.statesOfInterest.join(", ") : "your selected markets";
  return `Defaulting to a ${focus} lens across ${states}. This is personalisation only, not financial advice.`;
}
