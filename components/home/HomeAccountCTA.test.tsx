// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();
const openEarlyAccessModal = vi.fn();

vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => useAuthMock() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { HomeAccountCTA } from "./HomeAccountCTA";

describe("HomeAccountCTA", () => {
  afterEach(cleanup);

  beforeEach(() => {
    openEarlyAccessModal.mockReset();
    useAuthMock.mockReturnValue({ user: null, loading: false, openEarlyAccessModal });
  });

  it("opens the existing sign-in flow for a signed-out visitor", () => {
    render(<HomeAccountCTA />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in / Get started" }));
    expect(openEarlyAccessModal).toHaveBeenCalledOnce();
  });

  it("shows the dashboard action, not a sign-in prompt, for an authenticated user", () => {
    useAuthMock.mockReturnValue({ user: { id: "user-1" }, loading: false, openEarlyAccessModal });
    render(<HomeAccountCTA />);
    expect(screen.getByRole("link", { name: "Open my dashboard" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByText("Sign in / Get started")).toBeNull();
  });

  it("uses a stable neutral state while authentication is resolving", () => {
    useAuthMock.mockReturnValue({ user: null, loading: true, openEarlyAccessModal });
    render(<HomeAccountCTA />);
    expect(screen.getByRole("status", { name: "Checking account status" })).toBeTruthy();
    expect(screen.queryByText("Sign in / Get started")).toBeNull();
  });
});
