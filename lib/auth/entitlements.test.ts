import { describe, expect, it } from "vitest";
import { getFeatureLimit, getUserTier, hasEntitlement, hasReachedLimit, isScenarioLabLimitExceededError } from "./entitlements";

describe("hasEntitlement", () => {
  it("every tier can use free-tier features", () => {
    for (const tier of ["free", "research", "investor_pro", "professional"] as const) {
      expect(hasEntitlement(tier, "deal_analysis")).toBe(true);
    }
  });

  it("free tier cannot use research-tier-and-above features", () => {
    expect(hasEntitlement("free", "scenario_lab")).toBe(false);
    expect(hasEntitlement("free", "multi_state_research")).toBe(false);
  });

  it("research tier can use its own features but not investor_pro-and-above", () => {
    expect(hasEntitlement("research", "scenario_lab")).toBe(true);
    expect(hasEntitlement("research", "public_api_v1")).toBe(false);
  });

  it("higher tiers include everything a lower tier has (monotonic)", () => {
    const tiers = ["free", "research", "investor_pro", "professional"] as const;
    const features = ["deal_analysis", "scenario_lab", "public_api_v1"] as const;
    for (const feature of features) {
      let seenTrue = false;
      for (const tier of tiers) {
        const allowed = hasEntitlement(tier, feature);
        if (seenTrue) expect(allowed).toBe(true); // once unlocked at a lower tier, stays unlocked
        if (allowed) seenTrue = true;
      }
    }
  });

  it("professional tier can use every feature", () => {
    const features = ["deal_analysis", "scenario_lab", "public_api_v1", "export_reports"] as const;
    for (const feature of features) {
      expect(hasEntitlement("professional", feature)).toBe(true);
    }
  });

  it("free tier CAN use saved_scenarios (Sprint 14 WS12 fix — this was previously miscategorised as research-tier-only, contradicting the live feature every signed-in user already has)", () => {
    expect(hasEntitlement("free", "saved_scenarios")).toBe(true);
  });
});

describe("getFeatureLimit / hasReachedLimit (Sprint 14 WS12 — volume caps, not on/off gates)", () => {
  it("returns the documented numeric cap per tier for saved_scenarios", () => {
    expect(getFeatureLimit("free", "saved_scenarios")).toBe(10);
    expect(getFeatureLimit("research", "saved_scenarios")).toBe(25);
    expect(getFeatureLimit("investor_pro", "saved_scenarios")).toBe(100);
  });

  it("professional tier has no limit (null = unlimited)", () => {
    expect(getFeatureLimit("professional", "saved_scenarios")).toBeNull();
    expect(hasReachedLimit("professional", "saved_scenarios", 1_000_000)).toBe(false);
  });

  it("flags the limit as reached at exactly the cap, not one past it (off-by-one safety)", () => {
    expect(hasReachedLimit("free", "saved_scenarios", 9)).toBe(false);
    expect(hasReachedLimit("free", "saved_scenarios", 10)).toBe(true);
    expect(hasReachedLimit("free", "saved_scenarios", 11)).toBe(true);
  });

  it("higher tiers have monotonically non-decreasing limits", () => {
    const tiers = ["free", "research", "investor_pro"] as const;
    let prev = 0;
    for (const tier of tiers) {
      const limit = getFeatureLimit(tier, "saved_scenarios")!;
      expect(limit).toBeGreaterThanOrEqual(prev);
      prev = limit;
    }
  });
});

describe("getUserTier", () => {
  function mockSupabase(row: { tier: string } | null, error: unknown = null) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("defaults to 'free' when no entitlement row exists (absence is the default, not an error)", async () => {
    const tier = await getUserTier(mockSupabase(null), "user-1");
    expect(tier).toBe("free");
  });

  it("defaults to 'free' on a query error rather than throwing or granting a higher tier", async () => {
    const tier = await getUserTier(mockSupabase(null, new Error("db error")), "user-1");
    expect(tier).toBe("free");
  });

  it("returns the real tier when a row exists", async () => {
    const tier = await getUserTier(mockSupabase({ tier: "investor_pro" }), "user-1");
    expect(tier).toBe("investor_pro");
  });

  it("falls back to 'free' for an unrecognised tier value rather than trusting it blindly", async () => {
    const tier = await getUserTier(mockSupabase({ tier: "super-admin-hack" }), "user-1");
    expect(tier).toBe("free");
  });
});

describe("isScenarioLabLimitExceededError", () => {
  it("recognises the database trigger's exact exception message", () => {
    expect(
      isScenarioLabLimitExceededError("scenario_lab_case_limit_exceeded: tier free allows at most 10 saved scenarios")
    ).toBe(true);
  });

  it("does not misfire on an unrelated error message", () => {
    expect(isScenarioLabLimitExceededError("new row violates row-level security policy")).toBe(false);
    expect(isScenarioLabLimitExceededError("network error")).toBe(false);
  });

  it("handles null/undefined without throwing", () => {
    expect(isScenarioLabLimitExceededError(null)).toBe(false);
    expect(isScenarioLabLimitExceededError(undefined)).toBe(false);
  });
});
