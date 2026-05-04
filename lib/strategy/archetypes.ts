import type { StrategyInput } from "@/lib/strategy/strategyInput";

export type Archetype = {
  id: string;
  displayName: string;
  oneLiner: string;
  personality: string;
  strategyTemplate: string;
  watchOuts: string;
};

export const ARCHETYPES = {
  A1: {
    id: "A1",
    displayName: "The First Foothold",
    oneLiner: "Get a defendable first asset on the board without overreaching.",
    personality:
      "Patient, protective, anti-hype. Treats \"don't lose money on the first one\" as the whole game.",
    strategyTemplate:
      "Established freestanding house or low-strata townhouse, sub-A$500k, in an established outer-metro or large regional centre with diversified employment. Avoid new builds, off-the-plan, mining towns, single-employer regions. Target neutral-to-slightly-negative cashflow with decent yield (4%+). Hold 7+ years before considering #2.",
    watchOuts: "New-build sales pressure, interstate spruikers, FOMO from regional booms.",
  },
  A2: {
    id: "A2",
    displayName: "Yield Anchor",
    oneLiner: "Cashflow first, growth as a bonus — properties that pay their own way from day one.",
    personality: "Pragmatic, numbers-driven, sceptical of \"growth will come.\"",
    strategyTemplate:
      "Regional centres with population >50k, diversified economy, gross yield 5.5%+. Established 3BR house preferred over units. Target neutral or positive cashflow before tax. LVR ≤80% to avoid LMI. Reinvest cashflow surplus into offset to compound the deposit for #2.",
    watchOuts: "Yield traps in declining regions, mining-town volatility, yield achieved via stripping maintenance.",
  },
  A3: {
    id: "A3",
    displayName: "Metro Growth Foundation",
    oneLiner: "Plant a flag in the path of progress — accept short-term cashflow pain for long-term capital.",
    personality: "Long-game patient, comfortable with negative gearing as a feature not a bug.",
    strategyTemplate:
      "Outer-ring metro (~25–45km from CBD) of a capital city showing infrastructure pipeline (rail, hospital, education precinct). Established 3-4BR house on a decent block, A$650k–A$900k. Yield 3.5–4.5% (will be negatively geared). Hold 12+ years.",
    watchOuts:
      "Buying at peak of cycle, infrastructure announcements that don't materialise, paying for a \"premium\" already priced in.",
  },
  A4: {
    id: "A4",
    displayName: "Dual-Income Dwelling",
    oneLiner: "One title, two rents — engineered cashflow without sacrificing growth.",
    personality: "Slightly more entrepreneurial, OK with complexity, sees structural advantage.",
    strategyTemplate:
      "Duplex, dual-occupancy, or established house with detached granny flat / second-dwelling potential. Outer-metro or large regional. Two rental incomes lift gross yield to 6%+ while still on a growth-capable block.",
    watchOuts:
      "Council restrictions on second dwellings, complex insurance, tenant disputes between dwellings, depreciation of new build vs growth of land.",
  },
  A5: {
    id: "A5",
    displayName: "Regional Accumulator",
    oneLiner: "Stack multiple yield-positive regionals; let each one fund the deposit on the next.",
    personality: "Disciplined, systems-minded, treats it like a business not a lifestyle.",
    strategyTemplate:
      "Sequential acquisition of 3–5 regional sub-A$450k yield-positive properties, 18–30 months apart. Each must be cashflow-positive after tax to avoid serviceability throttle. Diversify across at least 2 states.",
    watchOuts:
      "Bank serviceability ceiling hits earlier than expected; concentration risk in single region; underestimating PM cost across a multi-state portfolio.",
  },
  A6: {
    id: "A6",
    displayName: "Capital Growth Sprinter",
    oneLiner: "Single high-quality blue-chip metro asset, leveraged hard, held forever.",
    personality:
      "Conviction-led, comfortable with leverage, sees property as a wealth-storage vehicle not a cashflow vehicle.",
    strategyTemplate:
      "Inner or middle-ring established house in a top-quartile capital city suburb (by historical 20-yr growth). A$1m–A$1.6m. Yield 2.5–3.5% (deeply negatively geared, intentional).",
    watchOuts:
      "Interest rate sensitivity is brutal at high leverage; long vacancy periods at premium price points; emotional attachment overriding numbers.",
  },
  A7: {
    id: "A7",
    displayName: "Defensive Income",
    oneLiner: "Capital preservation first, modest income second, no surprises.",
    personality: "Calm, protective, anti-leverage. Says \"no\" more than \"yes.\"",
    strategyTemplate:
      "Established freestanding home in a stable middle-ring metro suburb of a capital city. LVR ≤50%, ideally ≤30%. Yield 4%+. Avoid anything with body corporate complexity. Hold for income; growth is bonus.",
    watchOuts:
      "Aggressive negative gearing pre-retirement is wrong here; SMSF property is a separate conversation Propellect punts to a licensed advisor.",
  },
  A8: {
    id: "A8",
    displayName: "Balanced Builder",
    oneLiner: "A solid first investment that earns its keep and grows with the market.",
    personality: "Friendly, plain-spoken, neither pushing growth nor pushing yield.",
    strategyTemplate:
      "Established 3BR house, outer-ring metro of a capital city or top-3 regional centre, A$550k–A$800k. Yield 4–4.8%, neutral cashflow after tax. LVR 80%, no LMI. Hold 10+ years.",
    watchOuts:
      "This profile is what most spruikers target — buyers' agents and \"free\" property advice are usually selling stock, not strategy.",
  },
  A9: {
    id: "A9",
    displayName: "High Income Tax Optimiser",
    oneLiner: "Maximise the after-tax return — let the ATO co-fund the wealth-building.",
    personality: "Analytical, structurally-aware, values quantitative rigour.",
    strategyTemplate:
      "Newer property (≤5 years old) or substantially renovated to maximise depreciation. Outer-metro growth corridor or strong regional. Yield 4–5%. Quantity surveyor depreciation schedule mandatory. After-tax cashflow neutral or better despite headline negative gearing.",
    watchOuts: "Tax tail wagging the investment dog; new builds at developer margins; depreciation cliff after year 5 if poorly chosen.",
  },
  A10: {
    id: "A10",
    displayName: "Renovation Yield Add",
    oneLiner: "Buy under-rented, reposition, capture both yield and equity uplift.",
    personality: "Practical, hands-dirty, comfortable managing tradies.",
    strategyTemplate:
      "Established property in a stable suburb where median rent exceeds the listed rent of the target property by 15%+. Cosmetic reno budget A$20–60k. Target yield post-reno ≥5%. Refinance at 12 months on uplifted valuation.",
    watchOuts: "Reno scope creep, structural surprises, over-capitalising in low-growth areas, tenant displacement timing.",
  },
  A11: {
    id: "A11",
    displayName: "Equity-Funded Scaler",
    oneLiner: "Use your home's equity to fund the first investment without touching savings.",
    personality: "Educational, structurally-clear about what equity is and isn't.",
    strategyTemplate:
      "Top-up loan or split facility against PPOR equity to fund 20% deposit + costs on first IP. IP profile follows A8 (Balanced Builder) parameters. Cross-collateralisation explicitly avoided — separate facilities. Mortgage broker non-negotiable.",
    watchOuts: "Cross-collateralisation traps, PPOR being put at risk for IP performance, conflating equity with cash.",
  },
  A12: {
    id: "A12",
    displayName: "The Patient Hold",
    oneLiner: "Buy quality once, hold for a generation, ignore the noise.",
    personality: "Philosophical, anti-trading, multi-decade lens.",
    strategyTemplate:
      "Single high-quality established home in a top-quartile metro suburb. Quality of land matters more than quality of building. Pay PM, set up offset, automate everything. Review every 5 years; act on review only if fundamentals have changed.",
    watchOuts: "Boredom-driven tinkering, advisor churn, lifestyle creep eating the offset.",
  },
} as const satisfies Record<string, Archetype>;

export type ArchetypeId = keyof typeof ARCHETYPES;

function pporEquity(input: StrategyInput): number | null {
  if (input.ppor === null) return null;
  return input.ppor.estimatedValue - input.ppor.loanBalance;
}

/**
 * Deterministic cascade from STRATEGY_BUILD.md. First match wins; A8 is the default.
 */
export function selectArchetype(input: StrategyInput): {
  id: string;
  archetype: Archetype;
  reasoning: string;
} {
  const horizonYears = input.investmentHorizonYears;
  const householdIncome =
    input.annualGrossIncome + (input.partnerAnnualGrossIncome ?? 0);
  const equity = pporEquity(input);

  if (
    input.age >= 55 &&
    input.riskTolerance === "conservative" &&
    horizonYears <= 10
  ) {
    return {
      id: ARCHETYPES.A7.id,
      archetype: ARCHETYPES.A7,
      reasoning:
        "Age 55+, conservative risk, and investment horizon within 10 years — defensive income and capital preservation fit best.",
    };
  }

  if (
    input.ppor !== null &&
    equity !== null &&
    equity >= 200_000 &&
    input.liquidDepositAvailable <= 150_000 &&
    input.existingInvestmentProperties.length === 0
  ) {
    return {
      id: ARCHETYPES.A11.id,
      archetype: ARCHETYPES.A11,
      reasoning: `Substantial PPOR equity (${equity}) with liquid deposit (${input.liquidDepositAvailable}) at or below the equity-funded cash ceiling, and no existing investment properties — equity-release is the natural funding path for the first IP.`,
    };
  }

  if (
    input.existingInvestmentProperties.length === 0 &&
    input.liquidDepositAvailable <= 120_000 &&
    horizonYears >= 10
  ) {
    return {
      id: ARCHETYPES.A1.id,
      archetype: ARCHETYPES.A1,
      reasoning:
        "First investment with a modest deposit and a decade-plus horizon — prioritise a defendable first foothold without overreach.",
    };
  }

  if (
    householdIncome >= 200_000 &&
    input.primaryGoal === "tax_efficiency" &&
    input.handsOnPreference === "hands_off"
  ) {
    return {
      id: ARCHETYPES.A9.id,
      archetype: ARCHETYPES.A9,
      reasoning:
        "High household income, tax efficiency as the primary goal, and hands-off preference — structure and depreciation-aware investing fits.",
    };
  }

  if (
    householdIncome >= 250_000 &&
    input.primaryGoal === "capital_growth" &&
    input.liquidDepositAvailable >= 150_000 &&
    horizonYears >= 20
  ) {
    return {
      id: ARCHETYPES.A6.id,
      archetype: ARCHETYPES.A6,
      reasoning:
        "Strong income, large deposit, long horizon, and growth focus — a concentrated high-quality metro growth play matches the brief.",
    };
  }

  if (
    input.intendedPortfolioSize >= 3 &&
    input.riskTolerance !== "conservative" &&
    input.annualSavingsRate >= 25_000 &&
    horizonYears >= 15
  ) {
    return {
      id: ARCHETYPES.A5.id,
      archetype: ARCHETYPES.A5,
      reasoning:
        "Multi-property intent, healthy savings rate, longer horizon, and non-conservative risk — stacking yield-positive regionals systematically fits.",
    };
  }

  if (
    input.handsOnPreference === "hands_on" &&
    (input.primaryGoal === "passive_income" ||
      input.secondaryGoal === "passive_income") &&
    input.liquidDepositAvailable >= 100_000
  ) {
    return {
      id: ARCHETYPES.A10.id,
      archetype: ARCHETYPES.A10,
      reasoning:
        "Hands-on style with passive-income goals and enough capital — renovation-led yield add is aligned.",
    };
  }

  if (
    input.handsOnPreference === "light_touch" &&
    input.liquidDepositAvailable >= 120_000 &&
    horizonYears >= 10
  ) {
    return {
      id: ARCHETYPES.A4.id,
      archetype: ARCHETYPES.A4,
      reasoning:
        "Light-touch involvement, solid deposit, and decade-plus horizon — dual-income dwellings balance complexity and cashflow.",
    };
  }

  if (
    input.primaryGoal === "capital_growth" &&
    input.liquidDepositAvailable >= 150_000 &&
    householdIncome >= 140_000 &&
    horizonYears >= 15 &&
    input.riskTolerance !== "conservative"
  ) {
    return {
      id: ARCHETYPES.A3.id,
      archetype: ARCHETYPES.A3,
      reasoning:
        "Growth-focused with meaningful income, deposit, and horizon — metro growth foundation (accepting cashflow trade-offs) fits.",
    };
  }

  if (
    input.primaryGoal === "passive_income" &&
    input.liquidDepositAvailable >= 50_000 &&
    input.liquidDepositAvailable <= 200_000 &&
    horizonYears >= 5 &&
    horizonYears <= 15
  ) {
    return {
      id: ARCHETYPES.A2.id,
      archetype: ARCHETYPES.A2,
      reasoning:
        "Passive income focus with mid-range deposit and a 5–15 year horizon — yield-first regional anchor fits.",
    };
  }

  if (
    horizonYears >= 25 &&
    input.primaryGoal === "capital_growth" &&
    input.handsOnPreference === "hands_off" &&
    input.age <= 45 &&
    input.liquidDepositAvailable >= 150_000
  ) {
    return {
      id: ARCHETYPES.A12.id,
      archetype: ARCHETYPES.A12,
      reasoning:
        "Long horizon, growth focus, hands-off, younger cohort with strong deposit — patient hold on quality suits.",
    };
  }

  return {
    id: ARCHETYPES.A8.id,
    archetype: ARCHETYPES.A8,
    reasoning:
      "Default balanced path — a solid first investment that earns its keep and grows with the market when no earlier rule applies.",
  };
}
