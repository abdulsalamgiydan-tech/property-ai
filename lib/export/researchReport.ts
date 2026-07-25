/**
 * Combined investment-research report bundle (Sprint 13 WS16, generalised
 * Sprint 14 WS7). Pulls together an area snapshot, Scenario Lab cases,
 * and/or a single Deal Analyser property analysis into one structured,
 * exportable document — the property/scenario-analysis view a user would
 * actually want to save or share, rather than the raw per-metric CSV
 * `exportBundleToCsv()` already provides for the timeseries API.
 *
 * All three input sections (area, scenarios, propertyAnalysis) are
 * independently optional — a Scenario Lab export supplies area +
 * scenarios; a Deal Analyser export (no linked warehouse geography)
 * supplies only propertyAnalysis. At least one section is expected by
 * callers, but this module does not enforce that — an empty bundle is
 * still valid, just not very useful.
 *
 * Pure, side-effect-free bundle builder + two serialisers (CSV/JSON).
 * Never a valuation, forecast or recommendation — every section is
 * either a real recorded snapshot value or a clearly-labelled user
 * assumption, matching the rest of this project's disclosure rules.
 */
import { csvCell } from "./csvSafety";

export type ReportAreaSnapshot = {
  geographyLabel: string;
  geographyCode: string;
  medianSalePrice12m: number | null;
  salesConfidence: string | null;
  medianWeeklyRent: number | null;
  rentConfidence: string | null;
  grossYieldPct: number | null;
  yieldConfidence: string | null;
  dwellingStockTotal: number | null;
  approvals12m: number | null;
  totalPopulation: number | null;
  medianWeeklyHouseholdIncome: number | null;
  priceToIncomeRatio: number | null;
  affordabilityConfidence: string | null;
  latestSalesPeriod: string | null;
  latestRentPeriod: string | null;
};

export type ReportScenarioCase = {
  label: string;
  depositPercent: number;
  loanTermYears: number;
  interestRatePercent: number;
  vacancyPercent: number;
  annualExpenses: number;
  loanAmount: number;
  monthlyRepayment: number;
  netAnnualCashflow: number | null;
  breakEvenWeeklyRent: number | null;
};

export type ReportPropertyAnalysis = {
  propertyName: string | null;
  purchasePrice: number;
  weeklyRent: number;
  grossYieldPercent: number;
  loanAmount: number;
  lvrPercent: number;
  depositPercent: number;
  interestRatePercent: number;
  preTaxCashflowAnnual: number;
  afterTaxCashflowAnnual: number;
  score: number;
  status: string;
};

export type ResearchReportBundle = {
  generatedAt: string;
  area: ReportAreaSnapshot | null;
  scenarios: ReportScenarioCase[];
  propertyAnalysis: ReportPropertyAnalysis | null;
  sources: string[];
  limitations: string[];
  disclaimer: string;
};

const STANDARD_DISCLAIMER =
  "Descriptive research report only — not financial, tax or legal advice, not a valuation, not a forecast, and not an investment recommendation. Figures combine independently-sourced official datasets; always check the confidence label and source period before relying on a number.";

export function buildResearchReportBundle(input: {
  area?: ReportAreaSnapshot | null;
  scenarios?: ReportScenarioCase[];
  propertyAnalysis?: ReportPropertyAnalysis | null;
  generatedAt?: string;
}): ResearchReportBundle {
  const limitations: string[] = [];
  const area = input.area ?? null;
  if (area) {
    if (area.medianSalePrice12m == null) limitations.push("No median sale price recorded for this area.");
    if (area.medianWeeklyRent == null) limitations.push("No median weekly rent recorded for this area.");
    if (area.grossYieldPct == null) limitations.push("Gross yield unavailable — requires both sale price and rent.");
    if (area.medianWeeklyHouseholdIncome == null) limitations.push("No household income data — affordability figures unavailable.");
  }

  const sources: string[] = [];
  if (area) {
    sources.push(
      `Full source, licence and lineage detail for every metric: see the "About this metric" links on the ${area.geographyLabel} research profile.`
    );
  }
  if (input.propertyAnalysis) {
    sources.push(
      "Property analysis figures are computed from your own entered assumptions (purchase price, rent, rate, etc.), not sourced warehouse data."
    );
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    area,
    scenarios: input.scenarios ?? [],
    propertyAnalysis: input.propertyAnalysis ?? null,
    sources,
    limitations,
    disclaimer: STANDARD_DISCLAIMER,
  };
}

function moneyOrUnavailable(v: number | null): string {
  return v == null ? "Unavailable" : String(v);
}

/**
 * Multi-section CSV, `# Section` comment headers between sections
 * (matches the existing convention in lib/warehouse/queries.ts's
 * exportBundleToCsv). Every cell goes through csvCell for
 * formula-injection safety, including the confidence/label strings —
 * those come from the warehouse, but scenario case labels are
 * user-entered free text, so every string cell is guarded consistently
 * rather than special-casing which ones "need" it.
 */
export function reportBundleToCsv(bundle: ResearchReportBundle): string {
  const lines: string[] = [];
  const titleSuffix = bundle.area ? bundle.area.geographyLabel : bundle.propertyAnalysis?.propertyName || "Property analysis";
  lines.push(`# Investment research report — ${csvCell(titleSuffix)}`);
  lines.push(`# Generated at: ${bundle.generatedAt}`);
  lines.push(`# ${csvCell(bundle.disclaimer)}`);
  lines.push("");

  if (bundle.area) {
    lines.push("# Area snapshot");
    lines.push("metric,value,confidence");
    lines.push(`Median sale price (12m),${csvCell(moneyOrUnavailable(bundle.area.medianSalePrice12m))},${csvCell(bundle.area.salesConfidence ?? "n/a")}`);
    lines.push(`Median weekly rent,${csvCell(moneyOrUnavailable(bundle.area.medianWeeklyRent))},${csvCell(bundle.area.rentConfidence ?? "n/a")}`);
    lines.push(`Gross yield (%),${csvCell(moneyOrUnavailable(bundle.area.grossYieldPct))},${csvCell(bundle.area.yieldConfidence ?? "n/a")}`);
    lines.push(`Dwelling stock,${csvCell(moneyOrUnavailable(bundle.area.dwellingStockTotal))},`);
    lines.push(`Building approvals (12m),${csvCell(moneyOrUnavailable(bundle.area.approvals12m))},`);
    lines.push(`Population,${csvCell(moneyOrUnavailable(bundle.area.totalPopulation))},`);
    lines.push(`Median weekly household income,${csvCell(moneyOrUnavailable(bundle.area.medianWeeklyHouseholdIncome))},${csvCell(bundle.area.affordabilityConfidence ?? "n/a")}`);
    lines.push(`Price-to-income ratio,${csvCell(moneyOrUnavailable(bundle.area.priceToIncomeRatio))},`);
    lines.push(`Sales period,${csvCell(bundle.area.latestSalesPeriod ?? "n/a")},`);
    lines.push(`Rent period,${csvCell(bundle.area.latestRentPeriod ?? "n/a")},`);
    lines.push("");
  }

  if (bundle.propertyAnalysis) {
    const p = bundle.propertyAnalysis;
    lines.push("# Property analysis (your own entered assumptions, not sourced data)");
    lines.push("metric,value");
    lines.push(`Property,${csvCell(p.propertyName ?? "n/a")}`);
    lines.push(`Purchase price,${csvCell(p.purchasePrice)}`);
    lines.push(`Weekly rent,${csvCell(p.weeklyRent)}`);
    lines.push(`Gross yield (%),${csvCell(p.grossYieldPercent)}`);
    lines.push(`Loan amount,${csvCell(p.loanAmount)}`);
    lines.push(`LVR (%),${csvCell(p.lvrPercent)}`);
    lines.push(`Deposit (%),${csvCell(p.depositPercent)}`);
    lines.push(`Interest rate (%),${csvCell(p.interestRatePercent)}`);
    lines.push(`Pre-tax cashflow (annual),${csvCell(p.preTaxCashflowAnnual)}`);
    lines.push(`After-tax cashflow (annual),${csvCell(p.afterTaxCashflowAnnual)}`);
    lines.push(`Deal score,${csvCell(p.score)}`);
    lines.push(`Deal status,${csvCell(p.status)}`);
    lines.push("");
  }

  if (bundle.scenarios.length > 0) {
    lines.push("# Scenario cases (user assumptions, not sourced data)");
    lines.push("label,deposit_pct,loan_term_years,interest_rate_pct,vacancy_pct,annual_expenses,loan_amount,monthly_repayment,net_annual_cashflow,break_even_weekly_rent");
    for (const s of bundle.scenarios) {
      lines.push(
        [
          csvCell(s.label),
          csvCell(s.depositPercent),
          csvCell(s.loanTermYears),
          csvCell(s.interestRatePercent),
          csvCell(s.vacancyPercent),
          csvCell(s.annualExpenses),
          csvCell(s.loanAmount),
          csvCell(s.monthlyRepayment),
          csvCell(moneyOrUnavailable(s.netAnnualCashflow)),
          csvCell(moneyOrUnavailable(s.breakEvenWeeklyRent)),
        ].join(",")
      );
    }
    lines.push("");
  }

  lines.push("# Known limitations");
  for (const l of bundle.limitations) lines.push(`# - ${l}`);
  lines.push("");
  lines.push("# Sources");
  for (const s of bundle.sources) lines.push(`# - ${s}`);

  return lines.join("\n") + "\n";
}

export function reportBundleToJson(bundle: ResearchReportBundle): string {
  return JSON.stringify(bundle, null, 2);
}
