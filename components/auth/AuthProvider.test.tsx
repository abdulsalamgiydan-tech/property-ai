// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";

let getSessionMock = vi.fn();
let onAuthStateChangeMock = vi.fn();
let signOutMock = vi.fn();
let configured = true;

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => configured }));
vi.mock("@/lib/auth/access", () => ({ hasFullToolAccess: () => false }));
vi.mock("@/lib/auth/magicLinkRedirectOrigin", () => ({ buildMagicLinkEmailRedirectTo: () => "https://preview.example/auth/callback?next=/find-investment" }));
vi.mock("@/lib/auth/afterSignup", () => ({ notifyEarlyAccessInterest: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signOut: signOutMock,
      signInWithOtp: vi.fn(),
    },
  }),
}));
vi.mock("./EarlyAccessAuthModal", () => ({ EarlyAccessAuthModal: () => null }));

function Probe() {
  const { user, loading } = useAuth();
  return <div>{loading ? "loading" : user ? `signed-in:${user.id}` : "signed-out"}</div>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    configured = true;
    getSessionMock = vi.fn(async () => ({ data: { session: null } }));
    signOutMock = vi.fn(async () => ({ error: null }));
    onAuthStateChangeMock = vi.fn((_callback) => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: "server-user" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as typeof fetch;
  });

  it("keeps a server-cookie user when the browser client reports no local session", async () => {
    let authStateCallback: ((event: string, session: null) => void) | undefined;
    onAuthStateChangeMock = vi.fn((callback) => {
      authStateCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText("signed-in:server-user")).toBeTruthy());
    authStateCallback?.("INITIAL_SESSION", null);
    await waitFor(() => expect(screen.getByText("signed-in:server-user")).toBeTruthy());
  });
});