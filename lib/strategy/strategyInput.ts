import { z } from "zod";

export type GoalRanking =
  | "passive_income"
  | "capital_growth"
  | "tax_efficiency"
  | "financial_independence"
  | "kids_future"
  | "single_security_asset";

export type RiskTolerance = "conservative" | "moderate" | "aggressive";
export type HandsOnPreference = "hands_off" | "light_touch" | "hands_on";
export type HousingSituation = "own_ppor" | "renting" | "with_family";

export type StrategyInput = {
  firstName?: string;

  annualGrossIncome: number;
  partnerAnnualGrossIncome?: number;
  annualSavingsRate: number;
  liquidDepositAvailable: number;

  housingSituation: HousingSituation;
  ppor: {
    estimatedValue: number;
    loanBalance: number;
  } | null;

  existingInvestmentProperties: Array<{
    estimatedValue: number;
    loanBalance: number;
    weeklyRent: number;
  }>;

  otherDebts: number;
  age: number;
  dependentsCount: number;

  investmentHorizonYears: number;
  intendedPortfolioSize: 1 | 2 | 3 | 4 | 5;

  primaryGoal: GoalRanking;
  secondaryGoal: GoalRanking | null;

  riskTolerance: RiskTolerance;
  handsOnPreference: HandsOnPreference;

  preferredStates: string[];
  exclusions: {
    avoidRegional: boolean;
    avoidMiningTowns: boolean;
    avoidApartments: boolean;
    avoidNewBuilds: boolean;
  };

  successVision: string;
  primaryConcern: string;
  additionalContext: string;
};

export type StrategyInputWithoutFirstName = Omit<StrategyInput, "firstName">;

export function stripStrategyFirstName(input: StrategyInput): StrategyInputWithoutFirstName {
  const stripped = { ...input };
  delete stripped.firstName;
  return stripped;
}

const goalRankingSchema = z.enum([
  "passive_income",
  "capital_growth",
  "tax_efficiency",
  "financial_independence",
  "kids_future",
  "single_security_asset",
]);

const ipSchema = z.object({
  estimatedValue: z.number().min(0),
  loanBalance: z.number().min(0),
  weeklyRent: z.number().min(0),
});

export const strategyInputSchema = z
  .object({
    firstName: z.string().max(120).optional(),
    annualGrossIncome: z
      .number()
      .gt(0, "Annual gross income must be greater than zero.")
      .lt(5_000_000, "Annual gross income must be less than 5,000,000."),
    partnerAnnualGrossIncome: z.number().min(0).optional(),
    annualSavingsRate: z.number().min(0),
    liquidDepositAvailable: z.number().min(0),
    housingSituation: z.enum(["own_ppor", "renting", "with_family"]),
    ppor: z
      .object({
        estimatedValue: z.number().min(0),
        loanBalance: z.number().min(0),
      })
      .nullable(),
    existingInvestmentProperties: z.array(ipSchema),
    otherDebts: z.number().min(0),
    age: z.number().int().min(18).max(90),
    dependentsCount: z.number().int().min(0).max(10),
    investmentHorizonYears: z.number().int().min(1).max(50),
    intendedPortfolioSize: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    primaryGoal: goalRankingSchema,
    secondaryGoal: goalRankingSchema.nullable(),
    riskTolerance: z.enum(["conservative", "moderate", "aggressive"]),
    handsOnPreference: z.enum(["hands_off", "light_touch", "hands_on"]),
    preferredStates: z.array(z.string().min(1).max(8)),
    exclusions: z.object({
      avoidRegional: z.boolean(),
      avoidMiningTowns: z.boolean(),
      avoidApartments: z.boolean(),
      avoidNewBuilds: z.boolean(),
    }),
    successVision: z.string().max(500),
    primaryConcern: z.string().max(500),
    additionalContext: z.string().max(500),
  })
  .strict()
  .refine(
    (data) =>
      (data.housingSituation === "own_ppor" && data.ppor !== null) ||
      (data.housingSituation !== "own_ppor" && data.ppor === null),
    { message: "PPOR details must be provided when you own your home, and omitted otherwise.", path: ["ppor"] }
  );

export type StrategyInputParseResult =
  | { ok: true; input: StrategyInput }
  | { ok: false; error: z.ZodError };

export function parseStrategyInput(body: unknown): StrategyInputParseResult {
  const r = strategyInputSchema.safeParse(body);
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true, input: r.data as StrategyInput };
}
