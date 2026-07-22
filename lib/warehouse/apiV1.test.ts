import { afterEach, describe, expect, it, vi } from "vitest";
import { apiV1Ok, apiV1Error, apiV1GateOrNotFound } from "./apiV1";

describe("apiV1Ok / apiV1Error — response envelope", () => {
  it("wraps success data with a version and generated_at timestamp", async () => {
    const res = apiV1Ok({ foo: "bar" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ foo: "bar" });
    expect(body.meta.version).toBe("v1");
    expect(new Date(body.meta.generated_at).toString()).not.toBe("Invalid Date");
    expect(body.error).toBeUndefined();
  });

  it("supports a custom status code for success (e.g. no non-2xx-only assumption)", async () => {
    const res = apiV1Ok({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  it("wraps an error message with the same meta shape and never includes a data field", async () => {
    const res = apiV1Error("not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not found");
    expect(body.meta.version).toBe("v1");
    expect(body.data).toBeUndefined();
  });
});

describe("apiV1GateOrNotFound", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a 404 response when PUBLIC_API_V1_ENABLED is not 'true'", async () => {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", undefined as unknown as string);
    vi.stubEnv("WAREHOUSE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("WAREHOUSE_SUPABASE_ANON_KEY", "some-key");
    const gate = apiV1GateOrNotFound();
    expect(gate).not.toBeNull();
    expect(gate!.status).toBe(404);
  });

  it("returns a 404 response when the warehouse client isn't configured, even if the flag is on", async () => {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", "true");
    vi.stubEnv("WAREHOUSE_SUPABASE_URL", undefined as unknown as string);
    vi.stubEnv("WAREHOUSE_SUPABASE_ANON_KEY", undefined as unknown as string);
    const gate = apiV1GateOrNotFound();
    expect(gate).not.toBeNull();
    expect(gate!.status).toBe(404);
  });

  it("returns null (proceed) only when both the flag is 'true' AND the warehouse client is configured", async () => {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", "true");
    vi.stubEnv("WAREHOUSE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("WAREHOUSE_SUPABASE_ANON_KEY", "some-key");
    expect(apiV1GateOrNotFound()).toBeNull();
  });
});
