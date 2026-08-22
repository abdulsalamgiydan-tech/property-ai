import { describe, it, expect } from "vitest";
import { deriveBuyBox } from "@/lib/dealhunter/buybox";
import type { InvestmentProfile, MetricProvenance } from "@/lib/opportunity/types";
import type { SuburbEvidence } from "@/lib/dealhunter/types";
import { assessCompleteness, type ByodListingInput } from "./schema";
import { buildUserEnteredListing, analyzeUserEnteredDeal, USER_ENTERED_PROVIDER } from "./userListing";

const NOW = "2026-08-15T00:00:00.000Z";

function metric(value: number): MetricProvenance {
  return {
    value, unit: null, sample_size: 30, period_start: null, period_end: "2026-06-30",
    status: "direct", source_id: "TEST-OFFICIAL", licence: "open", attribution: "official test",
    retrieved_at: NOW, provider: "test",
  };
}
function fullEvidence(): Record<string, SuburbEvidence> {
  const ev: SuburbEvidence = {
    median_house_price: metric(800_000), median_rent: metric(600), gross_yield: metric(3.9),
    price_growth_12m: metric(5.5), sales_volume: metric(120),
  };
  return { SAL_40530: ev };
}
const GENEROUS_PROFILE: InvestmentProfile = {
  maxPrice: 1_500_000, deposit: 600_000, strategy: "growth", acceptableWeeklyHoldingCost: 2_000,
  propertyType: "house", states: ["SA"], riskTolerance: "medium", holdingPeriodYears: 10,
};
function completeInput(overrides: Partial<ByodListingInput> = {}): ByodListingInput {
  return {
    sourceUrl: "https://www.example-realestate.com.au/property/12-test-st-grange-sa-5022-123",
    sourceCapturedAt: NOW,
    address: { full: "12 Test St, Grange SA 5022", suburb: "Grange", state: "SA", postcode: "5022" },
    geographyId: "SAL_40530",
    propertyType: "house", bedrooms: 3, bathrooms: 1, parking: 2, landAreaSqm: 620,
    priceDisplay: "exact", price: 800_000, priceUpper: null, listingStatus: "for_sale",
    ...overrides,
  };
}

describe("buildUserEnteredListing", () => {
  it("labels every user-entered field origin=user and preserves source URL + timestamp", () => {
    const l = buildUserEnteredListing(completeInput(), { submissionId: "abc-123", now: NOW });
    expect(l.provider).toBe(USER_ENTERED_PROVIDER);
    expect(l.key).toBe("user-entered:abc-123");
    expect(l.sourceUrl).toContain("example-realestate");
    for (const field of ["price", "address", "bedrooms", "bathrooms", "parking", "status"] as const) {
      expect(l.provenance[field]?.origin, `provenance.${field}`).toBe("user");
      expect(l.provenance[field]?.provider).toBe(USER_ENTERED_PROVIDER);
      expect(l.provenance[field]?.retrievedAt).toBe(NOW);
    }
    // Never fabricates media/agent from a URL (no scraping).
    expect(l.media).toEqual([]);
    expect(l.agent).toBeNull();
    expect(l.description).toBeNull();
  });

  it("maps price display to bounds", () => {
    expect(buildUserEnteredListing(completeInput({ priceDisplay: "exact", price: 800_000 }), { submissionId: "x", now: NOW }))
      .toMatchObject({ priceLowerBound: 800_000, priceUpperBound: 800_000 });
    expect(buildUserEnteredListing(completeInput({ priceDisplay: "range", price: 800_000, priceUpper: 850_000 }), { submissionId: "x", now: NOW }))
      .toMatchObject({ priceLowerBound: 800_000, priceUpperBound: 850_000 });
    const undisclosed = buildUserEnteredListing(completeInput({ priceDisplay: "undisclosed", price: null }), { submissionId: "x", now: NOW });
    expect(undisclosed.priceLowerBound).toBeNull();
    expect(undisclosed.priceUpperBound).toBeNull();
  });
});

describe("assessCompleteness", () => {
  it("passes a fully-entered house", () => {
    expect(assessCompleteness(completeInput()).complete).toBe(true);
  });
  it("flags blank material facts", () => {
    const c = assessCompleteness(completeInput({ bedrooms: null, bathrooms: null, parking: null }));
    expect(c.complete).toBe(false);
    expect(c.missing).toEqual(expect.arrayContaining(["bedrooms", "bathrooms", "parking"]));
  });
  it("flags a disclosed-but-absent price, but not an undisclosed one", () => {
    expect(assessCompleteness(completeInput({ priceDisplay: "exact", price: null })).priceMissing).toBe(true);
    expect(assessCompleteness(completeInput({ priceDisplay: "undisclosed", price: null })).priceMissing).toBe(false);
  });
});

describe("analyzeUserEnteredDeal", () => {
  it("scores a complete, in-budget SA house as an eligible ranked deal with class-labelled evidence", () => {
    const { deal, brief, bucket } = analyzeUserEnteredDeal({
      input: completeInput(), buyBox: deriveBuyBox(GENEROUS_PROFILE), evidenceByGeo: fullEvidence(),
      now: NOW, submissionId: "s1",
    });
    expect(deal.eligible).toBe(true);
    expect(deal.hardGateFailures).toEqual([]);
    expect(bucket).toBe("ranked");
    // Evidence classes are distinctly labelled.
    expect(brief.marketEvidence.some((f) => f.origin === "market_evidence")).toBe(true);
    expect(brief.financials.some((f) => f.origin === "propellect_estimate")).toBe(true);
    expect(brief.attributes.some((f) => f.origin === "listing_fact")).toBe(true);
    expect(brief.disclaimer).toMatch(/not financial, legal, lending or tax advice/i);
  });

  it("never hides a hard-gate failure (wrong property type) behind a score", () => {
    const { deal, bucket } = analyzeUserEnteredDeal({
      input: completeInput({ propertyType: "townhouse" }), buyBox: deriveBuyBox(GENEROUS_PROFILE),
      evidenceByGeo: fullEvidence(), now: NOW, submissionId: "s2",
    });
    expect(deal.eligible).toBe(false);
    expect(bucket).toBe("ineligible");
    expect(deal.hardGateFailures.map((f) => f.gate)).toContain("property_type_excluded");
  });

  it("marks missing official rent as missing and yields no fabricated cash-flow estimate", () => {
    const ev = fullEvidence();
    delete ev.SAL_40530.median_rent; // no fresh rent for the suburb
    const { deal, brief } = analyzeUserEnteredDeal({
      input: completeInput(), buyBox: deriveBuyBox(GENEROUS_PROFILE), evidenceByGeo: ev, now: NOW, submissionId: "s3",
    });
    expect(deal.estimate).toBeNull();
    expect(deal.missing).toContain("median_rent");
    expect(brief.financials.some((f) => f.origin === "missing")).toBe(true);
  });
});
