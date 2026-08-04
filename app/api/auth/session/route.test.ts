import { beforeEach, describe, expect, it, vi } from "vitest";

let configured = true;
const getUser = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => configured }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser, signOut } }),
}));

import { DELETE, GET } from "./route";

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    configured = true;
    getUser.mockReset();
    signOut.mockReset();
  });

  it("returns the server-authenticated user without exposing a session token", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "u@example.com" } }, error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("user-1");
    expect(JSON.stringify(body)).not.toContain("access_token");
  });

  it("returns 401 when the server cookie does not identify a user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "missing" } });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ user: null });
  });

  it("signs out through the server client so cookie-only sessions can be cleared", async () => {
    signOut.mockResolvedValue({ error: null });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});