import { describe, expect, it } from "vitest";
import {
  parseStrategyOutputJson,
  STRATEGY_DISCLAIMERS,
} from "@/lib/strategy/strategyOutput";

const VALID_OUTPUT = {
  archetype_id: "A1",
  archetype_display_name: "The First Foothold",
  archetype_one_liner: "Build a sustainable first step.",
  fit_confidence: "high",
  fit_reasoning: "The inputs support a measured first purchase.",
  strategy_summary: "Start conservatively and preserve flexibility.",
  key_metrics: {
    target_property_count: 1,
    target_purchase_price_band: { min: 500_000, max: 650_000 },
    target_gross_yield_min_percent: 4.5,
    target_growth_min_percent: 3,
    target_lvr_max_percent: 80,
    expected_first_purchase_window_months: { min: 6, max: 12 },
  },
  timeline: [{ year: 1, milestone: "Purchase the first property." }],
  property_profile: {
    type: "Established house",
    location_profile: "Diversified outer-metro market",
    yield_target_percent: 4.5,
    growth_indicators: ["Population growth"],
    avoid_list: ["Single-industry towns"],
  },
  financing_approach: "Maintain an offset and a cash buffer.",
  risks_and_mitigations: [
    {
      risk: "Interest rates rise",
      mitigation: "Stress-test repayments before purchasing.",
    },
  ],
  next_steps: Array.from({ length: 5 }, (_, index) => `Action ${index + 1}`),
  full_strategy_markdown: "# Strategy\n\nA measured investment strategy.",
  disclaimers: [...STRATEGY_DISCLAIMERS],
};

describe("parseStrategyOutputJson", () => {
  it("accepts exactly five next steps", () => {
    const result = parseStrategyOutputJson(VALID_OUTPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.next_steps).toHaveLength(5);
    }
  });

  it.each([3, 4, 6])("rejects %i next steps", (count) => {
    const result = parseStrategyOutputJson({
      ...VALID_OUTPUT,
      next_steps: Array.from({ length: count }, (_, index) => `Action ${index + 1}`),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["next_steps"],
          }),
        ])
      );
    }
  });
});
