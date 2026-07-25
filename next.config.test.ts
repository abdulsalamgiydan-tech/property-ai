import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("security headers (Sprint 14 WS16)", () => {
  it("applies a header set to every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
  });

  it("sets a Content-Security-Policy scoped to this app's real origins", async () => {
    const rules = await nextConfig.headers!();
    const csp = rules[0].headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp!.value).toContain("default-src 'self'");
    expect(csp!.value).toContain("supabase.co");
    expect(csp!.value).toContain("tile.openstreetmap.org");
    expect(csp!.value).toContain("frame-ancestors 'none'");
  });

  it("sets clickjacking, MIME-sniffing, and referrer-leakage protections", async () => {
    const rules = await nextConfig.headers!();
    const headerMap = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(headerMap["X-Frame-Options"]).toBe("DENY");
    expect(headerMap["X-Content-Type-Options"]).toBe("nosniff");
    expect(headerMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("does not grant camera/microphone/geolocation permissions this app never uses", async () => {
    const rules = await nextConfig.headers!();
    const permissions = rules[0].headers.find((h) => h.key === "Permissions-Policy");
    expect(permissions!.value).toContain("camera=()");
    expect(permissions!.value).toContain("microphone=()");
    expect(permissions!.value).toContain("geolocation=()");
  });
});
