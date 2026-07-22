import { describe, expect, it } from "vitest";
import { getUserTier, hasEntitlement } from "./entitlements";

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
