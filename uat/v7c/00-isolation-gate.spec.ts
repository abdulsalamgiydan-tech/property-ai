import { test, expect, PRODUCTION_SUPABASE_REF } from "./fixtures";

const APPROVED_PREVIEW_BINDINGS = {
  "v7c-preview-launch-gate": "mmqxwwjshnpcqngciqtx",
  "v8-sa-founding-beta": "uvuvhftaexxfrfdgthtw",
} as const;

type ApprovedPreviewBranch = keyof typeof APPROVED_PREVIEW_BINDINGS;

function expectedPreviewBinding() {
  const branch = process.env.UAT_EXPECTED_GIT_BRANCH ?? "v7c-preview-launch-gate";
  if (!Object.hasOwn(APPROVED_PREVIEW_BINDINGS, branch)) {
    throw new Error(`Unknown UAT_EXPECTED_GIT_BRANCH: ${branch}`);
  }
  const ref = APPROVED_PREVIEW_BINDINGS[branch as ApprovedPreviewBranch];
  return { branch, ref, maskedRef: `${ref.slice(0, 4)}...${ref.slice(-4)}` };
}

/**
 * MANDATORY isolation gate — runs before any authenticated mutation. If any assertion
 * fails, the whole UAT must stop (do not mutate an unproven environment).
 */
test("preview binds ONLY to the expected isolated Preview branch", async ({ request }) => {
  const expected = expectedPreviewBinding();
  const res = await request.get("/api/diagnostics/preview-config");
  expect(res.status(), "diagnostic should be reachable through the bypass").toBe(200);
  const body = await res.json();

  expect(body.configurationOk).toBe(true);
  expect(body.target).toBe("preview");
  expect(body.gitBranch).toBe(expected.branch);
  expect(body.supabase.appUsesIsolatedPreview).toBe(true);
  expect(body.supabase.warehouseUsesIsolatedPreview).toBe(true);
  expect(body.supabase.productionRefDetected).toBe(false);
  expect(body.featureFlags.serviceRoleConfigured).toBe(false);
  expect(body.featureFlags.warehousePreview).toBe(true);

  // Both refs must resolve to the exact approved branch binding; never Production
  // and never an arbitrary non-Production ref.
  expect(body.supabase.appProjectRef).toBe(expected.maskedRef);
  expect(body.supabase.warehouseProjectRef).toBe(expected.maskedRef);
  expect(JSON.stringify(body)).not.toContain(PRODUCTION_SUPABASE_REF);
});
