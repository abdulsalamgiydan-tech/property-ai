import { describe, expect, it } from "vitest";
import { getFoundingBetaReadiness } from "./readiness";

describe("getFoundingBetaReadiness", () => {
  it("fails closed when launch controls are absent", () => {
    expect(getFoundingBetaReadiness({
      WAREHOUSE_PREVIEW_ENABLED: undefined,
      BYOD_FOUNDING_BETA_ENABLED: undefined,
      FOUNDING_BETA_EMAILS: undefined,
    })).toMatchObject({
      gateState: "dark",
      warehouseSurfaceEnabled: false,
      foundingBetaEnabled: false,
      cohortConfigured: false,
      invitedIdentityCount: 0,
    });
  });

  it("requires all three controls before the invited cohort is active", () => {
    const result = getFoundingBetaReadiness({
      WAREHOUSE_PREVIEW_ENABLED: "true",
      BYOD_FOUNDING_BETA_ENABLED: "true",
      FOUNDING_BETA_EMAILS: "first@example.com, second@example.com",
    });
    expect(result).toMatchObject({
      gateState: "invited_cohort_active",
      warehouseSurfaceEnabled: true,
      foundingBetaEnabled: true,
      cohortConfigured: true,
      invitedIdentityCount: 2,
      activationRequirements: [],
    });
  });

  it("ignores malformed and duplicate allowlist entries without exposing identities", () => {
    const result = getFoundingBetaReadiness({
      WAREHOUSE_PREVIEW_ENABLED: "true",
      BYOD_FOUNDING_BETA_ENABLED: "true",
      FOUNDING_BETA_EMAILS: " Invited@Example.com,invalid,invited@example.com ",
    });
    expect(result.invitedIdentityCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain("invited@example.com");
    expect(JSON.stringify(result)).not.toContain("Invited@Example.com");
  });

  it("treats non-exact truthy-looking flag values as off", () => {
    const result = getFoundingBetaReadiness({
      WAREHOUSE_PREVIEW_ENABLED: "TRUE",
      BYOD_FOUNDING_BETA_ENABLED: "1",
      FOUNDING_BETA_EMAILS: "invited@example.com",
    });
    expect(result.gateState).toBe("dark");
    expect(result.warehouseSurfaceEnabled).toBe(false);
    expect(result.foundingBetaEnabled).toBe(false);
  });
});
