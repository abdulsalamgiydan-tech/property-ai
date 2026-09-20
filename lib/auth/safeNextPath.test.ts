import { describe, expect, it } from "vitest";
import { safeInternalNextPath } from "@/lib/auth/safeNextPath";

describe("safeInternalNextPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["  /analyse?tab=cashflow#projection  ", "/analyse?tab=cashflow#projection"],
    ["%2Fstrategy", "/strategy"],
  ])("accepts the internal path %j", (raw, expected) => {
    expect(safeInternalNextPath(raw)).toBe(expected);
  });

  it.each([null, undefined, "", "   "])("defaults an empty value to the home path", (raw) => {
    expect(safeInternalNextPath(raw)).toBe("/");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "%2F%2Fevil.example",
    "/https://evil.example",
  ])("rejects the external redirect form %j", (raw) => {
    expect(safeInternalNextPath(raw)).toBe("/");
  });

  it.each([
    "/\\evil.example",
    "/%5Cevil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/%0A/evil.example",
    "/%0D/evil.example",
    "/\u0000/evil.example",
  ])("rejects URL parser separator ambiguities %j", (raw) => {
    expect(safeInternalNextPath(raw)).toBe("/");
  });

  it("rejects malformed percent encoding", () => {
    expect(safeInternalNextPath("/analyse?suburb=%E0%A4%A")).toBe("/");
  });
});
