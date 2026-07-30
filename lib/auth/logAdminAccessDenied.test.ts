import { afterEach, describe, expect, it, vi } from "vitest";
import { logAdminAccessDenied } from "./logAdminAccessDenied";

describe("logAdminAccessDenied", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the outcome and only an internal user id -- never the email or any other PII", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logAdminAccessDenied({ id: "user-123" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, payload] = warnSpy.mock.calls[0];
    expect(message).toContain("access denied");
    expect(payload).toEqual({ hasUser: true, userId: "user-123" });
    expect(JSON.stringify(payload)).not.toMatch(/@/); // no email-shaped string anywhere in the payload
  });

  it("logs hasUser: false, userId: null for an unauthenticated visitor", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logAdminAccessDenied(null);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, payload] = warnSpy.mock.calls[0];
    expect(payload).toEqual({ hasUser: false, userId: null });
  });
});
