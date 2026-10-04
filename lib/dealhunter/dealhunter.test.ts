import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ReplayListingProvider } from "@/lib/listings/providers/replay";
import { upsertListings } from "@/lib/listings/canonicalize";
import type { CanonicalListing } from "@/lib/listings/types";
import type { InvestmentProfile, MetricProvenance } from "@/lib/opportunity/types";
import { deriveBuyBox } from "./buybox";
import { rankDeals } from "./ranking";
import { buildDealBrief } from "./dealbrief";
import { deriveListingEvents } from "./events";
import { proposePreferenceAdjustments, type FeedbackSignal } from "./feedback";
import type { SuburbEvidence } from "./types";

const provider = new ReplayListingProvider();
const ASOF = "2026-08-06T00:00:00Z";

async function batch(i: number): Promise<CanonicalListing[]> {
  const raw = await provider.fetchRaw({ state: "SA", saleMode: "sale" }, i);
  return raw.map((r) => provider.toCanonical(r));
}

function metric(value: number): MetricProvenance {
  return {
    value, unit: "AUD", sample_size: 120, period_start: null, period_end: "2026-06-30",
    status: "direct", source_id: "SA-VG", licence: "CC-BY", attribution: "Government of SA",
    retrieved_at: "2026-06-30T00:00:00Z", provider: "official",
  };
}
function fullEvidence(over: Partial<Record<keyof SuburbEvidence, number>> = {}): SuburbEvidence {
  return {
    median_house_price: metric(over.median_house_price ?? 800000),
    median_rent: metric(over.median_rent ?? 520),
    gross_yield: metric(over.gross_yield ?? 3.4),
    sales_volume: metric(over.sales_volume ?? 40),
    price_growth_12m: metric(over.price_growth_12m ?? 6.0),
  };
}
const EVIDENCE: Record<string, SuburbEvidence> = {
  SAL_40530: fullEvidence({ price_growth_12m: 6.0 }), // Grange
  SAL_40089: fullEvidence({ price_growth_12m: 4.0 }), // Belair
  SAL_41190: fullEvidence({ price_growth_12m: 8.0 }), // Unley (high growth — must NOT rescue price gate)
  SAL_41010: fullEvidence(), // Seaton
};

const PROFILE: InvestmentProfile = {
  maxPrice: 900_000, deposit: 400_000, strategy: "growth", acceptableWeeklyHoldingCost: 600,
  propertyType: "house", states: ["SA"], riskTolerance: "medium", holdingPeriodYears: 10,
};

describe("buy box (C)", () => {
  it("derives hard gates + soft prefs and explains every profile answer", () => {
    const bb = deriveBuyBox(PROFILE);
    expect(bb.hardGates.maxPurchasePrice).toBe(900_000);
    expect(bb.hardGates.propertyTypes).toEqual(["house"]);
    expect(bb.hardGates.eligibleStates).toEqual(["SA"]);
    expect(bb.softPreferences.growthVsYield).toBe(1); // growth
    // one explanation per material answer
    const inputs = bb.explanations.map((e) => e.input);
    for (const i of ["Max purchase price", "Deposit available", "Strategy", "States", "Risk tolerance", "Minimum bedrooms"]) {
      expect(inputs).toContain(i);
    }
  });

  it("honestly blocks a non-rankable state instead of inventing coverage", () => {
    const bb = deriveBuyBox({ ...PROFILE, states: ["SA", "NSW"] });
    expect(bb.hardGates.eligibleStates).toEqual(["SA"]);
    expect(bb.explanations.find((e) => e.input === "States")!.effect.toLowerCase()).toContain("blocked");
  });
});

describe("deal ranking (D) — hard gates never hidden", () => {
  it("excludes an over-budget listing even when its suburb fit is strong", async () => {
    const bb = deriveBuyBox(PROFILE);
    const out = rankDeals(await batch(0), bb, EVIDENCE, { asOf: ASOF });
    const unley = [...out.ineligible, ...out.ranked, ...out.needsReview].find((d) => d.key === "replay:RPL-0004")!;
    expect(unley.hardGateFailures.map((f) => f.gate)).toContain("above_price_budget");
    expect(unley.eligible).toBe(false);
    // Must be in ineligible, NEVER in ranked — despite Unley's high (8%) growth.
    expect(out.ranked.find((d) => d.key === "replay:RPL-0004")).toBeUndefined();
    expect(out.ineligible.find((d) => d.key === "replay:RPL-0004")).toBeDefined();
  });

  it("ranks an in-budget, cash-flow-viable house and attaches an estimate + explanation", async () => {
    const bb = deriveBuyBox(PROFILE);
    const out = rankDeals(await batch(0), bb, EVIDENCE, { asOf: ASOF });
    const grange = out.ranked.find((d) => d.key === "replay:RPL-0001");
    expect(grange).toBeDefined();
    expect(grange!.eligible).toBe(true);
    expect(grange!.estimate).not.toBeNull();
    expect(grange!.explanation.whyMatches.length).toBeGreaterThan(0);
    expect(grange!.explanation.asOf.listing).toBeDefined();
    expect(grange!.dealScore).toBeGreaterThan(0);
  });

  it("routes an undisclosed-price listing to needs-review, not ranked, with no invented price", async () => {
    const bb = deriveBuyBox(PROFILE);
    const out = rankDeals(await batch(0), bb, EVIDENCE, { asOf: ASOF });
    const belair = out.needsReview.find((d) => d.key === "replay:RPL-0002");
    expect(belair).toBeDefined();
    expect(belair!.priceUndisclosed).toBe(true);
    expect(belair!.estimate).toBeNull(); // no price → no fabricated estimate
    expect(out.ranked.find((d) => d.key === "replay:RPL-0002")).toBeUndefined();
  });

  it("excludes a wrong property type (unit) via a hard gate", async () => {
    const bb = deriveBuyBox(PROFILE);
    const out = rankDeals(await batch(0), bb, EVIDENCE, { asOf: ASOF });
    const seaton = out.ineligible.find((d) => d.key === "replay:RPL-0003")!;
    expect(seaton.hardGateFailures.map((f) => f.gate)).toContain("property_type_excluded");
  });

  it("is deterministic — identical inputs give identical output", async () => {
    const bb = deriveBuyBox(PROFILE);
    const a = rankDeals(await batch(0), bb, EVIDENCE, { asOf: ASOF });
    const b = rankDeals(await batch(0), bb, EVIDENCE, { asOf: ASOF });
    expect(JSON.stringify(a.ranked.map((d) => [d.key, d.dealScore]))).toBe(JSON.stringify(b.ranked.map((d) => [d.key, d.dealScore])));
  });

  it("marks missing evidence and does not fabricate a cash-flow when rent is absent", async () => {
    const bb = deriveBuyBox(PROFILE);
    const noRent = rankDeals(await batch(0), bb, { SAL_40530: { price_growth_12m: metric(6) } }, { asOf: ASOF });
    const grange = [...noRent.ranked, ...noRent.needsReview, ...noRent.ineligible].find((d) => d.key === "replay:RPL-0001")!;
    expect(grange.estimate).toBeNull();
    expect(grange.missing).toContain("median_rent");
    expect(grange.explanation.couldKillDeal.some((s) => s.toLowerCase().includes("rent"))).toBe(true);
  });
});

describe("deal brief (E.12)", () => {
  it("labels every figure by evidence class and carries a no-advice disclaimer", async () => {
    const bb = deriveBuyBox(PROFILE);
    const out = rankDeals(await batch(0), bb, EVIDENCE, { asOf: ASOF });
    const brief = buildDealBrief(out.ranked[0], ASOF);
    const origins = new Set(brief.financials.map((f) => f.origin));
    expect(origins.has("propellect_estimate")).toBe(true);
    expect(brief.marketEvidence.every((f) => f.origin === "market_evidence" || f.origin === "missing")).toBe(true);
    expect(brief.disclaimer.toLowerCase()).toContain("not");
    expect(JSON.stringify(brief).toLowerCase()).not.toMatch(/we recommend|you should buy|guaranteed/);
  });
});

describe("listing events (F)", () => {
  it("emits a price_changed event only for a buy-box member", async () => {
    const b0 = await batch(0);
    const b1 = await batch(1);
    const s1 = upsertListings(new Map(), b0, { now: "2026-08-01T00:00:00Z" });
    const s2 = upsertListings(s1.store, b1, { now: ASOF, removeUnseen: true });
    const events = deriveListingEvents(s2.changes, { matchedKeys: new Set(["replay:RPL-0001"]) });
    expect(events.find((e) => e.key === "replay:RPL-0001" && e.kind === "price_changed")).toBeDefined();
    // RPL-0003 went under offer but is not in the buy box → no event.
    expect(events.find((e) => e.key === "replay:RPL-0003")).toBeUndefined();
  });
});

describe("feedback (G)", () => {
  it("proposes a transparent, supported adjustment and never auto-applies", () => {
    const signals: FeedbackSignal[] = [
      { listingKey: "replay:RPL-0004", kind: "passed", reason: "too_expensive", at: ASOF },
      { listingKey: "replay:RPL-0005", kind: "rejected", reason: "too_expensive", at: ASOF },
    ];
    const proposals = proposePreferenceAdjustments(PROFILE, signals);
    const p = proposals.find((x) => x.field === "maxPrice")!;
    expect(p).toBeDefined();
    expect(p.support).toBe(2);
    expect(p.rationale.toLowerCase()).toContain("too expensive");
  });

  it("stays silent below the support threshold (no noise)", () => {
    const signals: FeedbackSignal[] = [{ listingKey: "k", kind: "passed", reason: "too_expensive", at: ASOF }];
    expect(proposePreferenceAdjustments(PROFILE, signals)).toHaveLength(0);
  });
});
