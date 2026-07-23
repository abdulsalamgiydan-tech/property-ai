import { z } from "zod";

/** Verbatim disclaimers required in every StrategyOutput. */
export const STRATEGY_DISCLAIMERS = [
  "This strategy is general information only, prepared from the inputs you provided. It is not personal financial advice.",
  "Propellect is independent. We do not earn commissions from property developers, agents, lenders, or any third party.",
  "Property markets carry risk including capital loss. Past performance does not predict future returns.",
  "Confirm tax, lending, and legal questions with a licensed accountant, mortgage broker, and conveyancer respectively before acting.",
] as const;

export type StrategyOutput = {
  archetype_id: string;
  archetype_display_name: string;
  archetype_one_liner: string;
  fit_confidence: "high" | "medium" | "low";
  fit_reasoning: string;

  strategy_summary: string;

  key_metrics: {
    target_property_count: number;
    target_purchase_price_band: { min: number; max: number };
    target_gross_yield_min_percent: number;
    target_growth_min_percent: number;
    target_lvr_max_percent: number;
    expected_first_purchase_window_months: { min: number; max: number };
  };

  timeline: Array<{
    year: number;
    milestone: string;
  }>;

  property_profile: {
    type: string;
    location_profile: string;
    yield_target_percent: number;
    growth_indicators: string[];
    avoid_list: string[];
  };

  financing_approach: string;

  risks_and_mitigations: Array<{
    risk: string;
    mitigation: string;
  }>;

  next_steps: string[];

  full_strategy_markdown: string;

  disclaimers: string[];
};

const priceBandSchema = z.object({
  min: z.number(),
  max: z.number(),
});

const windowMonthsSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
});

export const strategyOutputSchema = z
  .object({
    archetype_id: z.string().min(1),
    archetype_display_name: z.string().min(1),
    archetype_one_liner: z.string().min(1),
    fit_confidence: z.enum(["high", "medium", "low"]),
    fit_reasoning: z.string().min(1),

    strategy_summary: z.string().min(1),

    key_metrics: z.object({
      target_property_count: z.number().int().min(0),
      target_purchase_price_band: priceBandSchema,
      target_gross_yield_min_percent: z.number(),
      target_growth_min_percent: z.number(),
      target_lvr_max_percent: z.number(),
      expected_first_purchase_window_months: windowMonthsSchema,
    }),

    timeline: z.array(
      z.object({
        year: z.number().int(),
        milestone: z.string().min(1),
      })
    ),

    property_profile: z.object({
      type: z.string().min(1),
      location_profile: z.string().min(1),
      yield_target_percent: z.number(),
      growth_indicators: z.array(z.string()),
      avoid_list: z.array(z.string()),
    }),

    financing_approach: z.string().min(1),

    risks_and_mitigations: z.array(
      z.object({
        risk: z.string().min(1),
        mitigation: z.string().min(1),
      })
    ),

    next_steps: z.array(z.string().min(1)).length(5),

    full_strategy_markdown: z.string().min(1),

    disclaimers: z.tuple([
      z.literal(STRATEGY_DISCLAIMERS[0]),
      z.literal(STRATEGY_DISCLAIMERS[1]),
      z.literal(STRATEGY_DISCLAIMERS[2]),
      z.literal(STRATEGY_DISCLAIMERS[3]),
    ]),
  })
  .strict();

export type StrategyOutputParseResult =
  | { ok: true; output: StrategyOutput }
  | { ok: false; error: z.ZodError };

export function parseStrategyOutputJson(data: unknown): StrategyOutputParseResult {
  const r = strategyOutputSchema.safeParse(data);
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true, output: r.data as StrategyOutput };
}
