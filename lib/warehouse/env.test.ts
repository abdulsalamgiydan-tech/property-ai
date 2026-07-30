import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isDataOperationsEnabled,
  isInternalOperationsEnabled,
  isMultiStateResearchEnabled,
  isPublicApiV1Enabled,
  isResearchCopilotEnabled,
  isScenarioLabEnabled,
  isWarehouseConfigured,
  isWarehousePreviewEnabled,
} from "./env";

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

describe("isMultiStateResearchEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when the env var is absent (production-safe default)", () => {
    vi.stubEnv("MULTI_STATE_RESEARCH_ENABLED", undefined as unknown as string);
    expect(isMultiStateResearchEnabled()).toBe(false);
  });

  it("is disabled for any value other than the exact string 'true'", () => {
    vi.stubEnv("MULTI_STATE_RESEARCH_ENABLED", "1");
    expect(isMultiStateResearchEnabled()).toBe(false);
  });

  it("is enabled only when explicitly set to 'true', independent of WAREHOUSE_PREVIEW_ENABLED", () => {
    vi.stubEnv("MULTI_STATE_RESEARCH_ENABLED", "true");
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", undefined as unknown as string);
    expect(isMultiStateResearchEnabled()).toBe(true);
    expect(isWarehousePreviewEnabled()).toBe(false);
  });
});

describe("isDataOperationsEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when the env var is absent (production-safe default)", () => {
    vi.stubEnv("DATA_OPERATIONS_ENABLED", undefined as unknown as string);
    expect(isDataOperationsEnabled()).toBe(false);
  });

  it("is disabled for any value other than the exact string 'true'", () => {
    vi.stubEnv("DATA_OPERATIONS_ENABLED", "1");
    expect(isDataOperationsEnabled()).toBe(false);
  });

  it("is enabled only when explicitly set to 'true', independent of the other flags", () => {
    vi.stubEnv("DATA_OPERATIONS_ENABLED", "true");
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", undefined as unknown as string);
    expect(isDataOperationsEnabled()).toBe(true);
    expect(isWarehousePreviewEnabled()).toBe(false);
  });
});


describe("isInternalOperationsEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when the env var is absent (production-safe default)", () => {
    vi.stubEnv("INTERNAL_OPERATIONS_ENABLED", undefined as unknown as string);
    expect(isInternalOperationsEnabled()).toBe(false);
  });

  it("is disabled for any value other than the exact string 'true'", () => {
    vi.stubEnv("INTERNAL_OPERATIONS_ENABLED", "1");
    expect(isInternalOperationsEnabled()).toBe(false);
  });

  it("is enabled only when explicitly set to 'true', independent of ADMIN_EMAILS", () => {
    vi.stubEnv("INTERNAL_OPERATIONS_ENABLED", "true");
    vi.stubEnv("ADMIN_EMAILS", undefined as unknown as string);
    expect(isInternalOperationsEnabled()).toBe(true);
  });
});

describe("isScenarioLabEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when the env var is absent (production-safe default)", () => {
    vi.stubEnv("SCENARIO_LAB_ENABLED", undefined as unknown as string);
    expect(isScenarioLabEnabled()).toBe(false);
  });

  it("is disabled for any value other than the exact string 'true'", () => {
    vi.stubEnv("SCENARIO_LAB_ENABLED", "yes");
    expect(isScenarioLabEnabled()).toBe(false);
  });

  it("is enabled only when explicitly set to 'true'", () => {
    vi.stubEnv("SCENARIO_LAB_ENABLED", "true");
    expect(isScenarioLabEnabled()).toBe(true);
  });
});

describe("isPublicApiV1Enabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when the env var is absent (production-safe default)", () => {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", undefined as unknown as string);
    expect(isPublicApiV1Enabled()).toBe(false);
  });

  it("is disabled for any value other than the exact string 'true'", () => {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", "1");
    expect(isPublicApiV1Enabled()).toBe(false);
  });

  it("is enabled only when explicitly set to 'true', independent of the internal research preview flag", () => {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", "true");
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", undefined as unknown as string);
    expect(isPublicApiV1Enabled()).toBe(true);
    expect(isWarehousePreviewEnabled()).toBe(false);
  });
});

describe("isResearchCopilotEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when the env var is absent (production-safe default)", () => {
    vi.stubEnv("RESEARCH_COPILOT_ENABLED", undefined as unknown as string);
    expect(isResearchCopilotEnabled()).toBe(false);
  });

  it("is disabled for any value other than the exact string 'true'", () => {
    vi.stubEnv("RESEARCH_COPILOT_ENABLED", "1");
    expect(isResearchCopilotEnabled()).toBe(false);
  });

  it("is enabled only when explicitly set to 'true', independent of the other flags", () => {
    vi.stubEnv("RESEARCH_COPILOT_ENABLED", "true");
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", undefined as unknown as string);
    expect(isResearchCopilotEnabled()).toBe(true);
    expect(isWarehousePreviewEnabled()).toBe(false);
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
