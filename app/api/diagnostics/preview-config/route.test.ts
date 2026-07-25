import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/diagnostics/preview-config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function previewEnv() {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/sprint14-production-readiness");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://property-ai-sprint15-uat-zeebusiness93-2304s-projects.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://lzonauinzatmtytyoems.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "safe-public-anon-key");
    vi.stubEnv("WAREHOUSE_SUPABASE_URL", "https://lzonauinzatmtytyoems.supabase.co");
    vi.stubEnv("WAREHOUSE_SUPABASE_ANON_KEY", "safe-public-warehouse-anon-key");
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "true");
    vi.stubEnv("MULTI_STATE_RESEARCH_ENABLED", "true");
    vi.stubEnv("DATA_OPERATIONS_ENABLED", "true");
    vi.stubEnv("SCENARIO_LAB_ENABLED", "true");
    vi.stubEnv("PUBLIC_API_V1_ENABLED", "true");
  }

  it("returns only redacted Preview configuration derived from live env", async () => {
    previewEnv();
    const { GET } = await import("./route");
    const res = GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.configurationOk).toBe(true);
    expect(body.target).toBe("preview");
    expect(body.commitSha).toBe("abc123");
    expect(body.supabase.appProjectRef).toBe("lzon...oems");
    expect(body.supabase.appUsesWarehouseValidation).toBe(true);
    expect(body.supabase.productionRefDetected).toBe(false);
    expect(body.supabase.anonKeyFingerprint).toHaveLength(12);
    expect(JSON.stringify(body)).not.toContain("safe-public-anon-key");
    expect(JSON.stringify(body)).not.toContain("https://lzonauinzatmtytyoems.supabase.co");
  });

  it("404s in Vercel Production", async () => {
    previewEnv();
    vi.stubEnv("VERCEL_ENV", "production");
    const { GET } = await import("./route");
    const res = GET();
    expect(res.status).toBe(404);
  });

  it("404s if the app Supabase URL points at the Production project", async () => {
    previewEnv();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://oshquaxsloolqucwvigc.supabase.co");
    const { GET } = await import("./route");
    const res = GET();
    expect(res.status).toBe(404);
  });

  it("409s fail-closed when Preview is not configured for warehouse-validation", async () => {
    previewEnv();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://aaaaaaaaaaaaaaaaaaaa.supabase.co");
    const { GET } = await import("./route");
    const res = GET();
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.configurationOk).toBe(false);
  });

  it("does not report Admin or Copilot enabled unless their env vars are explicitly set", async () => {
    previewEnv();
    const { GET } = await import("./route");
    const res = GET();
    const body = await res.json();
    expect(body.featureFlags.researchCopilot).toBe(false);
    expect(body.featureFlags.adminEmailsConfigured).toBe(false);
    expect(body.featureFlags.serviceRoleConfigured).toBe(false);
  });
});
