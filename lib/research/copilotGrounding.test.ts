import { describe, expect, it } from "vitest";
import { checkAnswerGrounding, extractNumericClaims } from "./copilotGrounding";
import { buildEvidencePack, type EvidenceSnapshotInput } from "./copilotEvidence";

const snapshot: EvidenceSnapshotInput = {
  geographyLabel: "Calderwood, NSW",
  medianSalePrice12m: 850_000,
  salesConfidence: "medium",
  latestSalesPeriod: "2026-06",
  medianWeeklyRent: 620,
  rentConfidence: "high",
  latestRentPeriod: "2026-Q2",
  grossYieldPct: 3.79,
  yieldConfidence: "medium",
  dwellingStockTotal: 4200,
  approvals12m: 85,
  totalPopulation: 11500,
  medianWeeklyHouseholdIncome: 1950,
  priceToIncomeRatio: 8.4,
  affordabilityConfidence: "medium",
};
const facts = buildEvidencePack(snapshot);

describe("extractNumericClaims", () => {
  it("extracts dollar figures", () => {
    expect(extractNumericClaims("The median price is $850,000 this quarter.")).toEqual(["$850,000"]);
  });

  it("extracts percentages", () => {
    expect(extractNumericClaims("Yield sits at 3.79% currently.")).toEqual(["3.79%"]);
  });

  it("extracts multiple mixed claims in appearance order", () => {
    expect(extractNumericClaims("Price $850,000, yield 3.79%, rent $620/wk.")).toEqual(["$850,000", "$620", "3.79%"]);
  });

  it("returns an empty array for text with no numeric claims", () => {
    expect(extractNumericClaims("I don't have enough evidence to answer that.")).toEqual([]);
  });
});

describe("checkAnswerGrounding", () => {
  it("treats an answer with zero numeric claims as trivially grounded", () => {
    const result = checkAnswerGrounding("This area has no recorded rental yield data.", facts);
    expect(result.grounded).toBe(true);
    expect(result.ungroundedClaims).toEqual([]);
  });

  it("passes when every stated figure appears in the evidence pack", () => {
    const answer = "The median sale price is $850,000 and the gross yield is 3.79%.";
    const result = checkAnswerGrounding(answer, facts);
    expect(result.grounded).toBe(true);
  });

  it("flags a fabricated dollar figure not present in the evidence", () => {
    const answer = "Prices are expected to reach $1,200,000 by next year.";
    const result = checkAnswerGrounding(answer, facts);
    expect(result.grounded).toBe(false);
    expect(result.ungroundedClaims).toContain("$1,200,000");
  });

  it("flags a fabricated percentage not present in the evidence", () => {
    const answer = "This suburb has grown 15.5% over the past year.";
    const result = checkAnswerGrounding(answer, facts);
    expect(result.grounded).toBe(false);
    expect(result.ungroundedClaims).toContain("15.5%");
  });

  it("is insensitive to comma/whitespace formatting differences between answer and evidence", () => {
    // Evidence stores "$850,000"; an answer stating the same value without a comma should still match.
    const answer = "The price is around $850000.";
    const result = checkAnswerGrounding(answer, facts);
    expect(result.grounded).toBe(true);
  });

  it("flags only the specific ungrounded claims, not every claim in a mixed-accuracy answer", () => {
    const answer = "The median price is $850,000, but rents could rise to $900 per week.";
    const result = checkAnswerGrounding(answer, facts);
    expect(result.grounded).toBe(false);
    expect(result.ungroundedClaims).toEqual(["$900"]);
  });
});
