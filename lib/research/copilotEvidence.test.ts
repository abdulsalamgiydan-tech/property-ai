import { describe, expect, it } from "vitest";
import { buildEvidencePack, formatEvidenceForPrompt, type EvidenceSnapshotInput } from "./copilotEvidence";

const fullSnapshot: EvidenceSnapshotInput = {
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

describe("buildEvidencePack", () => {
  it("produces one fact per known metric, all with non-empty values", () => {
    const facts = buildEvidencePack(fullSnapshot);
    expect(facts.length).toBeGreaterThanOrEqual(8);
    for (const f of facts) {
      expect(f.value.length).toBeGreaterThan(0);
    }
  });

  it("formats money, count and percentage fields distinctly, never as bare numbers", () => {
    const facts = buildEvidencePack(fullSnapshot);
    const price = facts.find((f) => f.id === "median_sale_price")!;
    expect(price.value).toBe("$850,000");
    const yield_ = facts.find((f) => f.id === "gross_yield")!;
    expect(yield_.value).toBe("3.79%");
    const stock = facts.find((f) => f.id === "dwelling_stock")!;
    expect(stock.value).toBe("4,200");
  });

  it("renders a missing metric as literally 'Not recorded', never null/blank/zero", () => {
    const facts = buildEvidencePack({ ...fullSnapshot, medianSalePrice12m: null });
    const price = facts.find((f) => f.id === "median_sale_price")!;
    expect(price.value).toBe("Not recorded");
  });

  it("carries confidence and source period through only for the fields that have them", () => {
    const facts = buildEvidencePack(fullSnapshot);
    const price = facts.find((f) => f.id === "median_sale_price")!;
    expect(price.confidence).toBe("medium");
    expect(price.sourcePeriod).toBe("2026-06");
    const stock = facts.find((f) => f.id === "dwelling_stock")!;
    expect(stock.confidence).toBeNull();
    expect(stock.sourcePeriod).toBeNull();
  });

  it("produces a stable fact order regardless of which fields are null", () => {
    const idsFull = buildEvidencePack(fullSnapshot).map((f) => f.id);
    const idsSparse = buildEvidencePack({ ...fullSnapshot, medianWeeklyRent: null, totalPopulation: null }).map((f) => f.id);
    expect(idsSparse).toEqual(idsFull);
  });
});

describe("formatEvidenceForPrompt", () => {
  it("renders every fact as one bullet line containing its label and value", () => {
    const facts = buildEvidencePack(fullSnapshot);
    const text = formatEvidenceForPrompt(facts);
    const lines = text.split("\n");
    expect(lines).toHaveLength(facts.length);
    expect(text).toContain("$850,000");
    expect(text).toContain("3.79%");
  });

  it("includes confidence and source-period annotations only when present on the fact", () => {
    const facts = buildEvidencePack(fullSnapshot);
    const text = formatEvidenceForPrompt(facts);
    expect(text).toContain("confidence: medium");
    expect(text).toContain("as at: 2026-06");
    // dwelling stock has neither — its line must not claim a fake confidence.
    const stockLine = text.split("\n").find((l) => l.includes("dwelling stock") || l.includes("Total dwelling stock"))!;
    expect(stockLine).not.toContain("confidence:");
  });

  it("never omits a 'Not recorded' fact from the prompt text — absence must be visible to the model", () => {
    const facts = buildEvidencePack({ ...fullSnapshot, totalPopulation: null });
    const text = formatEvidenceForPrompt(facts);
    expect(text).toContain("Not recorded");
  });
});
