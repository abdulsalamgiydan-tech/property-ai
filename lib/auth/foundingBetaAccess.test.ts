import { afterEach, describe, expect, it, vi } from "vitest";

let warehousePreview = true;
let mockUser: { id: string; email?: string | null } | null = { id: "user-1", email: "invited@example.com" };

vi.mock("@/lib/warehouse/env", () => ({ isWarehousePreviewEnabled: () => warehousePreview }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));

import { requireFoundingBetaAccess } from "./foundingBetaAccess";

afterEach(() => {
  warehousePreview = true;
  mockUser = { id: "user-1", email: "invited@example.com" };
  vi.unstubAllEnvs();
});

describe("requireFoundingBetaAccess", () => {
  it("requires WAREHOUSE_PREVIEW_ENABLED before auth or beta membership", async () => {
    warehousePreview = false;
    vi.stubEnv("BYOD_FOUNDING_BETA_ENABLED", "true");
    vi.stubEnv("FOUNDING_BETA_EMAILS", "invited@example.com");
    expect(await requireFoundingBetaAccess()).toMatchObject({ ok: false, status: 404 });
  });

  it("requires a signed-in user", async () => {
    mockUser = null;
    vi.stubEnv("BYOD_FOUNDING_BETA_ENABLED", "true");
    vi.stubEnv("FOUNDING_BETA_EMAILS", "invited@example.com");
    expect(await requireFoundingBetaAccess()).toMatchObject({ ok: false, status: 401 });
  });

  it("denies when the founding beta flag is off", async () => {
    vi.stubEnv("BYOD_FOUNDING_BETA_ENABLED", "false");
    vi.stubEnv("FOUNDING_BETA_EMAILS", "invited@example.com");
    expect(await requireFoundingBetaAccess()).toMatchObject({ ok: false, status: 403 });
  });

  it("denies when the allowlist is missing or empty", async () => {
    vi.stubEnv("BYOD_FOUNDING_BETA_ENABLED", "true");
    vi.stubEnv("FOUNDING_BETA_EMAILS", "  ");
    expect(await requireFoundingBetaAccess()).toMatchObject({ ok: false, status: 403 });
  });

  it("denies an authenticated user with no email identity", async () => {
    mockUser = { id: "user-1", email: null };
    vi.stubEnv("BYOD_FOUNDING_BETA_ENABLED", "true");
    vi.stubEnv("FOUNDING_BETA_EMAILS", "invited@example.com");
    expect(await requireFoundingBetaAccess()).toMatchObject({ ok: false, status: 403 });
  });

  it("denies malformed authenticated email even if the malformed value appears in the allowlist", async () => {
    mockUser = { id: "user-1", email: "not-an-email" };
    vi.stubEnv("BYOD_FOUNDING_BETA_ENABLED", "true");
    vi.stubEnv("FOUNDING_BETA_EMAILS", "not-an-email");
    expect(await requireFoundingBetaAccess()).toMatchObject({ ok: false, status: 403 });
  });

  it("ignores malformed allowlist entries", async () => {
    vi.stubEnv("BYOD_FOUNDING_BETA_ENABLED", "true");
    vi.stubEnv("FOUNDING_BETA_EMAILS", "not-an-email, other@example.com");
    expect(await requireFoundingBetaAccess()).toMatchObject({ ok: false, status: 403 });
  });

  it("denies an authenticated user outside the allowlist", async () => {
    vi.stubEnv("BYOD_FOUNDING_BETA_ENABLED", "true");
    vi.stubEnv("FOUNDING_BETA_EMAILS", "other@example.com");
    expect(await requireFoundingBetaAccess()).toMatchObject({ ok: false, status: 403 });
  });

  it("allows an invited user with case and whitespace normalisation", async () => {
    mockUser = { id: "user-1", email: " Invited@Example.COM " };
    vi.stubEnv("BYOD_FOUNDING_BETA_ENABLED", "true");
    vi.stubEnv("FOUNDING_BETA_EMAILS", " invited@example.com ");
    expect(await requireFoundingBetaAccess()).toMatchObject({ ok: true, user: { id: "user-1" } });
  });
});
