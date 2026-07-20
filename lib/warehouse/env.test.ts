import { afterEach, describe, expect, it, vi } from "vitest";
import { isWarehouseConfigured, isWarehousePreviewEnabled } from "./env";

describe("isWarehousePreviewEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when the env var is absent (production-safe default)", () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", undefined as unknown as string);
    expect(isWarehousePreviewEnabled()).toBe(false);
  });

  it("is disabled for any value other than the exact string 'true'", () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "1");
    expect(isWarehousePreviewEnabled()).toBe(false);
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "TRUE");
    expect(isWarehousePreviewEnabled()).toBe(false);
  });

  it("is enabled only when explicitly set to 'true'", () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "true");
    expect(isWarehousePreviewEnabled()).toBe(true);
  });
});

describe("isWarehouseConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is false when the warehouse URL/key are not set", () => {
    vi.stubEnv("WAREHOUSE_SUPABASE_URL", undefined as unknown as string);
    vi.stubEnv("WAREHOUSE_SUPABASE_ANON_KEY", undefined as unknown as string);
    expect(isWarehouseConfigured()).toBe(false);
  });

  it("is true only when both URL and key are present", () => {
    vi.stubEnv("WAREHOUSE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("WAREHOUSE_SUPABASE_ANON_KEY", "some-anon-key");
    expect(isWarehouseConfigured()).toBe(true);
  });
});
