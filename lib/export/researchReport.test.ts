import { describe, expect, it } from "vitest";
import { buildResearchReportBundle, reportBundleToCsv, reportBundleToJson, type ReportAreaSnapshot, type ReportScenarioCase } from "./researchReport";

const fullArea: ReportAreaSnapshot = {
  geographyLabel: "Melbourne, VIC",
  geographyCode: "21640",
  medianSalePrice12m: 950_000,
  salesConfidence: "medium",
  medianWeeklyRent: 620,
  rentConfidence: "high",
  grossYieldPct: 3.39,
  yieldConfidence: "medium",
  dwellingStockTotal: 12000,
  approvals12m: 300,
  totalPopulation: 25000,
  medianWeeklyHouseholdIncome: 1800,
  priceToIncomeRatio: 10.2,
  affordabilityConfidence: "medium",
  latestSalesPeriod: "2026-06",
  latestRentPeriod: "2026-Q2",
};

const scenario: ReportScenarioCase = {
  label: "Base case",
  depositPercent: 20,
  loanTermYears: 30,
  interestRatePercent: 6,
  vacancyPercent: 2,
  annualExpenses: 0,
  loanAmount: 760_000,
  monthlyRepayment: 4557,
  netAnnualCashflow: -22_620,
  breakEvenWeeklyRent: 858,
};

describe("buildResearchReportBundle", () => {
  it("includes the standard non-advice disclaimer", () => {
    const bundle = buildResearchReportBundle({ area: fullArea });
    expect(bundle.disclaimer).toMatch(/not financial, tax or legal advice/);
    expect(bundle.disclaimer).toMatch(/not a valuation/);
    expect(bundle.disclaimer).toMatch(/not a forecast/);
  });

  it("records no limitations when every area figure is present", () => {
    const bundle = buildResearchReportBundle({ area: fullArea });
    expect(bundle.limitations).toEqual([]);
  });

  it("records a limitation for every missing area figure, never silently omitting it", () => {
    const bundle = buildResearchReportBundle({
      area: { ...fullArea, medianSalePrice12m: null, medianWeeklyRent: null, grossYieldPct: null, medianWeeklyHouseholdIncome: null },
    });
    expect(bundle.limitations.length).toBe(4);
    expect(bundle.limitations.join(" ")).toMatch(/median sale price/i);
    expect(bundle.limitations.join(" ")).toMatch(/household income/i);
  });

  it("includes scenario cases when provided, empty array when not", () => {
    const withScenario = buildResearchReportBundle({ area: fullArea, scenarios: [scenario] });
    expect(withScenario.scenarios).toHaveLength(1);
    const withoutScenario = buildResearchReportBundle({ area: fullArea });
    expect(withoutScenario.scenarios).toEqual([]);
  });

  it("uses a provided generatedAt rather than always defaulting to now, for reproducibility in tests/snapshots", () => {
    const bundle = buildResearchReportBundle({ area: fullArea, generatedAt: "2026-01-01T00:00:00.000Z" });
    expect(bundle.generatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("reportBundleToCsv", () => {
  it("includes the area snapshot, disclaimer, and generation date", () => {
    const bundle = buildResearchReportBundle({ area: fullArea, generatedAt: "2026-01-01T00:00:00.000Z" });
    const csv = reportBundleToCsv(bundle);
    expect(csv).toContain("Melbourne, VIC");
    expect(csv).toContain("2026-01-01T00:00:00.000Z");
    expect(csv).toContain("950000");
    expect(csv).toContain("not financial, tax or legal advice");
  });

  it("renders a missing metric as literally 'Unavailable', never a blank or zero", () => {
    const bundle = buildResearchReportBundle({ area: { ...fullArea, medianWeeklyRent: null } });
    const csv = reportBundleToCsv(bundle);
    expect(csv).toMatch(/Median weekly rent,Unavailable/);
  });

  it("includes the scenario section only when scenarios are present", () => {
    const withoutScenario = reportBundleToCsv(buildResearchReportBundle({ area: fullArea }));
    expect(withoutScenario).not.toContain("Scenario cases");

    const withScenario = reportBundleToCsv(buildResearchReportBundle({ area: fullArea, scenarios: [scenario] }));
    expect(withScenario).toContain("Scenario cases");
    expect(withScenario).toContain("Base case");
  });

  it("neutralises a formula-injection attempt in a user-entered scenario label", () => {
    const maliciousScenario: ReportScenarioCase = { ...scenario, label: "=cmd|'/c calc'!A1" };
    const csv = reportBundleToCsv(buildResearchReportBundle({ area: fullArea, scenarios: [maliciousScenario] }));
    // The raw, unescaped payload (a bare cell starting with =) must never
    // appear — every occurrence must be prefixed with a neutralising '.
    expect(csv).not.toContain(",=cmd|");
    expect(csv).toContain("'=cmd|");
  });

  it("lists every recorded limitation as a commented line", () => {
    const bundle = buildResearchReportBundle({ area: { ...fullArea, grossYieldPct: null } });
    const csv = reportBundleToCsv(bundle);
    expect(csv).toMatch(/# - Gross yield unavailable/);
  });
});

describe("reportBundleToJson", () => {
  it("round-trips to valid, parseable JSON containing every top-level section", () => {
    const bundle = buildResearchReportBundle({ area: fullArea, scenarios: [scenario] });
    const json = reportBundleToJson(bundle);
    const parsed = JSON.parse(json);
    expect(parsed.area.geographyLabel).toBe("Melbourne, VIC");
    expect(parsed.scenarios).toHaveLength(1);
    expect(parsed.disclaimer).toBeDefined();
    expect(parsed.generatedAt).toBeDefined();
    expect(parsed.sources.length).toBeGreaterThan(0);
  });
});
