import { describe, expect, it } from "vitest";
import { isAdminEmail } from "./isAdminEmail";

describe("isAdminEmail", () => {
  it("returns false when the allowlist is empty or unset — the safe default", () => {
    expect(isAdminEmail("founder@example.com", "")).toBe(false);
    expect(isAdminEmail("founder@example.com", null)).toBe(false);
    expect(isAdminEmail("founder@example.com", undefined)).toBe(false);
  });

  it("returns false for a null/undefined/empty email regardless of the allowlist", () => {
    expect(isAdminEmail(null, "founder@example.com")).toBe(false);
    expect(isAdminEmail(undefined, "founder@example.com")).toBe(false);
    expect(isAdminEmail("", "founder@example.com")).toBe(false);
  });

  it("matches an exact email present in a single-entry allowlist", () => {
    expect(isAdminEmail("founder@example.com", "founder@example.com")).toBe(true);
  });

  it("matches any email in a comma-separated multi-entry allowlist", () => {
    const list = "founder@example.com, second-admin@example.com,third@example.com";
    expect(isAdminEmail("second-admin@example.com", list)).toBe(true);
    expect(isAdminEmail("third@example.com", list)).toBe(true);
  });

  it("is case-insensitive on both sides", () => {
    expect(isAdminEmail("Founder@Example.com", "founder@example.com")).toBe(true);
    expect(isAdminEmail("founder@example.com", "FOUNDER@EXAMPLE.COM")).toBe(true);
  });

  it("tolerates extra whitespace around allowlist entries", () => {
    expect(isAdminEmail("founder@example.com", "  founder@example.com  ,  other@example.com ")).toBe(true);
  });

  it("rejects an email not present in a non-empty allowlist", () => {
    expect(isAdminEmail("random@example.com", "founder@example.com")).toBe(false);
  });

  it("does not treat a substring match as a match (no partial/fuzzy matching)", () => {
    expect(isAdminEmail("founder@example.com.evil.com", "founder@example.com")).toBe(false);
  });
});
