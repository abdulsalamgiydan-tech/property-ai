import { test, expect, ISOLATED_SUPABASE_REF, PRODUCTION_SUPABASE_REF } from "./fixtures";

/**
 * MANDATORY isolation gate — runs before any authenticated mutation. If any assertion
 * fails, the whole UAT must stop (do not mutate an unproven environment).
 */
test("preview binds ONLY to the isolated deal-hunter-preview branch", async ({ request }) => {
  const res = await request.get("/api/diagnostics/preview-config");
  expect(res.status(), "diagnostic should be reachable through the bypass").toBe(200);
  const body = await res.json();

  expect(body.configurationOk).toBe(true);
  expect(body.target).toBe("preview");
  expect(body.gitBranch).toBe("v7c-preview-launch-gate");
  expect(body.supabase.appUsesIsolatedPreview).toBe(true);
  expect(body.supabase.warehouseUsesIsolatedPreview).toBe(true);
  expect(body.supabase.productionRefDetected).toBe(false);
  expect(body.featureFlags.serviceRoleConfigured).toBe(false);
  expect(body.featureFlags.warehousePreview).toBe(true);

  // Both refs resolve to the isolated branch (masked as "mmqx...iqtx"); never Production.
  const masked = `${ISOLATED_SUPABASE_REF.slice(0, 4)}...${ISOLATED_SUPABASE_REF.slice(-4)}`;
  expect(body.supabase.appProjectRef).toBe(masked);
  expect(body.supabase.warehouseProjectRef).toBe(masked);
  expect(JSON.stringify(body)).not.toContain(PRODUCTION_SUPABASE_REF);
});
